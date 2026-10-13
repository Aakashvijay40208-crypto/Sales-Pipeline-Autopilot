import pytest
import os
import time
import json
from unittest.mock import patch, MagicMock
from app import app
from supabase_client import (
    local_db,
    db_save_crm_lead,
    db_upsert_customer_requirements,
    db_get_customer_requirements,
    db_confirm_customer_requirements
)
from email_draft_generator import (
    get_ai_provider_status,
    generate_personalized_email_draft
)
from gmail_client import (
    generate_gmail_auth_url,
    get_gmail_connection_status,
    create_gmail_draft,
    GMAIL_COMPOSE_SCOPE
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def sample_lead():
    lead = {
        "place_id": "test_req_lead_01",
        "business_name": "Apex Dental Clinic",
        "category": "Dentist",
        "phone": "+1555019283",
        "email": "contact@apexdental.com",
        "website": "https://apexdentalclinic.com",
        "address": "123 Main St, New York",
        "lead_score": 85,
        "lifecycle_stage": "proposal"
    }
    saved = db_save_crm_lead(lead)
    return saved


def test_budget_and_scope_save_and_reload(client, sample_lead):
    """Test saving and retrieving budget and project scope with change history."""
    lead_id = sample_lead["id"]

    # 1. Update initial scope (Estimated budget)
    payload = {
        "budget_amount": 3500,
        "currency": "USD",
        "budget_type": "Estimated",
        "budget_notes": "Client requested preliminary quote for full website overhaul",
        "requested_service": "Full Mobile Responsive Redesign",
        "client_requirements": "Fast mobile loading, direct appointment booking, SSL certificate",
        "deliverables": ["Responsive Website", "Online Booking Widget", "Local SEO Setup"],
        "expected_outcome": "Double online appointments within 60 days",
        "constraints": "Must launch before next month",
        "timeline": "3 weeks",
        "timeline_type": "Estimated",
        "decision_maker": "Dr. Sarah Jenkins",
        "decision_maker_role": "Owner / Head Doctor",
        "key_stakeholders": "Clinic Manager",
        "scope_notes": "Prefers modern minimalist blue aesthetic"
    }

    res = client.put(f"/api/crm/leads/{lead_id}/requirements", json=payload)
    assert res.status_code == 200
    saved = res.get_json()

    assert saved["budget_amount"] == 3500
    assert saved["currency"] == "USD"
    assert saved["budget_type"] == "Estimated"
    assert saved["budget_is_confirmed"] is False
    assert saved["requested_service"] == "Full Mobile Responsive Redesign"
    assert saved["decision_maker"] == "Dr. Sarah Jenkins"
    assert len(saved["change_history"]) >= 1

    # 2. Reload via GET
    get_res = client.get(f"/api/crm/leads/{lead_id}/requirements")
    assert get_res.status_code == 200
    reloaded = get_res.get_json()
    assert reloaded["budget_amount"] == 3500
    assert reloaded["budget_is_confirmed"] is False
    assert reloaded["timeline"] == "3 weeks"


def test_mark_as_confirmed_requires_explicit_review(client, sample_lead):
    """Test that Mark as Confirmed enforces explicit review and records confirmation audit."""
    lead_id = sample_lead["id"]

    # Initial estimated state
    client.put(f"/api/crm/leads/{lead_id}/requirements", json={
        "budget_amount": 4200,
        "currency": "USD",
        "budget_type": "Client stated",
        "timeline": "4 weeks",
        "timeline_type": "Estimated"
    })

    # Explicit review and confirmation call
    confirm_payload = {
        "confirm_budget": True,
        "confirm_timeline": True,
        "confirmation_source": "Customer conversation",
        "confirmed_by": "Senior Account Exec",
        "budget_amount": 4200,
        "timeline": "4 weeks"
    }

    res = client.post(f"/api/crm/leads/{lead_id}/requirements/confirm", json=confirm_payload)
    assert res.status_code == 200
    data = res.get_json()
    reqs = data["requirements"]

    assert reqs["budget_is_confirmed"] is True
    assert reqs["budget_type"] == "Client confirmed"
    assert reqs["budget_confirmation_source"] == "Customer conversation"
    assert reqs["budget_confirmed_at"] is not None
    assert reqs["timeline_is_confirmed"] is True
    assert reqs["timeline_type"] == "Client confirmed"

    # Audit history should record the confirmation event
    hist_res = client.get(f"/api/crm/leads/{lead_id}/requirements/history")
    assert hist_res.status_code == 200
    history = hist_res.get_json()
    assert any("Confirmed" in h.get("summary", "") for h in history)


def test_ai_provider_audit_and_transparency(client, sample_lead):
    """Verify that email drafting correctly audits provider and returns transparency metadata."""
    # 1. Check provider status when GEMINI_API_KEY is not set
    with patch.dict(os.environ, {}, clear=True):
        status = get_ai_provider_status()
        assert status["has_api_key"] is False
        assert status["provider"] == "Grounded Template Engine"
        assert "GEMINI_API_KEY" in status["required_env_vars"]

        # Generate draft without API key -> must clearly label as Grounded Template Engine
        draft = generate_personalized_email_draft(sample_lead, email_type="initial_outreach")
        assert draft["is_ai_generated"] is False
        assert draft["provider"] == "Grounded Template Engine"
        assert "Template-Generated" in draft["source_label"]
        assert "subject" in draft and "body" in draft

    # 2. Check /api/api-status route includes ai_provider and gmail status
    res = client.get("/api/api-status")
    assert res.status_code == 200
    api_status = res.get_json()
    assert "ai_provider" in api_status
    assert "gmail" in api_status
    assert api_status["gmail"]["actions_supported"] == ["create_draft"]
    assert api_status["gmail"]["send_supported"] is False  # Explicitly never auto-send!


def test_gmail_oauth_url_and_scope():
    """Verify Gmail OAuth 2.0 URL generation uses strict minimum compose scope and CSRF protection."""
    test_db = {}
    with patch.dict(os.environ, {
        "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "test-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:5000/api/gmail/oauth/callback"
    }):
        auth_data = generate_gmail_auth_url(test_db, return_url="/settings")
        assert auth_data["is_configured"] is True
        assert "auth_url" in auth_data
        assert "state" in auth_data
        assert auth_data["state"] in test_db["gmail_oauth_states"]
        import urllib.parse
        assert GMAIL_COMPOSE_SCOPE in urllib.parse.unquote(auth_data["auth_url"])
        assert "accounts.google.com" in auth_data["auth_url"]


def test_gmail_draft_creation_never_calls_send(client, sample_lead):
    """
    Verify Gmail draft creation:
    1. Fails safely if user is not authorized.
    2. When authorized, calls drafts().create ONLY and NEVER calls send endpoint.
    """
    lead_id = sample_lead["id"]

    # 1. Unauthenticated attempt
    local_db.pop("gmail_credentials", None)
    res = client.post(f"/api/crm/leads/{lead_id}/gmail-draft", json={
        "subject": "Proposal for Apex Dental",
        "body": "Here is our tailored proposal.",
        "to_email": "contact@apexdental.com"
    })
    assert res.status_code == 400
    data = res.get_json()
    assert data.get("requires_auth") is True or "not connected" in data.get("error", "").lower()

    # 2. Authenticated attempt: Mock Google Gmail API drafts endpoint
    mock_token = "mock-access-token-12345"
    local_db["gmail_credentials"] = {
        "access_token": mock_token,
        "expires_at": time.time() + 3600,
        "connected_email": "salesperson@gmail.com"
    }

    with patch("gmail_client.requests.post") as mock_post:
        # Mock successful response from https://gmail.googleapis.com/gmail/v1/users/me/drafts
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "draft_abc123xyz",
            "message": {"id": "msg_789"}
        }
        mock_post.return_value = mock_response

        draft_res = client.post(f"/api/crm/leads/{lead_id}/gmail-draft", json={
            "subject": "Proposal for Apex Dental",
            "body": "Here is our tailored proposal.",
            "to_email": "contact@apexdental.com"
        })

        assert draft_res.status_code == 201
        draft_json = draft_res.get_json()
        assert draft_json["success"] is True
        assert draft_json["status"] == "gmail_draft_created"
        assert draft_json["draft_id"] == "draft_abc123xyz"
        assert "mail.google.com" in draft_json["draft_url"]

        # VERIFY SAFETY: Ensure POST was made to drafts endpoint and NEVER to send
        assert mock_post.called
        call_url = mock_post.call_args[0][0]
        assert "users/me/drafts" in call_url
        assert "send" not in call_url


