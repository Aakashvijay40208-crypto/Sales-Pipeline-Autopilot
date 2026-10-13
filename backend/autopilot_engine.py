import os
import re
import json
import logging
from datetime import datetime, timezone, timedelta
from api_manager import get_api_key

logger = logging.getLogger(__name__)

# Standard CRM lifecycle stages
LIFECYCLE_STAGES = [
    "Discovered",
    "Qualified",
    "Outreach Ready",
    "Contacted",
    "Interested",
    "Follow-up Later",
    "Meeting Requested",
    "Opportunity",
    "Won",
    "Lost",
    "Opted Out"
]

# Classification Categories
CLASSIFICATIONS = [
    "Interested",
    "Not Interested",
    "Follow-up Later",
    "Meeting Request",
    "Opt-out",
    "Needs Human Review"
]


def parse_relative_timeframe(text: str, base_time: datetime = None) -> tuple[str, str]:
    """
    Parse natural language timeframes (e.g. '5 months', 'next quarter', 'in 2 weeks')
    and return (extracted_phrase, iso_due_date).
    """
    base = base_time or datetime.now(timezone.utc)
    text_lower = text.lower()

    # Regex patterns for time expressions
    # e.g. "5 months", "five months", "in 3 weeks", "2 days"
    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12
    }

    # Check months: e.g. "5 months", "five months", "several months", "couple of months"
    month_match = re.search(r'(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|couple of|few)\s+months?', text_lower)
    if month_match:
        val_str = month_match.group(1)
        if val_str in ("several", "few"):
            months = 3
        elif val_str == "couple of":
            months = 2
        elif val_str.isdigit():
            months = int(val_str)
        else:
            months = word_to_num.get(val_str, 1)
        due = base + timedelta(days=months * 30)
        return f"{months} months", due.isoformat()

    # Check weeks: e.g. "3 weeks" or "next week"
    week_match = re.search(r'(\d+|one|two|three|four|five|couple of|few)\s+weeks?', text_lower)
    if week_match:
        val_str = week_match.group(1)
        weeks = 2 if val_str in ("couple of", "few") else (int(val_str) if val_str.isdigit() else word_to_num.get(val_str, 1))
        due = base + timedelta(days=weeks * 7)
        return f"{weeks} weeks", due.isoformat()

    if "next week" in text_lower:
        due = base + timedelta(days=7)
        return "next week", due.isoformat()

    # Next quarter
    if "next quarter" in text_lower or ("q" in text_lower and "next" in text_lower):
        due = base + timedelta(days=90)
        return "next quarter", due.isoformat()

    # Next month
    if "next month" in text_lower:
        due = base + timedelta(days=30)
        return "next month", due.isoformat()

    # Tomorrow
    if "tomorrow" in text_lower:
        due = base + timedelta(days=1)
        return "tomorrow", due.isoformat()

    # Days
    day_match = re.search(r'(\d+|one|two|three|four|five)\s+days?', text_lower)
    if day_match:
        val_str = day_match.group(1)
        days = int(val_str) if val_str.isdigit() else word_to_num.get(val_str, 1)
        due = base + timedelta(days=days)
        return f"{days} days", due.isoformat()

    # Specific month names mentioned (e.g. "contact in November")
    month_names = ["january", "february", "march", "april", "may", "june",
                   "july", "august", "september", "october", "november", "december"]
    for i, m_name in enumerate(month_names, start=1):
        if m_name in text_lower:
            current_month = base.month
            target_year = base.year if i > current_month else base.year + 1
            due = datetime(target_year, i, 15, 12, 0, 0, tzinfo=timezone.utc)
            return m_name.capitalize(), due.isoformat()

    # Default fallback for follow-up later if no specific timeframe found
    due = base + timedelta(days=30)
    return "30 days (default)", due.isoformat()


