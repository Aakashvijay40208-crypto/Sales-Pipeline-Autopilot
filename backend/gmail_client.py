import os
import time
import json
import base64
import secrets
import logging
import requests
from email.mime.text import MIMEText
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Minimum required OAuth scope for creating drafts without sending
GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"


def _get_oauth_config() -> Dict[str, str]:
    """Retrieve Google OAuth credentials from backend environment."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/gmail/oauth/callback").strip()
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri
    }


def is_gmail_oauth_configured() -> bool:
    """Check if Google OAuth client ID and Secret are configured."""
    config = _get_oauth_config()
    return bool(config["client_id"] and config["client_secret"])


def generate_gmail_auth_url(local_db: dict, return_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate Google OAuth 2.0 authorization URL with state token to prevent CSRF.
    Enforces minimum necessary scope: https://www.googleapis.com/auth/gmail.compose.
    """
    config = _get_oauth_config()
    if not is_gmail_oauth_configured():
        return {
            "error": "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.",
            "is_configured": False
        }

    # Generate cryptographically secure state token
    state = secrets.token_urlsafe(32)
    
    if "gmail_oauth_states" not in local_db:
        local_db["gmail_oauth_states"] = {}
        
    local_db["gmail_oauth_states"][state] = {
        "created_at": time.time(),
        "return_url": return_url or "/settings"
    }
    _persist_local_db()

    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "scope": GMAIL_COMPOSE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    
    req = requests.Request("GET", GOOGLE_AUTH_URL, params=params)
    prepared = req.prepare()

    return {
        "auth_url": prepared.url,
        "state": state,
        "is_configured": True
    }


def _persist_local_db():
    """Save local database to disk to persist Gmail credentials across restarts."""
    try:
        from supabase_client import save_local_db
        save_local_db()
    except Exception as e:
        logger.debug(f"Could not persist local_db: {e}")


def handle_gmail_oauth_callback(code: str, state: str, local_db: dict) -> Dict[str, Any]:
    """
    Exchange authorization code for access and refresh tokens.
    Validates state token and stores credentials securely in backend local storage.
    Preserves existing refresh token if Google does not issue a new one on re-authorization.
    """
    config = _get_oauth_config()
    if not is_gmail_oauth_configured():
        return {"error": "Google OAuth credentials missing on server."}

    # Verify state token
    oauth_states = local_db.get("gmail_oauth_states", {})
    if state not in oauth_states:
        return {"error": "Invalid or expired OAuth state parameter (CSRF protection failed)."}

    # Cleanup used state
    return_info = oauth_states.pop(state, {})

    token_data = {
        "code": code,
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "redirect_uri": config["redirect_uri"],
        "grant_type": "authorization_code"
    }

    try:
        res = requests.post(GOOGLE_TOKEN_URL, data=token_data, timeout=15)
        if not res.ok:
            logger.error(f"Failed to exchange Google OAuth code: {res.text}")
            return {"error": f"Token exchange failed: {res.text}"}

        tokens = res.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
        expires_at = time.time() + expires_in

        # Preserve existing refresh token if Google does not return a new one on re-auth
        existing_creds = local_db.get("gmail_credentials") or {}
        preserved_refresh_token = refresh_token or existing_creds.get("refresh_token")

        # Fetch authenticated user's email address using access token
        user_email = "connected_user"
        try:
            profile_res = requests.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
            if profile_res.ok:
                user_email = profile_res.json().get("emailAddress", "connected_user")
        except Exception as e:
            logger.debug(f"Could not fetch user email: {e}")

        # Store tokens securely
        local_db["gmail_credentials"] = {
            "access_token": access_token,
            "refresh_token": preserved_refresh_token,
            "expires_at": expires_at,
            "connected_email": user_email,
            "connected_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scope": tokens.get("scope", GMAIL_COMPOSE_SCOPE),
            "is_revoked": False
        }
        _persist_local_db()

        logger.info(f"Gmail successfully authorized for user: {user_email}")
        return {
            "success": True,
            "connected_email": user_email,
            "return_url": return_info.get("return_url", "/settings")
        }
    except Exception as e:
        logger.error(f"Error exchanging OAuth code: {e}")
        return {"error": f"Failed to complete OAuth authentication: {str(e)}"}