def test_default_currency_inr_formatting(client):
    """Test that default currency is INR (₹) with Indian number formatting (en-IN) for new leads/installs."""
    fresh_lead = db_save_crm_lead({
        "place_id": "test_fresh_inr_lead_99",
        "business_name": "Delhi Dental Studio",
        "category": "Dentist",
        "lifecycle_stage": "proposal"
    })
    lead_id = fresh_lead["id"]

    # Save requirement with no currency specified
    payload = {
        "budget_amount": 125000,
        "budget_type": "Estimated",
        "requested_service": "Full Modern Website & Booking"
    }

    res = client.put(f"/api/crm/leads/{lead_id}/requirements", json=payload)
    assert res.status_code == 200
    saved = res.get_json()

    # Must default to INR
    assert saved["currency"] == "INR"
    assert saved["budget_amount"] == 125000

    # Retrieve and verify budget string formatting with Indian grouping
    crm_lead = client.get(f"/api/crm/leads/{lead_id}").get_json()
    assert "₹1,25,000" in (crm_lead.get("budget") or "")


def test_gmail_token_refresh_on_401_and_retry_success(client, sample_lead):
    """
    Test that when Gmail API returns HTTP 401 (expired/invalid access token),
    the backend automatically refreshes the access token using the stored refresh token
    and retries the draft creation request once.
    """
    lead_id = sample_lead["id"]

    local_db["gmail_credentials"] = {
        "access_token": "expired-access-token",
        "refresh_token": "valid-refresh-token",
        "expires_at": time.time() + 3600, # Clock might think it's valid, but Google says 401
        "connected_email": "sales@company.com"
    }

    # Sequence of mock POST calls:
    # 1. First drafts call -> 401 Unauthorized
    # 2. Token refresh call -> 200 with new_access_token
    # 3. Retried drafts call -> 200 with draft_created
    call_count = {"draft": 0, "token": 0}

    def mock_post_side_effect(url, **kwargs):
        resp = MagicMock()
        if "oauth2.googleapis.com/token" in url:
            call_count["token"] += 1
            resp.ok = True
            resp.status_code = 200
            resp.json.return_value = {
                "access_token": "freshly-refreshed-token-999",
                "expires_in": 3600
            }
            return resp
        elif "users/me/drafts" in url:
            call_count["draft"] += 1
            if call_count["draft"] == 1:
                # First attempt fails with 401
                resp.ok = False
                resp.status_code = 401
                resp.text = json.dumps({"error": {"code": 401, "message": "Invalid Credentials"}})
                return resp
            else:
                # Second attempt after refresh succeeds
                resp.ok = True
                resp.status_code = 200
                resp.json.return_value = {
                    "id": "draft_retried_success_456",
                    "message": {"id": "msg_456"}
                }
                return resp
        resp.ok = False
        resp.status_code = 500
        return resp

    with patch("gmail_client.requests.post", side_effect=mock_post_side_effect):
        res = client.post(f"/api/crm/leads/{lead_id}/gmail-draft", json={
            "subject": "Refreshed OAuth Draft Test",
            "body": "Testing automated token refresh on 401.",
            "to_email": "test@lead.com"
        })

        assert res.status_code == 201
        data = res.get_json()
        assert data["success"] is True
        assert data["draft_id"] == "draft_retried_success_456"
        assert local_db["gmail_credentials"]["access_token"] == "freshly-refreshed-token-999"
        assert call_count["token"] == 1
        assert call_count["draft"] == 2


