import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

EMAIL_TYPES = [
    "initial_outreach",
    "follow_up",
    "interested_response",
    "meeting_request",
    "pricing_followup",
    "delayed_reconnect",
    "re_engagement"
]

def get_ai_provider_status() -> Dict[str, Any]:
    """
    Audit and return the current AI provider configuration status at runtime.
    Identifies whether Gemini AI or the local rule-based template engine is active.
    Never exposes API keys.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
    has_key = bool(gemini_key)
    
    if has_key:
        return {
            "provider": "Google Gemini",
            "provider_key": "google_gemini",
            "model": "gemini-1.5-flash",
            "has_api_key": True,
            "status": "Configured & Active",
            "mode": "AI-Powered Generation",
            "required_env_vars": ["GEMINI_API_KEY"],
            "fallback_available": True,
            "note": "Using live Google Gemini 1.5 Flash model for grounded personalized email drafting."
        }
    else:
        return {
            "provider": "Grounded Template Engine",
            "provider_key": "template_engine",
            "model": "Rule-Based Python Engine v1.0",
            "has_api_key": False,
            "status": "Active (Local Mode)",
            "mode": "Deterministic Grounded Templates",
            "required_env_vars": ["GEMINI_API_KEY"],
            "fallback_available": True,
            "note": "GEMINI_API_KEY is not configured in backend environment. Drafting runs on local deterministic template engine grounded in website audits and verified lead data."
        }


def _generate_template_draft(
    lead: Dict[str, Any],
    email_type: str = "initial_outreach",
    custom_instructions: Optional[str] = None,
    recipient_name: Optional[str] = None
) -> Dict[str, str]:
    """
    Local deterministic rule-based template engine grounded in verified business
    information, Playwright website audit findings, and confirmed budget/scope.
    """
    business_name = lead.get("business_name") or lead.get("name") or "there"
    category = lead.get("category") or "your business"
    address = lead.get("address") or ""
    city = address.split(",")[0].strip() if address else "your area"
    website = lead.get("website") or ""

    audit = lead.get("audit_reports") or {}
    seo = audit.get("seo") or {}
    ux = audit.get("ux") or {}
    tech = audit.get("tech_detected") or {}

    reqs = lead.get("requirements") or {}
    stated_timeline = reqs.get("timeline") or ""
    timeline_type = reqs.get("timeline_type") or "Estimated"
    budget_amt = reqs.get("budget_amount")
    currency = reqs.get("currency") or "INR"
    budget_type = reqs.get("budget_type") or "Not discussed"
    budget_confirmed = reqs.get("budget_is_confirmed", False)
    req_service = reqs.get("requested_service") or ""
    decision_maker = reqs.get("decision_maker")

    # Salutation: Priority: recipient_name -> confirmed decision maker -> contact_name -> Team
    if recipient_name and recipient_name.strip():
        greeting = f"Hi {recipient_name.strip()},"
    elif decision_maker and decision_maker.strip() and decision_maker != "Unknown":
        greeting = f"Hi {decision_maker.strip()},"
    elif lead.get("contact_name") and lead.get("contact_name").strip():
        greeting = f"Hi {lead.get('contact_name').strip()},"
    else:
        greeting = f"Hello {business_name} Team,"

    # Identify primary technical finding from Playwright audit
    findings = []
    if not website:
        findings.append("having no dedicated mobile-friendly website to capture search traffic")
    else:
        if not audit.get("is_https", True):
            findings.append("an unencrypted connection (missing SSL/HTTPS security badge)")
        if not ux.get("isMobileFriendly", True):
            findings.append("a website layout that isn't fully responsive on smartphones")
        if audit.get("response_time_ms", 0) > 3000:
            load_sec = round(audit.get("response_time_ms", 0) / 1000, 1)
            findings.append(f"a slower initial page load time ({load_sec}s)")
        if not tech.get("bookingSystem") and not tech.get("whatsapp"):
            findings.append("no instant online booking or direct WhatsApp call-to-action")
        if not seo.get("description"):
            findings.append("missing Google search meta tags that lower local ranking")

    primary_finding = findings[0] if findings else "opportunities to increase online customer bookings"

    # --- 1. INITIAL OUTREACH ---
    if email_type == "initial_outreach":
        subject = f"Quick question regarding {business_name}'s digital presence"
        if not website:
            body = (
                f"{greeting}\n\n"
                f"I came across {business_name} while researching top {category.lower()} in {city} and noticed you "
                f"currently do not have a dedicated website linked on your Google profile.\n\n"
                f"We specialize in turnkey, high-converting web presences for local businesses that allow customers "
                f"to discover your services and book appointments directly from their phones.\n\n"
                f"Would you be open to a brief 10-minute introductory call this week to see a quick preview mockup of what a modern site for {business_name} would look like?\n\n"
                f"Best regards,\nSales Team\nSales Pipeline Autopilot"
            )
        else:
            body = (
                f"{greeting}\n\n"
                f"I was reviewing {category.lower()} in {city} and took a look at your website ({website.replace('https://', '').replace('http://', '').rstrip('/')}).\n\n"
                f"We ran a preliminary technical audit and noticed {primary_finding}, which often causes potential clients searching on their phones to drop off before contacting you.\n\n"
                f"We recently helped similar businesses fix this and see a measurable increase in client inquiries within 30 days.\n\n"
                f"Would you be open to a 10-minute walkthrough this week to review the audit findings? No pitch or commitment, just actionable ideas for your team.\n\n"
                f"Best regards,\nSales Team\nSales Pipeline Autopilot"
            )

    # --- 2. PERSONALIZED FOLLOW-UP ---
    elif email_type == "follow_up":
        subject = f"Following up on {business_name} digital growth"
        body = (
            f"{greeting}\n\n"
            f"I wanted to follow up on my previous note regarding {business_name}'s web presence and {primary_finding}.\n\n"
            f"I know how busy running a {category.lower()} practice is. If you'd like, I can send over a 2-page summary of our audit recommendations so you can review it at your convenience.\n\n"
            f"Do either Wednesday afternoon or Thursday morning work for a quick check-in?\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # --- 3. RESPONSE TO INTERESTED CUSTOMER ---
    elif email_type == "interested_response":
        service_focus = req_service if req_service else "modern web presence and mobile conversion"
        subject = f"Next steps & project scope for {business_name}"
        body = (
            f"{greeting}\n\n"
            f"Thank you for getting back to us! We're excited to explore how we can support {business_name} with {service_focus}.\n\n"
            f"Based on our analysis, our recommended project scope includes:\n"
            f"• Fast, mobile-first redesign built for smartphone conversions\n"
            f"• Full SSL security configuration and search engine optimization\n"
            f"• Direct customer booking and messaging integration\n\n"
            f"Turnaround is typically 2 to 3 weeks turnkey. When would be a good time for a 15-minute call so we can understand your specific priorities and provide an exact quote?\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # --- 4. MEETING REQUEST ---
    elif email_type == "meeting_request":
        subject = f"Introductory discussion regarding {business_name}"
        body = (
            f"{greeting}\n\n"
            f"Thank you for connecting! We would be delighted to schedule a brief discussion.\n\n"
            f"I have availability this Thursday at 2:00 PM or Friday at 11:00 AM. Would either of those slots suit your schedule?\n\n"
            f"If another time is better for you, please let me know and I will gladly send over a calendar invite.\n\n"
            f"Looking forward to speaking with you!\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # --- 5. PRICING & PROPOSAL FOLLOW-UP ---
    elif email_type == "pricing_followup":
        subject = f"Transparent scope options for {business_name}"
        if budget_confirmed and budget_amt:
            budget_context = f"Following up on our confirmed budget framework of {currency} {budget_amt:,} ({budget_type}):\n\n"
        elif budget_amt:
            budget_context = f"Following up on our estimated budget range around {currency} {budget_amt:,} ({budget_type}):\n\n"
        else:
            budget_context = "Thank you for asking about our pricing. Here is a clear breakdown of our typical engagement packages:\n\n"

        if currency == "INR":
            pkg1 = "₹1,25,000 – ₹2,00,000"
            pkg2 = "₹2,00,000 – ₹3,00,000"
        elif currency == "GBP":
            pkg1 = "£1,200 – £2,000"
            pkg2 = "£2,000 – £3,000"
        elif currency == "EUR":
            pkg1 = "€1,400 – €2,200"
            pkg2 = "€2,200 – €3,200"
        else:
            pkg1 = "$1,500 – $2,500"
            pkg2 = "$2,500 – $3,500"

        body = (
            f"{greeting}\n\n"
            f"{budget_context}"
            f"1. Core Modernization Package ({pkg1}): Complete responsive redesign, mobile UX, SSL security, and core local SEO.\n"
            f"2. Growth & Automation Package ({pkg2}): Everything in Core plus turnkey online appointment booking, WhatsApp chat integration, and CRM lead capture.\n\n"
            f"All projects include a 100% satisfaction review before launch. Would you like us to prepare a tailored proposal for {business_name}?\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # --- 6. DELAYED RECONNECT (3-6 MONTHS FOLLOW-UP) ---
    elif email_type == "delayed_reconnect":
        time_phrase = stated_timeline if (stated_timeline and stated_timeline != "Not stated") else "a few months ago"
        subject = f"Reconnecting regarding {business_name} ({time_phrase} follow-up)"
        body = (
            f"{greeting}\n\n"
            f"I hope business has been thriving over the past few months!\n\n"
            f"When we last touched base, you mentioned timing would be better around now ({time_phrase}, {timeline_type}) to look into {business_name}'s web solutions.\n\n"
            f"I wanted to reach out as planned to see if your team is currently reviewing upcoming digital priorities. We've rolled out several new booking workflows that could be a great fit.\n\n"
            f"Would you be open to a brief 10-minute catch-up sometime this week?\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # --- 7. RE-ENGAGEMENT ---
    elif email_type == "re_engagement":
        subject = f"Checking back in - {business_name}"
        body = (
            f"{greeting}\n\n"
            f"I wanted to reach out one last time to see if improving {business_name}'s customer conversion and mobile presence is still on your radar this quarter.\n\n"
            f"If priorities have shifted, no worries at all! Just wanted to make sure you had our contact info if you decide to revisit this down the road.\n\n"
            f"Wishing your team continued success!\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    else:
        subject = f"Regarding {business_name}"
        body = (
            f"{greeting}\n\n"
            f"I hope you're having a productive week. I'm reaching out regarding {business_name} and your current digital growth objectives.\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )

    # Append custom instructions if present
    if custom_instructions and custom_instructions.strip():
        body += f"\n\n[Custom Focus]: {custom_instructions.strip()}"

    return {
        "subject": subject,
        "body": body
    }


def _generate_gemini_ai_draft(
    lead: Dict[str, Any],
    email_type: str,
    custom_instructions: Optional[str] = None,
    recipient_name: Optional[str] = None,
    api_key: str = ""
) -> Dict[str, str]:
    """
    Generate an AI-powered sales email using Google Gemini SDK (google.genai).
    Grounded in real business audit findings and confirmed requirements.
    """
    from google import genai

    client = genai.Client(api_key=api_key)

    business_name = lead.get("business_name") or lead.get("name") or "Local Business"
    category = lead.get("category") or "business"
    address = lead.get("address") or ""
    website = lead.get("website") or "None"
    audit = lead.get("audit_reports") or {}
    reqs = lead.get("requirements") or {}

    contact_name = recipient_name or reqs.get("decision_maker") or lead.get("contact_name") or "Business Owner"
    budget_amt = reqs.get("budget_amount")
    currency = reqs.get("currency") or "INR"
    budget_type = reqs.get("budget_type") or "Not discussed"
    is_confirmed_budget = reqs.get("budget_is_confirmed", False)
    timeline = reqs.get("timeline") or "Not stated"
    req_service = reqs.get("requested_service") or "Digital Growth & Web Presence"
    deliverables = reqs.get("deliverables") or []

    prompt = f"""You are a professional B2B sales development expert drafting a high-converting, personalized email.