def classify_customer_reply(reply_text: str, lead_context: dict = None, conversation_history: list = None) -> dict:
    """
    Classify customer reply text grounded in real context into one of:
    - Interested
    - Not Interested
    - Follow-up Later
    - Meeting Request
    - Opt-out
    - Needs Human Review (if contradictory or ambiguous)

    Returns structured analysis with explanation, extracted requirements,
    proposed CRM transition, follow-up date calculation, and an email draft.
    """
    if not reply_text or not reply_text.strip():
        return {
            "primary_classification": "Needs Human Review",
            "confidence": 0.5,
            "explanation": "Empty or whitespace-only reply received.",
            "extracted_requirements": {},
            "recommended_action": "Review message manually",
            "proposed_stage": "Outreach Ready",
            "requires_human_approval": True,
            "suggested_email_draft": None
        }

    lead_context = lead_context or {}
    text_lower = reply_text.strip().lower()

    # 1. OPT-OUT CHECK (Highest priority - suppression enforcement)
    opt_out_keywords = [
        "unsubscribe", "remove me", "stop contacting", "stop emailing",
        "do not contact", "don't contact", "take me off", "leave me alone",
        "remove from list", "opt out", "opt-out", "delete my data"
    ]
    if any(kw in text_lower for kw in opt_out_keywords):
        return {
            "primary_classification": "Opt-out",
            "confidence": 0.98,
            "explanation": "Customer explicitly requested to be removed or to cease communications. Outreach must be halted immediately.",
            "extracted_requirements": {"opt_out_requested": True},
            "detected_timeframe": None,
            "proposed_follow_up_date": None,
            "recommended_action": "Immediately suppress contact. Cancel all future outreach.",
            "proposed_stage": "Opted Out",
            "requires_human_approval": False,
            "suggested_email_draft": None
        }

    # 2. CONTRADICTION / AMBIGUITY CHECK (Checked before positive/negative to avoid false certainty)
    ambiguous_patterns = [
        "maybe yes maybe no", "maybe", "not sure", "depends on", "uncertain",
        "undecided", "conflicted", "might or might not", "hard to say",
        "can't say", "could be", "no guarantee", "not decided"
    ]
    if any(p in text_lower for p in ambiguous_patterns) and not any(kw in text_lower for kw in ["definitely interested", "send invoice", "ready to start"]):
        return {
            "primary_classification": "Needs Human Review",
            "confidence": 0.72,
            "explanation": "Customer reply expresses conditional, uncertain, or conflicting intent. Human review recommended.",
            "extracted_requirements": {"ambiguity_flagged": True},
            "detected_timeframe": None,
            "proposed_follow_up_date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "recommended_action": "Salesperson should read customer reply directly before initiating follow-up.",
            "proposed_stage": "Outreach Ready",
            "requires_human_approval": True,
            "suggested_email_draft": None
        }

    # 3. MEETING REQUEST CHECK
    meeting_keywords = [
        "schedule a call", "book a meeting", "hop on a call", "set up a call",
        "calendar link", "when are you free", "let's meet", "zoom call",
        "demo call", "phone call", "calendly", "available on tuesday",
        "available tomorrow", "can we talk"
    ]
    if any(kw in text_lower for kw in meeting_keywords):
        return {
            "primary_classification": "Meeting Request",
            "confidence": 0.94,
            "explanation": "Customer requested a direct call, calendar link, or meeting discussion.",
            "extracted_requirements": {"meeting_requested": True},
            "detected_timeframe": "Immediate",
            "proposed_follow_up_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "recommended_action": "Coordinate meeting scheduling immediately with calendar link or direct times.",
            "proposed_stage": "Meeting Requested",
            "requires_human_approval": True,
            "suggested_email_draft": _generate_meeting_coordination_draft(lead_context, reply_text)
        }

    # 4. FOLLOW-UP LATER CHECK
    follow_up_keywords = [
        "contact me in", "reach out in", "contact us again", "try again in",
        "not right now", "not now", "follow up in", "next quarter", "next month",
        "in five months", "in 5 months", "in a few months", "check back",
        "reach out later", "busy right now", "maybe later", "revisit in",
        "several months", "couple of months"
    ]
    if any(kw in text_lower for kw in follow_up_keywords):
        timeframe_phrase, due_iso = parse_relative_timeframe(reply_text)
        return {
            "primary_classification": "Follow-up Later",
            "confidence": 0.95,
            "explanation": f"Customer indicated interest in future communication after {timeframe_phrase}.",
            "extracted_requirements": {"timing_preference": timeframe_phrase},
            "detected_timeframe": timeframe_phrase,
            "proposed_follow_up_date": due_iso,
            "recommended_action": f"Set reminder for {timeframe_phrase} and save contextual check-in draft.",
            "proposed_stage": "Follow-up Later",
            "requires_human_approval": False,
            "suggested_email_draft": _generate_followup_later_draft(lead_context, timeframe_phrase)
        }

    # 5. NOT INTERESTED / OBJECTION CHECK
    not_interested_keywords = [
        "not interested", "no thank you", "no thanks", "pass on this",
        "already have", "existing provider", "happy with our current",
        "not looking for", "don't need this", "do not need this", "we have an agency"
    ]
    if any(kw in text_lower for kw in not_interested_keywords):
        has_provider = "already have" in text_lower or "existing provider" in text_lower or "current agency" in text_lower
        explanation = "Customer indicated they already have an active provider." if has_provider else "Customer declined service offering."
        return {
            "primary_classification": "Not Interested",
            "confidence": 0.92,
            "explanation": explanation,
            "extracted_requirements": {
                "objection": "Existing provider" if has_provider else "Not interested"
            },
            "detected_timeframe": None,
            "proposed_follow_up_date": None,
            "recommended_action": "Record objection in CRM. Close lead or pause outreach without scheduling emails.",
            "proposed_stage": "Lost",
            "requires_human_approval": False,
            "suggested_email_draft": None
        }

    # 6. INTERESTED / INFORMATION / PRICING REQUEST
    interested_keywords = [
        "interested", "tell me more", "send pricing", "how much", "cost",
        "send details", "what are your rates", "can you help", "sounds good",
        "let's discuss", "send a proposal", "portfolio", "quote"
    ]
    matched_interested = [kw for kw in interested_keywords if kw in text_lower]
    if matched_interested:
        is_pricing = any(x in text_lower for x in ["pricing", "cost", "how much", "rates", "quote"])
        is_strong = "definitely" in text_lower or len(matched_interested) >= 2 or "send over" in text_lower
        confidence = 0.95 if is_strong else (0.89 if is_pricing else 0.85)
        return {
            "primary_classification": "Interested",
            "confidence": confidence,
            "explanation": "Customer expressed positive interest" + (" and requested pricing details." if is_pricing else " in learning more about services."),
            "extracted_requirements": {
                "pricing_inquiry": is_pricing,
                "interest_stated": True
            },
            "detected_timeframe": "Immediate",
            "proposed_follow_up_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "recommended_action": "Send tailored scope overview, service breakdown, and invitation to consult.",
            "proposed_stage": "Interested",
            "requires_human_approval": True,
            "suggested_email_draft": _generate_interested_reply_draft(lead_context, is_pricing)
        }

    # 7. FALLBACK: AMBIGUOUS / NEEDS HUMAN REVIEW
    return {
        "primary_classification": "Needs Human Review",
        "confidence": 0.58,
        "explanation": "Reply intent does not distinctly match common positive or negative patterns. Human review recommended.",
        "extracted_requirements": {},
        "detected_timeframe": None,
        "proposed_follow_up_date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "recommended_action": "Salesperson should read reply directly before initiating follow-up.",
        "proposed_stage": "Outreach Ready",
        "requires_human_approval": True,
        "suggested_email_draft": None
    }