def test_gmail_token_refresh_failure_returns_actionable_reconnect(client, sample_lead):
    """
    Test that when token refresh fails (e.g. refresh token revoked by user),
    an actionable error and requires_reconnect is returned to the frontend.
    """
    lead_id = sample_lead["id"]

    local_db["gmail_credentials"] = {
        "access_token": "expired-access-token",
        "refresh_token": "revoked-refresh-token",
        "expires_at": time.time() + 3600,
        "connected_email": "sales@company.com"
    }

    def mock_post_side_effect(url, **kwargs):
        resp = MagicMock()
        if "oauth2.googleapis.com/token" in url:
            resp.ok = False
            resp.status_code = 400
            resp.text = json.dumps({"error": "invalid_grant", "error_description": "Token has been expired or revoked."})
            return resp
        elif "users/me/drafts" in url:
            resp.ok = False
            resp.status_code = 401
            resp.text = json.dumps({"error": {"code": 401, "message": "Invalid Credentials"}})
            return resp
        return resp

    with patch("gmail_client.requests.post", side_effect=mock_post_side_effect):
        res = client.post(f"/api/crm/leads/{lead_id}/gmail-draft", json={
            "subject": "Revoked OAuth Test",
            "body": "Testing revoked refresh token.",
            "to_email": "test@lead.com"
        })

        assert res.status_code == 400
        data = res.get_json()
        assert data["success"] is False
        assert data["requires_reconnect"] is True
        assert "reconnect" in data["error"].lower()