def get_gmail_connection_status(local_db: dict) -> Dict[str, Any]:
    """Check current connection state of Gmail API integration."""
    is_cfg = is_gmail_oauth_configured()
    creds = local_db.get("gmail_credentials", {})
    has_token = bool(creds.get("access_token") or creds.get("refresh_token"))
    is_revoked = bool(creds.get("is_revoked"))

    return {
        "is_configured": is_cfg,
        "is_connected": bool(is_cfg and has_token and not is_revoked),
        "requires_reconnect": bool(is_revoked),
        "connected_email": creds.get("connected_email") if (has_token and not is_revoked) else None,
        "connected_at": creds.get("connected_at") if (has_token and not is_revoked) else None,
        "scope": GMAIL_COMPOSE_SCOPE,
        "actions_supported": ["create_draft"],
        "send_supported": False # Explicitly never auto-send
    }


def disconnect_gmail(local_db: dict) -> Dict[str, Any]:
    """Revoke authorization tokens and disconnect Gmail integration."""
    creds = local_db.get("gmail_credentials", {})
    token = creds.get("refresh_token") or creds.get("access_token")

    if token:
        try:
            requests.post(GOOGLE_REVOKE_URL, params={"token": token}, timeout=10)
        except Exception as e:
            logger.debug(f"Token revocation error (ignoring): {e}")

    if "gmail_credentials" in local_db:
        del local_db["gmail_credentials"]
    _persist_local_db()

    return {"success": True, "message": "Gmail account disconnected successfully."}


def _get_valid_access_token(local_db: dict, force_refresh: bool = False):
    """
    Get active access token, refreshing securely if expired or forced.
    Returns tuple: (access_token: Optional[str], error_code: Optional[str])
    """
    creds = local_db.get("gmail_credentials")
    if not creds:
        return None, "NOT_CONNECTED"

    if creds.get("is_revoked") and not force_refresh:
        return None, "AUTH_EXPIRED"

    access_token = creds.get("access_token")
    expires_at = creds.get("expires_at", 0)
    refresh_token = creds.get("refresh_token")

    # If not forcing refresh and token has more than 60 seconds left, use it
    if not force_refresh and access_token and (expires_at - time.time()) > 60 and not creds.get("is_revoked"):
        return access_token, None

    # Refresh using refresh_token
    if not refresh_token:
        logger.warning("No refresh token stored in credentials.")
        return None, "NO_REFRESH_TOKEN"

    config = _get_oauth_config()
    refresh_data = {
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }

    try:
        res = requests.post(GOOGLE_TOKEN_URL, data=refresh_data, timeout=15)
        if res.ok:
            tokens = res.json()
            new_access_token = tokens.get("access_token")
            expires_in = tokens.get("expires_in", 3600)
            creds["access_token"] = new_access_token
            creds["expires_at"] = time.time() + expires_in
            if tokens.get("refresh_token"):
                creds["refresh_token"] = tokens.get("refresh_token")
            creds["is_revoked"] = False
            local_db["gmail_credentials"] = creds
            _persist_local_db()
            logger.info("Successfully refreshed Google OAuth access token.")
            return new_access_token, None
        else:
            err_text = res.text
            logger.error(f"Failed to refresh Google token (HTTP {res.status_code}): {err_text}")
            if "invalid_grant" in err_text.lower() or res.status_code in [400, 401]:
                creds["is_revoked"] = True
                local_db["gmail_credentials"] = creds
                _persist_local_db()
                return None, "AUTH_EXPIRED"
            return None, "REFRESH_FAILED"
    except Exception as e:
        logger.error(f"Error during Google token refresh: {e}")
        return None, "NETWORK_ERROR"