CRITICAL RULES:
1. Ground the email strictly in the verified business facts below. Do NOT hallucinate budget, services, or fake promises.
2. If budget is not confirmed, DO NOT pretend it was confirmed.
3. If timeline is '{timeline}', treat it as '{reqs.get("timeline_type", "Estimated")}'.
4. Keep the email concise (100-180 words), consultative, respectful, and focused on customer value.
5. Provide a compelling call-to-action (10-minute discovery call).
6. Return a JSON object with EXACTLY two string keys: 'subject' and 'body'.

BUSINESS FACTS:
- Business Name: {business_name}
- Category: {category}
- Location: {address}
- Current Website: {website}
- Website Audit Notes: SSL={audit.get("is_https", True)}, MobileFriendly={audit.get("ux", {}).get("isMobileFriendly", True)}, ResponseTime={audit.get("response_time_ms", "N/A")}ms
- Target Contact: {contact_name}
- Requested Service: {req_service}
- Deliverables: {deliverables}
- Budget: {currency} {budget_amt if budget_amt else "Not discussed"} (Type: {budget_type}, Confirmed: {is_confirmed_budget})
- Timeline: {timeline} (Type: {reqs.get("timeline_type", "Estimated")})
- Email Scenario: {email_type}
- Custom Instructions: {custom_instructions or "None"}