def _generate_followup_later_draft(lead_context: dict, timeframe: str) -> dict:
    name = lead_context.get("name") or lead_context.get("business_name") or "there"
    services = lead_context.get("recommended_services") or ["website & digital solutions"]
    service_str = ", ".join(services[:2]) if isinstance(services, list) else str(services)

    subject = f"Reconnecting regarding {name} ({timeframe} follow-up)"
    body = (
        f"Hi {name},\n\n"
        f"I hope you've had a productive past {timeframe}.\n\n"
        f"When we last spoke, you mentioned it would be better to reconnect around this time regarding "
        f"your {service_str}.\n\n"
        f"I wanted to quickly check in to see if timing is better now to explore how we can support your growth. "
        f"Would you be open to a brief 10-minute touchpoint this week?\n\n"
        f"Best regards,\nSales Team\nSales Pipeline Autopilot"
    )
    return {"subject": subject, "body": body}


def _generate_interested_reply_draft(lead_context: dict, is_pricing: bool = False) -> dict:
    name = lead_context.get("name") or lead_context.get("business_name") or "there"
    currency = lead_context.get("currency") or "INR"
    subject = f"Next steps & project details for {name}"
    
    if is_pricing:
        if currency == "INR":
            range_modern = "₹1,25,000 – ₹2,50,000"
            range_seo = "₹40,000 – ₹95,000"
        elif currency == "GBP":
            range_modern = "£1,200 – £2,500"
            range_seo = "£400 – £900"
        elif currency == "EUR":
            range_modern = "€1,400 – €2,800"
            range_seo = "€450 – €1,000"
        else:
            range_modern = "$1,500 – $3,500"
            range_seo = "$500 – $1,200"

        body = (
            f"Hi {name},\n\n"
            f"Thank you for getting back to us! Here is a transparent overview of our project scopes:\n\n"
            f"• Full Website Modernization & Mobile Optimization: Typically ranges from {range_modern} depending on features.\n"
            f"• SEO & Local Conversion Setup: {range_seo} setup.\n"
            f"• Turnkey Booking & WhatsApp CTA Integration: Included in our core package.\n\n"
            f"We can tailor a specific package based on your exact requirements. When would be a convenient time for a quick 15-minute call to discuss your goals?\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )
    else:
        body = (
            f"Hi {name},\n\n"
            f"Thank you for your reply! We would love to share a few customized ideas on how we can optimize your digital presence and drive more qualified client inquiries.\n\n"
            f"Would tomorrow afternoon or later this week work for a brief 15-minute introductory call?\n\n"
            f"Looking forward to speaking with you!\n\n"
            f"Best regards,\nSales Team\nSales Pipeline Autopilot"
        )
    return {"subject": subject, "body": body}


def _generate_meeting_coordination_draft(lead_context: dict, reply_text: str) -> dict:
    name = lead_context.get("name") or lead_context.get("business_name") or "there"
    subject = f"Confirming our discussion - {name}"
    body = (
        f"Hi {name},\n\n"
        f"Fantastic! We would be delighted to connect.\n\n"
        f"I have availability this Thursday at 2:00 PM EST or Friday at 11:00 AM EST. Do either of those work for your schedule?\n\n"
        f"Alternatively, feel free to reply with what times suit you best and we will send over a calendar invite.\n\n"
        f"Best regards,\nSales Team\nSales Pipeline Autopilot"
    )
    return {"subject": subject, "body": body}


def generate_customer_chat_response(
    customer_message: str,
    lead_info: dict,
    history: list = None,
    requirements: dict = None
) -> dict:
    """
    Grounded customer chat response generator for the private link chat.
    Answers client questions regarding pricing, scope, deliverables, and timelines.
    Flags custom/out-of-bounds requests for human review.
    """
    msg_lower = customer_message.lower().strip()
    business_name = lead_info.get("name") or lead_info.get("business_name") or "your business"
    
    extracted_reqs = {}
    requires_human_review = False
    
    # Check for budget mentions
    budget_match = re.search(r'\$?(\d+[\d,]*\s*(?:k|thousand|dollars)?)', msg_lower)
    if "budget" in msg_lower and budget_match:
        extracted_reqs["budget"] = budget_match.group(0)

    # Check for timeline mentions
    if "timeline" in msg_lower or "by when" in msg_lower or "deadline" in msg_lower:
        time_match = re.search(r'(in \d+ weeks?|by \w+|next month|\d+ months?)', msg_lower)
        if time_match:
            extracted_reqs["timeline"] = time_match.group(0)

    # Check for discounts, complex contracts, custom negotiations
    if any(x in msg_lower for x in ["discount", "half price", "contract terms", "guarantee 100%", "legal agreement", "legal contract"]):
        requires_human_review = True
        reply_text = (
            f"Thank you for asking about that. For custom commercial terms or specialized contractual agreements, "
            f"I have escalated your inquiry directly to our senior project lead. They will review this and follow up "
            f"with you directly with full details."
        )
        return {
            "reply": reply_text,
            "requires_human_review": requires_human_review,
            "extracted_requirements": extracted_reqs,
            "intent": "custom_contract_or_discount"
        }

    # Pricing inquiries
    if any(x in msg_lower for x in ["pricing", "cost", "how much", "rate", "quote", "price"]):
        chat_currency = (
            (requirements or {}).get("currency")
            or (lead_info.get("requirements") or {}).get("currency")
            or lead_info.get("currency")
            or "INR"
        )
        if chat_currency == "INR":
            pkg_core = "₹1,25,000 – ₹2,50,000"
            pkg_enh = "₹40,000 – ₹95,000"
            pkg_turnkey = "₹2,80,000"
        elif chat_currency == "GBP":
            pkg_core = "£1,200 – £2,400"
            pkg_enh = "£400 – £950"
            pkg_turnkey = "£2,800"
        elif chat_currency == "EUR":
            pkg_core = "€1,400 – €2,800"
            pkg_enh = "€450 – €1,000"
            pkg_turnkey = "€3,200"
        else:
            pkg_core = "$1,500 – $3,000"
            pkg_enh = "$500 – $1,200"
            pkg_turnkey = "$3,500"

        reply_text = (
            f"Our project packages for {business_name} are tailored to your needs:\n\n"
            f"• Core Website Development & Redesign: {pkg_core} (includes responsive UI, SSL security, and SEO setup).\n"
            f"• Advanced Enhancements: {pkg_enh} (direct WhatsApp CTA, automated booking calendar, and CRM integration).\n"
            f"• Full Digital Overhaul: Starting at {pkg_turnkey} turnkey.\n\n"
            f"Would you like us to put together a precise proposal tailored to your specific service offerings?"
        )
        return {
            "reply": reply_text,
            "requires_human_review": False,
            "extracted_requirements": {"pricing_inquired": True},
            "intent": "pricing_inquiry"
        }

    # Timeline inquiries
    if any(x in msg_lower for x in ["how long", "timeline", "duration", "turnaround", "launch date"]):
        reply_text = (
            f"Standard turnaround time for modern website redesigns and conversion setups is typically "
            f"2 to 3 weeks from kickoff. For expedited projects, we can often deliver a preliminary staging build in 7 to 10 business days."
        )
        return {
            "reply": reply_text,
            "requires_human_review": False,
            "extracted_requirements": {"timeline_inquired": True},
            "intent": "timeline_inquiry"
        }

    # Deliverables / Services inquiries
    if any(x in msg_lower for x in ["deliverable", "features", "include", "seo", "mobile", "booking"]):
        reply_text = (
            f"Every project includes:\n"
            f"1. High-speed, mobile-first responsive design\n"
            f"2. Complete on-page SEO (meta titles, schema, sitemaps)\n"
            f"3. SSL/HTTPS security hardening\n"
            f"4. Direct customer CTAs (WhatsApp chat & appointment booking)\n"
            f"5. Analytics & conversion event tracking\n\n"
            f"Is there a specific feature or tool you'd like us to prioritize for {business_name}?"
        )
        return {
            "reply": reply_text,
            "requires_human_review": False,
            "extracted_requirements": {"deliverables_inquired": True},
            "intent": "deliverables_inquiry"
        }

    # General consultation / Next steps
    reply_text = (
        f"Thank you for sharing your thoughts. Our sales and engineering team are reviewing your notes for {business_name}. "
        f"Feel free to ask any further questions regarding deliverables, technology stack, or scheduling a kickoff call!"
    )
    return {
        "reply": reply_text,
        "requires_human_review": False,
        "extracted_requirements": extracted_reqs,
        "intent": "general_inquiry"
    }