def test_gmail_scope_permission_missing_error(client, sample_lead):
    """Test that missing draft creation scope (403) returns actionable permission error."""
    lead_id = sample_lead["id"]

    local_db["gmail_credentials"] = {
        "access_token": "valid-token-wrong-scope",
        "refresh_token": "valid-refresh-token",
        "expires_at": time.time() + 3600,
        "connected_email": "sales@company.com"
    }

    with patch("gmail_client.requests.post") as mock_post:
        resp = MagicMock()
        resp.ok = False
        resp.status_code = 403
        resp.text = json.dumps({"error": {"code": 403, "message": "ACCESS_TOKEN_SCOPE_INSUFFICIENT"}})
        mock_post.return_value = resp

        res = client.post(f"/api/crm/leads/{lead_id}/gmail-draft", json={
            "subject": "Missing Scope Test",
            "body": "Testing missing scope handling.",
            "to_email": "test@lead.com"
        })

        assert res.status_code == 400
        data = res.get_json()
        assert data["success"] is False
        assert data["requires_reconnect"] is True
        assert "permission to create drafts is missing" in data["error"].lower()


def test_handle_gmail_oauth_callback_preserves_existing_refresh_token():
    """
    Test that handle_gmail_oauth_callback preserves an existing refresh_token
    if Google does not return a new refresh_token on re-authorization.
    """
    from gmail_client import handle_gmail_oauth_callback

    test_db = {
        "gmail_oauth_states": {
            "test_state_123": {"return_url": "/settings"}
        },
        "gmail_credentials": {
            "access_token": "old_access_token",
            "refresh_token": "original_precious_refresh_token",
            "expires_at": time.time() - 100
        }
    }

    with patch("gmail_client._get_oauth_config", return_value={"client_id": "cid", "client_secret": "cs", "redirect_uri": "http://uri"}), \
         patch("gmail_client.requests.post") as mock_post, \
         patch("gmail_client.requests.get") as mock_get:

        # Token exchange returns new access_token, but NO refresh_token (standard Google behavior on second prompt)
        token_resp = MagicMock()
        token_resp.ok = True
        token_resp.json.return_value = {
            "access_token": "brand_new_access_token",
            "expires_in": 3600
            # Note: "refresh_token" is intentionally omitted!
        }
        mock_post.return_value = token_resp

        profile_resp = MagicMock()
        profile_resp.ok = True
        profile_resp.json.return_value = {"emailAddress": "user@gmail.com"}
        mock_get.return_value = profile_resp

        result = handle_gmail_oauth_callback("auth_code_xyz", "test_state_123", test_db)

        assert result["success"] is True
        saved = test_db["gmail_credentials"]
        assert saved["access_token"] == "brand_new_access_token"
        # MUST have preserved the original refresh token!
        assert saved["refresh_token"] == "original_precious_refresh_token"