def create_gmail_draft(
    to_email: str,
    subject: str,
    body: str,
    local_db: dict,
    lead_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a draft directly in the authenticated user's Gmail Drafts folder.
    SECURITY & SAFETY GUARANTEES:
    - Uses users.drafts.create endpoint ONLY.
    - NEVER calls users.messages.send or users.drafts.send.
    - NEVER automatically delivers emails.
    - Handles automatic OAuth token refresh on expiration or HTTP 401.
    - Returns Gmail draft ID and direct web link to open in Gmail.
    """
    access_token, err_code = _get_valid_access_token(local_db, force_refresh=False)
    if not access_token:
        if err_code == "NOT_CONNECTED":
            return {
                "success": False,
                "error": "Gmail is not connected. Connect your Google account in Settings.",
                "requires_reconnect": True,
                "error_code": "NOT_CONNECTED"
            }
        else:
            return {
                "success": False,
                "error": "Gmail session expired. Reconnect your Google account.",
                "requires_reconnect": True,
                "error_code": "AUTH_EXPIRED"
            }

    # Construct standard RFC 2822 email message
    message = MIMEText(body, "plain", "utf-8")
    if to_email and to_email.strip():
        message["to"] = to_email.strip()
    message["subject"] = subject or f"Follow-up with {lead_name or 'Client'}"

    # Base64url encode as required by Gmail API
    raw_bytes = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    draft_payload = {
        "message": {
            "raw": raw_bytes
        }
    }

    url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    try:
        res = requests.post(url, headers=headers, json=draft_payload, timeout=20)

        # Handle 401 Unauthorized by attempting automatic token refresh and single retry
        if res.status_code == 401:
            logger.warning("Gmail API returned HTTP 401 Unauthorized. Attempting token refresh...")
            new_access_token, refresh_err = _get_valid_access_token(local_db, force_refresh=True)
            if new_access_token:
                logger.info("Retrying Gmail draft creation with newly refreshed access token...")
                headers["Authorization"] = f"Bearer {new_access_token}"
                res = requests.post(url, headers=headers, json=draft_payload, timeout=20)
            else:
                return {
                    "success": False,
                    "error": "Gmail session expired. Reconnect your Google account.",
                    "requires_reconnect": True,
                    "error_code": "AUTH_EXPIRED"
                }

        # Check response after potential retry
        if not res.ok:
            status_code = res.status_code
            err_text = res.text.lower()
            logger.error(f"Gmail API error: {status_code} - {res.text}")

            if status_code == 401:
                return {
                    "success": False,
                    "error": "Gmail session expired. Reconnect your Google account.",
                    "requires_reconnect": True,
                    "error_code": "AUTH_EXPIRED"
                }
            elif status_code == 403:
                if "scope" in err_text or "insufficient" in err_text:
                    return {
                        "success": False,
                        "error": "Gmail is connected, but permission to create drafts is missing. Reconnect and grant the required permission.",
                        "requires_reconnect": True,
                        "error_code": "PERMISSION_MISSING"
                    }
                elif "disabled" in err_text or "has not been used" in err_text:
                    return {
                        "success": False,
                        "error": "Gmail API is not enabled in your Google Cloud Project. Please enable the Gmail API in Google Cloud Console.",
                        "requires_reconnect": False,
                        "error_code": "API_NOT_ENABLED"
                    }
                else:
                    return {
                        "success": False,
                        "error": "Gmail API access denied (403). Ensure required draft creation permissions are granted.",
                        "requires_reconnect": True,
                        "error_code": "FORBIDDEN"
                    }
            else:
                return {
                    "success": False,
                    "error": f"Gmail API refused draft creation: HTTP {status_code}",
                    "error_code": f"HTTP_{status_code}",
                    "requires_reconnect": False
                }

        data = res.json()
        draft_id = data.get("id")
        msg_id = data.get("message", {}).get("id")

        # Constructed reliable web Gmail drafts URL
        draft_url = "https://mail.google.com/mail/u/0/#drafts"

        logger.info(f"Successfully created Gmail draft id={draft_id} for {lead_name}")

        return {
            "success": True,
            "status": "gmail_draft_created",
            "draft_id": draft_id,
            "message_id": msg_id,
            "draft_url": draft_url,
            "recipient": to_email,
            "subject": subject,
            "note": "Gmail draft created successfully."
        }
    except Exception as e:
        logger.error(f"Exception creating Gmail draft: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Failed to create Gmail draft: {str(e)}",
            "requires_reconnect": False
        }