Generate the JSON response now:"""

    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=prompt,
    )

    raw_text = response.text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()

    parsed = json.loads(raw_text)
    return {
        "subject": parsed.get("subject", f"Regarding {business_name}"),
        "body": parsed.get("body", "")
    }


def generate_personalized_email_draft(
    lead: Dict[str, Any],
    email_type: str = "initial_outreach",
    custom_instructions: Optional[str] = None,
    recipient_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate a genuinely personalized sales email draft.
    Transparently reports whether live Gemini AI or the grounded template engine was used.
    If Gemini fails, falls back gracefully to grounded templates with full error disclosure.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()

    # 1. If Gemini API key is configured, attempt live AI generation
    if gemini_key:
        try:
            ai_draft = _generate_gemini_ai_draft(
                lead=lead,
                email_type=email_type,
                custom_instructions=custom_instructions,
                recipient_name=recipient_name,
                api_key=gemini_key
            )
            return {
                "subject": ai_draft["subject"],
                "body": ai_draft["body"],
                "email_type": email_type,
                "generated_at": now_iso,
                "is_ai_generated": True,
                "provider": "Google Gemini",
                "model": "gemini-1.5-flash",
                "source_label": "AI-Generated (Google Gemini 1.5 Flash)",
                "fallback_used": False,
                "note": "Draft generated by live Gemini AI model grounded in verified lead data."
            }
        except Exception as e:
            logger.warning(f"Gemini AI generation failed ({type(e).__name__}): {e}. Falling back to template engine.")
            template_draft = _generate_template_draft(
                lead=lead,
                email_type=email_type,
                custom_instructions=custom_instructions,
                recipient_name=recipient_name
            )
            return {
                "subject": template_draft["subject"],
                "body": template_draft["body"],
                "email_type": email_type,
                "generated_at": now_iso,
                "is_ai_generated": False,
                "provider": "Grounded Template Engine",
                "model": "Rule-Based Python Engine v1.0",
                "source_label": "Template Fallback (Gemini call failed)",
                "fallback_used": True,
                "error_message": f"Gemini API error ({type(e).__name__}): {str(e)[:180]}",
                "note": "AI generation encountered an error. A grounded template fallback was generated instead."
            }

    # 2. If Gemini key is not configured, use local deterministic template engine
    template_draft = _generate_template_draft(
        lead=lead,
        email_type=email_type,
        custom_instructions=custom_instructions,
        recipient_name=recipient_name
    )
    return {
        "subject": template_draft["subject"],
        "body": template_draft["body"],
        "email_type": email_type,
        "generated_at": now_iso,
        "is_ai_generated": False,
        "provider": "Grounded Template Engine",
        "model": "Rule-Based Python Engine v1.0",
        "source_label": "Template-Generated (Local Engine)",
        "fallback_used": False,
        "note": "GEMINI_API_KEY is not configured. Generated using local deterministic rule engine."
    }

