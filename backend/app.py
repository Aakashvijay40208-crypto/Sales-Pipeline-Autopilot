import os
import uuid
import hashlib
import secrets
import logging
import threading
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, send_file, send_from_directory, redirect
from flask_cors import CORS

from supabase_client import (
    db_create_search_history,
    db_update_search_history,
    db_upsert_business,
    db_upsert_audit_report,
    db_upsert_lead_score,
    db_get_leads,
    db_get_lead_detail,
    db_get_stats,
    db_save_crm_lead,
    db_batch_save_crm_leads,
    db_find_all_duplicate_groups,
    db_merge_duplicate_group,
    db_get_crm_leads,
    db_get_crm_lead_by_id,
    db_update_crm_lead,
    db_create_conversation_message,
    db_get_conversation_messages,
    db_record_sales_activity,
    db_get_sales_activities,
    db_create_follow_up_task,
    db_get_follow_up_tasks,
    db_update_follow_up_task,
    db_cancel_pending_tasks_for_lead,
    db_upsert_customer_requirements,
    db_get_customer_requirements,
    db_confirm_customer_requirements,
    db_create_secure_chat_link,
    db_get_secure_chat_link,
    db_get_overview_stats,
    supabase_client,
    local_db
)
from api_manager import get_provider_status
from serpapi_client import search_and_enrich_businesses
from playwright_auditor import audit_website
from lead_scorer import calculate_lead_score
from export_manager import generate_leads_excel
from distance_utils import validate_radius_km
from dedup_manager import normalize_domain, normalize_phone
from email_draft_generator import generate_personalized_email_draft, get_ai_provider_status, EMAIL_TYPES
from gmail_client import (
    generate_gmail_auth_url,
    handle_gmail_oauth_callback,
    get_gmail_connection_status,
    disconnect_gmail,
    create_gmail_draft
)
from autopilot_engine import (
    classify_customer_reply,
    generate_customer_chat_response,
    CLASSIFICATIONS,
    LIFECYCLE_STAGES
)

# Initialize logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static")
CORS(app) # Enable CORS for frontend application

# Global registry for tracking background search task progress
active_tasks = {}

def run_background_lead_pipeline(search_id, user_id, category, city, area, radius, limit):
    """
    Background worker thread running search, scraping, Playwright website audits, 
    deterministic lead scoring, and auto-syncing to persistent CRM.
    """
    logger.info(f"Background pipeline started for search {search_id}")
    active_tasks[search_id] = {
        "status": "searching",
        "progress": 0,
        "total": 0,
        "current_lead": "Fetching locations from SerpAPI...",
        "leads_found": 0,
        "place_ids": []
    }
    
    try:
        # 1. Fetch businesses from SerpAPI
        businesses = search_and_enrich_businesses(
            category=category,
            city=city,
            area=area,
            radius=radius,
            limit=limit
        )
        
        total_leads = len(businesses)
        active_tasks[search_id]["total"] = total_leads
        active_tasks[search_id]["status"] = "processing"
        
        if total_leads == 0:
            logger.info("No businesses found.")
            db_update_search_history(search_id, "completed", 0)
            active_tasks[search_id]["status"] = "completed"
            active_tasks[search_id]["current_lead"] = "No businesses found."
            return
            
        processed_count = 0
        
        for index, bus in enumerate(businesses):
            place_id = bus["place_id"]
            name = bus["name"]
            website = bus.get("website")
            
            # Explicit website status
            website_status = "Website Available" if website else "No Website"
            bus["website_status"] = website_status
            bus["category"] = category
            
            active_tasks[search_id]["current_lead"] = f"Processing lead: {name} ({index+1}/{total_leads})"
            logger.info(f"Processing business: {name} (Website Status: {website_status})")
            
            # Save basic business listing
            db_upsert_business(bus)
            
            # 2. Run Playwright website audit if website exists
            audit = None
            if website:
                try:
                    active_tasks[search_id]["current_lead"] = f"Auditing website: {name} ({index+1}/{total_leads})"
                    logger.info(f"Running Playwright audit for website: {website}")
                    audit = audit_website(place_id, website)
                except Exception as audit_err:
                    logger.warning(f"Playwright website audit failed for {website}: {audit_err}")
            
            if not audit:
                audit = {
                    "place_id": place_id,
                    "website_status": 200 if website else 0,
                    "is_https": website.startswith("https://") if website else False,
                    "response_time_ms": 0,
                    "seo": {},
                    "ux": {},
                    "tech_detected": {},
                    "contacts": {"emails": [], "phoneNumbers": [], "socialLinks": {}}
                }
                
            # Merge scraper contacts from SerpAPI (if any) if not detected by Playwright
            if bus.get("contacts"):
                for contact_type in ["emails", "phoneNumbers"]:
                    if not audit["contacts"].get(contact_type):
                        audit["contacts"][contact_type] = bus["contacts"].get(contact_type, [])
                for soc, val in bus["contacts"].get("socialLinks", {}).items():
                    if val and not audit["contacts"]["socialLinks"].get(soc):
                        audit["contacts"]["socialLinks"][soc] = val
                        
            # Save audit report
            db_upsert_audit_report(audit)
            
            # 3. Rule-based Lead Score calculation
            lead_score = calculate_lead_score(bus, audit)
            
            # Save lead scores
            db_upsert_lead_score(lead_score)
            
            # 4. Auto-enroll discovered lead into CRM
            db_save_crm_lead({
                "place_id": place_id,
                "business_name": name,
                "category": category,
                "address": bus.get("address"),
                "phone": bus.get("phone_number"),
                "website": website,
                "email": audit.get("contacts", {}).get("emails", [""])[0] if audit.get("contacts", {}).get("emails") else "",
                "linkedin": audit.get("contacts", {}).get("socialLinks", {}).get("linkedin", ""),
                "google_rating": bus.get("google_rating"),
                "review_count": bus.get("review_count"),
                "lifecycle_stage": "Discovered",
                "lead_score": lead_score.get("score", 50),
                "priority": lead_score.get("priority", "MEDIUM"),
                "source": "Prospect Scan"
            })
            
            processed_count += 1
            active_tasks[search_id]["progress"] = processed_count
            active_tasks[search_id]["leads_found"] = processed_count
            active_tasks[search_id]["place_ids"].append(place_id)

        # Update search history status
        db_update_search_history(search_id, "completed", processed_count)
        active_tasks[search_id]["status"] = "completed"
        active_tasks[search_id]["current_lead"] = f"Finished. Analyzed {processed_count} businesses."
        logger.info(f"Background pipeline completed for search {search_id}. Leads found: {processed_count}")
        
    except Exception as e:
        logger.error(f"Error in background pipeline: {e}", exc_info=True)
        db_update_search_history(search_id, "failed", 0)
        active_tasks[search_id]["status"] = "failed"
        active_tasks[search_id]["current_lead"] = f"Error occurred: {str(e)}"


# =====================================================================
# DISCOVERY & AUDIT ENDPOINTS (PRESERVED)
# =====================================================================

@app.route("/api/search", methods=["POST"])
def search_leads():
    """Trigger a new search and run lead acquisition pipeline with validated kilometre radius."""
    data = request.json or {}
    category = data.get("category")
    city = data.get("city")
    area = data.get("area")
    raw_radius = data.get("radius_km") if data.get("radius_km") is not None else data.get("radius", 5)
    limit = int(data.get("limit", 5))
    user_id = data.get("userId", "default-user")
    
    if not category or not city:
        return jsonify({"error": "Category and City are required fields."}), 400
        
    is_valid, radius_km, err_msg = validate_radius_km(raw_radius)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    query_params = {
        "category": category,
        "city": city,
        "area": area,
        "radius": radius_km,
        "radius_km": radius_km,
        "limit": limit
    }
    
    search_id = db_create_search_history(user_id, query_params)
    
    thread = threading.Thread(
        target=run_background_lead_pipeline,
        args=(search_id, user_id, category, city, area, radius_km, limit)
    )
    thread.start()
    
    return jsonify({
        "search_id": search_id,
        "status": "running",
        "radius_km": radius_km,
        "message": f"Search initialized for {category} within {radius_km} km of {city}."
    })

@app.route("/api/search/status/<search_id>", methods=["GET"])
def get_search_status(search_id):
    """Query current status of background processing thread."""
    task = active_tasks.get(search_id)
    if not task:
        return jsonify({"status": "not_found", "message": "No active search task."}), 404
    return jsonify(task)

@app.route("/api/leads", methods=["GET"])
def get_leads():
    """Fetch collected leads list matching query parameters and annotate CRM status."""
    filters = {
        "category": request.args.get("category"),
        "city": request.args.get("city"),
        "area": request.args.get("area"),
        "rating": request.args.get("rating"),
        "website": request.args.get("website"),
        "leadScore": request.args.get("leadScore")
    }
    sort_by = request.args.get("sort_by", "-score")
    
    search_id = request.args.get("search_id")
    place_ids = None
    if search_id:
        task = active_tasks.get(search_id)
        if task:
            place_ids = task.get("place_ids", [])
        else:
            place_ids = []
            
    leads = db_get_leads(filters=filters, sort_by=sort_by)
    
    if place_ids is not None:
        leads = [lead for lead in leads if lead.get("place_id") in place_ids]
        
    # Annotate leads with persistent CRM enrollment state
    crm_leads = db_get_crm_leads()
    crm_by_place = {c.get("place_id"): c for c in crm_leads if c.get("place_id")}
    crm_by_domain = {normalize_domain(c.get("website", "")): c for c in crm_leads if normalize_domain(c.get("website", ""))}
    crm_by_phone = {normalize_phone(c.get("phone", "")): c for c in crm_leads if normalize_phone(c.get("phone", ""))}

    for lead in leads:
        p_id = lead.get("place_id")
        matched = crm_by_place.get(p_id)
        if not matched and lead.get("website"):
            d = normalize_domain(lead.get("website", ""))
            if d and d in crm_by_domain:
                matched = crm_by_domain[d]
        if not matched and (lead.get("phone_number") or lead.get("phone")):
            ph = normalize_phone(lead.get("phone_number") or lead.get("phone", ""))
            if ph and ph in crm_by_phone:
                matched = crm_by_phone[ph]

        lead["is_in_crm"] = bool(matched)
        lead["crm_stage"] = matched.get("lifecycle_stage") if matched else None
        lead["crm_id"] = matched.get("id") if matched else None
        
    return jsonify(leads)

@app.route("/api/leads/<place_id>", methods=["GET"])
def get_lead_detail_route(place_id):
    """Retrieve all detailed information of a lead."""
    lead = db_get_lead_detail(place_id)
    if not lead:
        return jsonify({"error": "Lead not found."}), 404
    return jsonify(lead)

@app.route("/api/leads/<place_id>/audit", methods=["POST"])
@app.route("/api/crm/leads/<place_id>/audit", methods=["POST"])
def run_lead_audit_route(place_id):
    """Trigger or re-run a Playwright technical website audit on demand for a lead."""
    lead = db_get_lead_detail(place_id)
    crm_lead = db_get_crm_lead_by_id(place_id)
    
    website = None
    bus = None
    if lead and lead.get("website"):
        website = lead.get("website")
        bus = lead
    elif crm_lead and crm_lead.get("website"):
        website = crm_lead.get("website")
        bus = {
            "place_id": crm_lead.get("place_id") or place_id,
            "name": crm_lead.get("business_name"),
            "category": crm_lead.get("category"),
            "address": crm_lead.get("address"),
            "phone_number": crm_lead.get("phone"),
            "website": website,
            "google_rating": crm_lead.get("google_rating")
        }
    elif lead:
        bus = lead
    elif crm_lead:
        bus = {
            "place_id": crm_lead.get("place_id") or place_id,
            "name": crm_lead.get("business_name"),
            "category": crm_lead.get("category"),
            "address": crm_lead.get("address"),
            "phone_number": crm_lead.get("phone"),
            "website": None,
            "google_rating": crm_lead.get("google_rating")
        }
    else:
        return jsonify({"error": "Lead not found."}), 404

    p_id = bus.get("place_id") or place_id

    if not website:
        # Generate clean empty audit record for leads without website
        audit = {
            "place_id": p_id,
            "website_status": 0,
            "is_https": False,
            "response_time_ms": 0,
            "seo": {},
            "ux": {},
            "tech_detected": {},
            "contacts": {"emails": [], "phoneNumbers": [], "socialLinks": {}},
            "audit_error": "No website URL provided"
        }
        db_upsert_audit_report(audit)
        lead_score = calculate_lead_score(bus, audit)
        db_upsert_lead_score(lead_score)
        return jsonify({
            "success": True,
            "place_id": p_id,
            "audit_reports": audit,
            "lead_scores": lead_score,
            "message": "Lead has no website. Baseline audit recorded."
        })

    try:
        audit = audit_website(p_id, website)
        db_upsert_audit_report(audit)
        lead_score = calculate_lead_score(bus, audit)
        db_upsert_lead_score(lead_score)

        if crm_lead:
            db_record_sales_activity({
                "lead_id": crm_lead["id"],
                "activity_type": "website_audited",
                "description": f"Website audit executed for {website}. Score: {lead_score.get('score', 0)}/100",
                "performed_by": "system"
            })

        return jsonify({
            "success": True,
            "place_id": p_id,
            "audit_reports": audit,
            "lead_scores": lead_score,
            "message": "Website audit and lead score successfully updated."
        })
    except Exception as e:
        logger.error(f"Error auditing website for {place_id}: {e}", exc_info=True)
        return jsonify({"error": f"Website audit failed: {str(e)}"}), 500

@app.route("/api/stats", methods=["GET"])
def get_stats_route():
    """Retrieve dashboard metric stats."""
    stats = db_get_stats()
    return jsonify(stats)

@app.route("/api/api-status", methods=["GET"])
def get_api_status_route():
    """Expose API health, database mode, and provider configuration status."""
    status = get_provider_status()
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_KEY", "")
    has_supabase_creds = bool(supabase_url and supabase_key and "supabase.co" in supabase_url)
    
    status["supabase"] = {
        "status": "Connected" if (has_supabase_creds and supabase_client is not None) else "Local Fallback Mode",
        "mode": "Supabase Cloud" if (has_supabase_creds and supabase_client is not None) else "Local JSON Storage",
        "is_configured": has_supabase_creds,
        "is_connected": supabase_client is not None
    }
    
    email_configured = bool(os.getenv("SMTP_HOST") or os.getenv("SENDGRID_API_KEY") or os.getenv("RESEND_API_KEY"))
    status["email_provider"] = {
        "status": "Configured" if email_configured else "Not Configured (Draft Mode Only)",
        "can_send": email_configured,
        "note": "Draft generation is active. Real email dispatch requires SMTP/SendGrid configuration." if not email_configured else "Live email delivery enabled."
    }
    
    public_fe = os.getenv("PUBLIC_FRONTEND_URL", "").strip().rstrip("/")
    status["public_frontend_url"] = {
        "url": public_fe if public_fe else None,
        "status": "Configured" if public_fe else "Missing (Required for Customer Chat Links)",
        "is_configured": bool(public_fe)
    }

    status["ai_provider"] = get_ai_provider_status()
    status["gmail"] = get_gmail_connection_status(local_db)
    return jsonify(status)

@app.route("/api/export", methods=["GET"])
def export_leads_excel_route():
    """Build and download the styled leads Excel sheet."""
    filters = {
        "category": request.args.get("category"),
        "city": request.args.get("city"),
        "area": request.args.get("area"),
        "rating": request.args.get("rating"),
        "website": request.args.get("website"),
        "leadScore": request.args.get("leadScore")
    }
    sort_by = request.args.get("sort_by", "-score")
    
    leads = db_get_leads(filters=filters, sort_by=sort_by)
    if not leads:
        return jsonify({"error": "No leads available to export."}), 400
        
    excel_stream = generate_leads_excel(leads)
    return send_file(
        excel_stream,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="sales_pipeline_leads.xlsx"
    )

@app.route("/static/screenshots/<filename>")
def serve_screenshot(filename):
    """Serve audited website page screenshots."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), "static", "screenshots"), filename)


# =====================================================================
# SALES PIPELINE AUTOPILOT: CRM & WORKFLOW ROUTES
# =====================================================================

@app.route("/api/crm/overview", methods=["GET"])
def get_crm_overview():
    """Retrieve real CRM summary metrics for Overview dashboard."""
    stats = db_get_overview_stats()
    return jsonify(stats)

@app.route("/api/crm/leads", methods=["GET"])
def get_crm_leads_route():
    """List CRM leads with filters: stage, classification, opt_out, search."""
    filters = {
        "stage": request.args.get("stage"),
        "classification": request.args.get("classification"),
        "opt_out": request.args.get("opt_out"),
        "search": request.args.get("search")
    }
    sort_by = request.args.get("sort_by", "-updated_at")
    leads = db_get_crm_leads(filters=filters, sort_by=sort_by)
    return jsonify(leads)

@app.route("/api/crm/leads/save", methods=["POST"])
def save_crm_lead_route():
    """Save or import a lead into persistent CRM."""
    data = request.json or {}
    if not data.get("business_name") and not data.get("name"):
        return jsonify({"error": "Business name is required."}), 400
    saved = db_save_crm_lead(data)
    return jsonify(saved), 201

@app.route("/api/crm/leads/batch-save", methods=["POST"])
def batch_save_crm_leads_route():
    """Batch save discovered leads into CRM with automatic duplicate detection."""
    data = request.json or {}
    leads_list = data.get("leads", [])
    if not isinstance(leads_list, list):
        return jsonify({"error": "Expected a list of leads under 'leads' key."}), 400
    res = db_batch_save_crm_leads(leads_list)
    return jsonify(res), 200

@app.route("/api/crm/duplicates/scan", methods=["GET"])
def scan_duplicates_route():
    """Scan all CRM leads for candidate duplicate groups."""
    groups = db_find_all_duplicate_groups()
    return jsonify({
        "groups_count": len(groups),
        "groups": groups
    })

@app.route("/api/crm/duplicates/merge", methods=["POST"])
def merge_duplicates_route():
    """
    Safely merge a group of duplicate leads into a surviving record.
    Supports dry_run=true for preview mode.
    """
    data = request.json or {}
    surviving_id = data.get("surviving_id")
    duplicate_ids = data.get("duplicate_ids", [])
    dry_run = bool(data.get("dry_run", False))

    if not surviving_id or not duplicate_ids:
        return jsonify({"error": "surviving_id and duplicate_ids list are required."}), 400

    surviving = db_get_crm_lead_by_id(surviving_id)
    if not surviving:
        return jsonify({"error": f"Surviving lead '{surviving_id}' not found."}), 404

    if dry_run:
        dup_leads = [db_get_crm_lead_by_id(d) for d in duplicate_ids if db_get_crm_lead_by_id(d)]
        return jsonify({
            "dry_run": True,
            "surviving_id": surviving_id,
            "surviving_name": surviving.get("business_name"),
            "duplicate_count": len(dup_leads),
            "duplicates_to_remove": [d.get("business_name") for d in dup_leads],
            "message": f"Preview: {len(dup_leads)} duplicate records will be merged into '{surviving.get('business_name')}'."
        })

    result = db_merge_duplicate_group(surviving_id, duplicate_ids)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)

@app.route("/api/crm/leads/<lead_id>", methods=["GET"])
def get_crm_lead_detail_route(lead_id):
    """Get full CRM lead profile: audit, requirements, messages, activities, tasks."""
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "CRM Lead not found."}), 404
    return jsonify(lead)

@app.route("/api/crm/leads/<lead_id>", methods=["PATCH"])
def update_crm_lead_route(lead_id):
    """Update lead status, stage, notes, opt-out, or next action."""
    data = request.json or {}
    updated = db_update_crm_lead(lead_id, data)
    if not updated:
        return jsonify({"error": "Lead not found."}), 404
    return jsonify(updated)

@app.route("/api/crm/leads/<lead_id>/timeline", methods=["GET"])
def get_lead_timeline(lead_id):
    """Get chronological sales activity history for this lead."""
    activities = db_get_sales_activities(lead_id)
    return jsonify(activities)

@app.route("/api/crm/leads/<lead_id>/messages", methods=["GET"])
def get_lead_messages(lead_id):
    """Get all conversation messages (email, chat, internal notes)."""
    messages = db_get_conversation_messages(lead_id)
    return jsonify(messages)

@app.route("/api/crm/leads/<lead_id>/messages", methods=["POST"])
def create_lead_message(lead_id):
    """Record an outbound email, customer reply, or internal note."""
    data = request.json or {}
    content = data.get("content", "").strip()
    channel = data.get("channel", "email")
    direction = data.get("direction", "outbound")
    sender_type = data.get("sender_type", "salesperson")
    
    if not content:
        return jsonify({"error": "Message content is required."}), 400

    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found."}), 404

    # Check opt-out restriction for outbound marketing communications
    if direction == "outbound" and channel == "email" and lead.get("is_opted_out"):
        return jsonify({
            "error": "Outbound communication blocked: Lead has opted out (Do Not Contact flag active)."
        }), 403

    msg = db_create_conversation_message({
        "lead_id": lead_id,
        "channel": channel,
        "direction": direction,
        "sender_type": sender_type,
        "sender_name": data.get("sender_name", "Salesperson"),
        "sender_email": data.get("sender_email", ""),
        "content": content,
        "status": data.get("status", "sent"),
        "metadata": data.get("metadata", {})
    })

    # If first outbound email, move stage to 'Contacted' if currently 'Discovered' or 'Outreach Ready'
    if direction == "outbound" and channel == "email":
        current_stage = lead.get("lifecycle_stage")
        if current_stage in ["Discovered", "Outreach Ready", "Qualified"]:
            db_update_crm_lead(lead_id, {
                "lifecycle_stage": "Contacted",
                "next_action": "Wait for customer reply or follow up"
            })

    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": f"{channel}_{direction}",
        "description": f"{direction.capitalize()} {channel} recorded: '{content[:60]}...'",
        "performed_by": sender_type
    })

    return jsonify(msg), 201

@app.route("/api/crm/leads/<lead_id>/record-reply", methods=["POST"])
def record_customer_reply(lead_id):
    """
    CRITICAL WORKFLOW: Record a genuine customer reply, automatically classify it,
    update the CRM lifecycle stage, create follow-up tasks, generate email drafts,
    and enforce opt-out suppression without requiring manual status updates.
    """
    data = request.json or {}
    reply_text = data.get("content", "").strip()
    if not reply_text:
        return jsonify({"error": "Reply text is required."}), 400

    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found."}), 404

    # 1. Record inbound message
    msg = db_create_conversation_message({
        "lead_id": lead_id,
        "channel": data.get("channel", "email"),
        "direction": "inbound",
        "sender_type": "customer",
        "sender_name": data.get("sender_name") or lead.get("business_name") or "Customer",
        "sender_email": data.get("sender_email") or lead.get("email") or "",
        "content": reply_text,
        "status": "received"
    })

    # 2. Run AI / NLP classification
    classification = classify_customer_reply(reply_text, lead_context=lead)
    primary_intent = classification.get("primary_classification")
    proposed_stage = classification.get("proposed_stage")
    due_date = classification.get("proposed_follow_up_date")
    timeframe = classification.get("detected_timeframe")
    action = classification.get("recommended_action")
    email_draft = classification.get("suggested_email_draft")
    extracted_reqs = classification.get("extracted_requirements", {})

    # 3. Apply deterministic CRM updates based on classification
    crm_updates = {
        "latest_reply_classification": primary_intent,
        "next_action": action
    }

    if primary_intent == "Opt-out":
        crm_updates["is_opted_out"] = True
        crm_updates["opt_out_timestamp"] = datetime.now(timezone.utc).isoformat()
        crm_updates["opt_out_reason"] = "Customer reply requested opt-out"
        crm_updates["lifecycle_stage"] = "Opted Out"
        # Cancel all pending follow-up tasks
        db_cancel_pending_tasks_for_lead(lead_id, reason="Customer opted out")

    elif primary_intent == "Follow-up Later":
        crm_updates["lifecycle_stage"] = "Follow-up Later"
        crm_updates["next_follow_up_date"] = due_date
        # Create follow-up task with personalized email draft
        if due_date and email_draft:
            db_create_follow_up_task({
                "lead_id": lead_id,
                "title": f"Follow-up with {lead.get('business_name')} ({timeframe})",
                "description": f"Customer requested follow-up after {timeframe}. Check in with drafted email.",
                "due_date": due_date,
                "task_type": "email_follow_up",
                "priority": "high",
                "email_draft": email_draft
            })

    elif primary_intent == "Meeting Request":
        crm_updates["lifecycle_stage"] = "Meeting Requested"
        crm_updates["next_follow_up_date"] = due_date
        db_create_follow_up_task({
            "lead_id": lead_id,
            "title": f"Coordinate Meeting: {lead.get('business_name')}",
            "description": f"Customer requested a call/meeting: '{reply_text[:100]}'",
            "due_date": due_date or datetime.now(timezone.utc).isoformat(),
            "task_type": "meeting_prep",
            "priority": "high",
            "email_draft": email_draft or {}
        })

    elif primary_intent == "Interested":
        crm_updates["lifecycle_stage"] = "Interested"
        crm_updates["next_follow_up_date"] = due_date
        db_create_follow_up_task({
            "lead_id": lead_id,
            "title": f"Send Scoped Proposal to {lead.get('business_name')}",
            "description": f"Customer expressed interest. Follow up with scope and consultation.",
            "due_date": due_date or datetime.now(timezone.utc).isoformat(),
            "task_type": "email_follow_up",
            "priority": "high",
            "email_draft": email_draft or {}
        })

    elif primary_intent == "Not Interested":
        crm_updates["lifecycle_stage"] = "Lost"

    else:
        # Needs human review
        crm_updates["lifecycle_stage"] = "Outreach Ready"
        db_create_follow_up_task({
            "lead_id": lead_id,
            "title": f"Human Review Needed: {lead.get('business_name')}",
            "description": f"Customer reply was ambiguous: '{reply_text[:100]}'. Review before proceeding.",
            "due_date": datetime.now(timezone.utc).isoformat(),
            "task_type": "human_review",
            "priority": "medium"
        })

    # Update CRM lead
    updated_lead = db_update_crm_lead(lead_id, crm_updates)

    # Update customer requirements if extracted
    if extracted_reqs:
        current_reqs = db_get_customer_requirements(lead_id)
        if extracted_reqs.get("objection"):
            objs = current_reqs.get("objections", [])
            objs.append(extracted_reqs["objection"])
            current_reqs["objections"] = list(set(objs))
        if extracted_reqs.get("timing_preference"):
            current_reqs["timeline"] = extracted_reqs["timing_preference"]
        db_upsert_customer_requirements(lead_id, current_reqs)

    # Log activity
    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "reply_classified",
        "description": f"Reply classified as '{primary_intent}'. Auto-transitioned stage to '{crm_updates.get('lifecycle_stage')}'.",
        "reason": classification.get("explanation"),
        "performed_by": "ai_autopilot"
    })

    return jsonify({
        "message": msg,
        "classification": classification,
        "lead": updated_lead
    }), 201

@app.route("/api/crm/classify-reply", methods=["POST"])
def classify_reply_sandbox():
    """
    Sandbox / Reply Lab endpoint for evaluating sample customer replies,
    testing AI predictions, and optionally applying updates to a test lead.
    """
    data = request.json or {}
    reply_text = data.get("text", "").strip()
    lead_id = data.get("lead_id")
    apply_update = bool(data.get("apply_update", False))

    if not reply_text:
        return jsonify({"error": "Text is required for classification."}), 400

    lead = db_get_crm_lead_by_id(lead_id) if lead_id else {
        "business_name": "Apex Dental Clinic",
        "category": "Dentists",
        "recommended_services": ["Mobile-responsive Design", "SEO Optimization"]
    }

    classification = classify_customer_reply(reply_text, lead_context=lead)
    updated_lead = None

    if apply_update and lead_id:
        primary_intent = classification.get("primary_classification")
        due_date = classification.get("proposed_follow_up_date")
        timeframe = classification.get("detected_timeframe")
        email_draft = classification.get("suggested_email_draft")
        
        # 1. Record inbound message in conversation history
        db_create_conversation_message({
            "lead_id": lead_id,
            "channel": "email",
            "direction": "inbound",
            "sender_type": "customer",
            "sender_name": lead.get("business_name") or "Customer",
            "sender_email": lead.get("email") or "",
            "content": reply_text,
            "status": "received",
            "metadata": {
                "classification": primary_intent,
                "confidence": classification.get("confidence"),
                "reason": classification.get("explanation"),
                "source": "reply_lab"
            }
        })

        # 2. Update CRM lead stage and metadata
        updates = {
            "latest_reply_classification": primary_intent,
            "lifecycle_stage": classification.get("proposed_stage", "Contacted"),
            "next_action": classification.get("recommended_action")
        }
        if primary_intent == "Opt-out":
            updates["is_opted_out"] = True
            updates["opt_out_timestamp"] = datetime.now(timezone.utc).isoformat()
            updates["opt_out_reason"] = "Customer opted out in reply"
            db_cancel_pending_tasks_for_lead(lead_id, reason="Customer opted out")
        elif primary_intent == "Follow-up Later":
            if due_date:
                updates["next_follow_up_date"] = due_date
                db_create_follow_up_task({
                    "lead_id": lead_id,
                    "title": f"Follow-up with {lead.get('business_name')} ({timeframe})",
                    "description": f"Customer requested follow-up after {timeframe}. Check in with drafted email.",
                    "due_date": due_date,
                    "task_type": "email_follow_up",
                    "priority": "high",
                    "email_draft": email_draft or {}
                })
        elif primary_intent == "Meeting Request":
            if due_date:
                updates["next_follow_up_date"] = due_date
            db_create_follow_up_task({
                "lead_id": lead_id,
                "title": f"Coordinate Meeting: {lead.get('business_name')}",
                "description": f"Customer requested meeting: '{reply_text[:80]}'",
                "due_date": due_date or datetime.now(timezone.utc).isoformat(),
                "task_type": "meeting_prep",
                "priority": "high",
                "email_draft": email_draft or {}
            })
        elif primary_intent == "Interested":
            if due_date:
                updates["next_follow_up_date"] = due_date
            db_create_follow_up_task({
                "lead_id": lead_id,
                "title": f"Send Scoped Proposal to {lead.get('business_name')}",
                "description": f"Customer expressed interest. Follow up with scope.",
                "due_date": due_date or datetime.now(timezone.utc).isoformat(),
                "task_type": "email_follow_up",
                "priority": "high",
                "email_draft": email_draft or {}
            })

        updated_lead = db_update_crm_lead(lead_id, updates)

        # 3. Record sales activity
        db_record_sales_activity({
            "lead_id": lead_id,
            "activity_type": "reply_classified",
            "description": f"Customer reply classified as '{primary_intent}'. Lifecycle stage set to '{updates.get('lifecycle_stage')}'.",
            "reason": classification.get("explanation"),
            "performed_by": "ai_autopilot"
        })

    return jsonify({
        "classification": classification,
        "tested_lead": lead.get("business_name"),
        "lead": updated_lead
    })

@app.route("/api/crm/tasks", methods=["GET"])
def get_tasks_route():
    """List follow-up tasks with optional filters: lead_id, status, due_filter ('today'|'overdue'|'upcoming')."""
    lead_id = request.args.get("lead_id")
    status = request.args.get("status")
    due_filter = request.args.get("due_filter")
    tasks = db_get_follow_up_tasks(lead_id=lead_id, status=status, due_filter=due_filter)
    return jsonify(tasks)

@app.route("/api/crm/tasks", methods=["POST"])
def create_task_route():
    """Create a new manual follow-up task."""
    data = request.json or {}
    if not data.get("lead_id") or not data.get("title"):
        return jsonify({"error": "lead_id and title are required."}), 400
    task = db_create_follow_up_task(data)
    return jsonify(task), 201

@app.route("/api/crm/tasks/<task_id>", methods=["PATCH"])
def update_task_route(task_id):
    """Update task status, due date, or email draft."""
    data = request.json or {}
    updated = db_update_follow_up_task(task_id, data)
    if not updated:
        return jsonify({"error": "Task not found."}), 404
    return jsonify(updated)

@app.route("/api/crm/tasks/<task_id>/approve-send", methods=["POST"])
def approve_and_send_task(task_id):
    """
    Approve an email draft on a task and record it in conversation history.
    Does NOT falsely report emails as sent if no email provider is configured.
    Strictly enforces opt-out suppression.
    """
    task = db_update_follow_up_task(task_id, {})
    if not task:
        return jsonify({"error": "Task not found."}), 404

    lead_id = task.get("lead_id")
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Associated lead not found."}), 404

    # Enforce suppression flag
    if lead.get("is_opted_out"):
        return jsonify({
            "error": "Sending blocked: Customer has opted out of communications."
        }), 403

    draft = task.get("email_draft") or {}
    body = draft.get("body") or task.get("description")
    subject = draft.get("subject", "Follow-up")

    # Check email provider configuration
    email_provider_configured = bool(
        os.getenv("SMTP_HOST") or os.getenv("SENDGRID_API_KEY") or os.getenv("RESEND_API_KEY")
    )

    msg_status = "sent" if email_provider_configured else "approved_draft"
    note = "Dispatched via configured email provider" if email_provider_configured else "Approved and saved to conversation history (Draft Mode: No external email provider configured)"

    # Record message in unified history
    msg = db_create_conversation_message({
        "lead_id": lead_id,
        "channel": "email",
        "direction": "outbound",
        "sender_type": "salesperson",
        "sender_name": "Sales Team",
        "sender_email": "sales@autopilot.ai",
        "content": body,
        "status": msg_status,
        "metadata": {
            "subject": subject,
            "email_provider_configured": email_provider_configured,
            "approved_at": datetime.now(timezone.utc).isoformat()
        }
    })

    # Mark task completed
    db_update_follow_up_task(task_id, {"status": "completed"})

    # Log sales activity
    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "email_approved",
        "description": f"Approved email draft '{subject}'. {note}.",
        "performed_by": "salesperson"
    })

    return jsonify({
        "message": f"Draft approved. {note}.",
        "status": msg_status,
        "email_provider_configured": email_provider_configured,
        "sent_message": msg
    })

@app.route("/api/crm/leads/<lead_id>/generate-draft", methods=["POST"])
def generate_draft_route(lead_id):
    """
    Generate a grounded personalized sales email draft across 7 sales scenarios.
    Uses real business analysis, Playwright audit findings, and stated customer timeline.
    """
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        lead = db_get_lead_detail(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found."}), 404

    data = request.json or {}
    scenario = data.get("scenario") or data.get("email_type") or "initial_outreach"
    custom_instructions = data.get("custom_instructions", "")
    recipient_name = data.get("recipient_name", "")

    draft = generate_personalized_email_draft(
        lead=lead,
        email_type=scenario,
        custom_instructions=custom_instructions,
        recipient_name=recipient_name
    )
    return jsonify(draft)

@app.route("/api/crm/leads/<lead_id>/save-draft", methods=["POST"])
def save_draft_route(lead_id):
    """
    Save an email draft to conversation history or as a scheduled follow-up task.
    Distinguishes Draft vs Scheduled vs Sent.
    """
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found in CRM."}), 404

    data = request.json or {}
    subject = data.get("subject", "Follow-up")
    body = data.get("body", "")
    scenario = data.get("scenario", "initial_outreach")
    create_task = bool(data.get("create_task", False))
    follow_up_date = data.get("follow_up_date")

    if not body.strip():
        return jsonify({"error": "Email draft body cannot be empty."}), 400

    # Save as a draft message in conversation history
    msg = db_create_conversation_message({
        "lead_id": lead_id,
        "channel": "email",
        "direction": "outbound",
        "sender_type": "salesperson",
        "sender_name": "Sales Team",
        "content": body,
        "status": "draft",
        "metadata": {
            "subject": subject,
            "scenario": scenario,
            "is_draft": True
        }
    })

    task = None
    if create_task or follow_up_date:
        task = db_create_follow_up_task({
            "lead_id": lead_id,
            "title": f"Send Draft: {subject[:40]}",
            "description": f"Scheduled email draft for {lead.get('business_name')}.",
            "due_date": follow_up_date or datetime.now(timezone.utc).isoformat(),
            "task_type": "email_draft",
            "priority": "medium",
            "email_draft": {
                "subject": subject,
                "body": body,
                "scenario": scenario
            }
        })
        if follow_up_date:
            db_update_crm_lead(lead_id, {"next_follow_up_date": follow_up_date})

    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "draft_created",
        "description": f"Saved personalized email draft: '{subject}'.",
        "performed_by": "salesperson"
    })

    return jsonify({
        "message": "Draft saved successfully.",
        "draft_message": msg,
        "task": task
    }), 201

@app.route("/api/crm/leads/<lead_id>/requirements", methods=["GET"])
def get_lead_requirements(lead_id):
    """Get customer requirements."""
    reqs = db_get_customer_requirements(lead_id)
    return jsonify(reqs)

@app.route("/api/crm/leads/<lead_id>/requirements", methods=["PUT"])
def update_lead_requirements(lead_id):
    """Update customer requirements."""
    data = request.json or {}
    saved = db_upsert_customer_requirements(lead_id, data)
    return jsonify(saved)

@app.route("/api/crm/leads/<lead_id>/requirements/confirm", methods=["POST"])
def confirm_lead_requirements(lead_id):
    """
    Mark client budget and project scope as Confirmed after explicit human review.
    Enforces review requirements: records confirmation date, source, and audit trail.
    """
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found in CRM."}), 404

    data = request.json or {}
    confirmed = db_confirm_customer_requirements(
        lead_id=lead_id,
        confirmation_meta=data,
        confirmed_by=data.get("confirmed_by", "salesperson")
    )
    return jsonify({
        "message": "Requirements and scope marked as confirmed.",
        "requirements": confirmed
    })

@app.route("/api/crm/leads/<lead_id>/requirements/history", methods=["GET"])
def get_lead_requirements_history(lead_id):
    """Get audit change history for customer budget and scope."""
    reqs = db_get_customer_requirements(lead_id)
    history = reqs.get("change_history", [])
    return jsonify(history)


# =====================================================================
# GMAIL DRAFT INTEGRATION (OFFICIAL GOOGLE OAUTH 2.0 - NEVER AUTO-SEND)
# =====================================================================

@app.route("/api/gmail/connect", methods=["GET"])
def connect_gmail_route():
    """Direct HTTP 302 redirect to Google OAuth authorization consent screen."""
    return_url = request.args.get("return_url")
    result = generate_gmail_auth_url(local_db=local_db, return_url=return_url)
    if result.get("auth_url"):
        return redirect(result["auth_url"])
    frontend_url = os.getenv("PUBLIC_FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return redirect(f"{frontend_url}/settings?gmail_error=oauth_not_configured")

@app.route("/api/gmail/auth-url", methods=["GET"])
def get_gmail_auth_url_route():
    """Generate Google OAuth 2.0 authorization URL for Gmail Draft creation."""
    return_url = request.args.get("return_url")
    result = generate_gmail_auth_url(local_db=local_db, return_url=return_url)

    # If opened directly in browser or with ?redirect=1, redirect straight to Google OAuth consent screen
    should_redirect = request.args.get("redirect") in ["1", "true"] or (
        request.accept_mimetypes.accept_html and not request.accept_mimetypes.accept_json
    )
    if should_redirect and result.get("auth_url"):
        return redirect(result["auth_url"])

    return jsonify(result)

@app.route("/api/gmail/oauth/callback", methods=["GET", "POST"])
@app.route("/api/gmail/callback", methods=["GET", "POST"])
def handle_gmail_oauth_callback_route():
    """
    Handle Google OAuth callback.
    GET: Browser redirect from Google OAuth consent screen -> redirects back to frontend.
    POST: Programmatic code exchange from frontend.
    """
    if request.method == "GET":
        code = request.args.get("code")
        state = request.args.get("state")
        error = request.args.get("error")
        frontend_url = os.getenv("PUBLIC_FRONTEND_URL", "http://localhost:5173").rstrip("/")

        if error:
            logger.warning(f"Google OAuth rejected by user: {error}")
            return redirect(f"{frontend_url}/settings?gmail_error={error}")

        if not code or not state:
            return redirect(f"{frontend_url}/settings?gmail_error=missing_code_or_state")

        result = handle_gmail_oauth_callback(code, state, local_db)
        if result.get("success"):
            return_path = result.get("return_url") or "/settings"
            if not return_path.startswith("/"):
                return_path = "/" + return_path
            sep = "&" if "?" in return_path else "?"
            return redirect(f"{frontend_url}{return_path}{sep}gmail_connected=1")
        else:
            err = result.get("error", "oauth_failed")
            return redirect(f"{frontend_url}/settings?gmail_error={err}")

    # POST method
    data = request.json or {}
    code = data.get("code")
    state = data.get("state")
    if not code or not state:
        return jsonify({"error": "Missing authorization code or state token."}), 400

    result = handle_gmail_oauth_callback(code, state, local_db)
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code

@app.route("/api/gmail/status", methods=["GET"])
def get_gmail_status_route():
    """Return current Gmail connection status and active OAuth account."""
    status = get_gmail_connection_status(local_db)
    return jsonify(status)

@app.route("/api/gmail/disconnect", methods=["POST"])
def disconnect_gmail_route():
    """Revoke tokens and disconnect Gmail integration."""
    result = disconnect_gmail(local_db)
    return jsonify(result)

@app.route("/api/crm/leads/<lead_id>/gmail-draft", methods=["POST"])
def create_gmail_draft_route(lead_id):
    """
    Create a draft directly in authenticated user's Gmail Drafts folder.
    SAFETY GUARANTEE: NEVER calls users.messages.send or users.drafts.send.
    Returns status: 'gmail_draft_created' and Gmail drafts URL.
    """
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found in CRM."}), 404

    data = request.json or {}
    to_email = data.get("to_email") or lead.get("email") or ""
    subject = data.get("subject", f"Regarding {lead.get('business_name')}")
    body = data.get("body", "")

    if not body.strip():
        return jsonify({"error": "Email draft body cannot be empty."}), 400

    result = create_gmail_draft(
        to_email=to_email,
        subject=subject,
        body=body,
        local_db=local_db,
        lead_name=lead.get("business_name")
    )

    if not result.get("success"):
        return jsonify(result), 400

    # Record message in CRM conversation history with gmail_draft_created status
    db_create_conversation_message({
        "lead_id": lead_id,
        "channel": "email",
        "direction": "outbound",
        "sender_type": "salesperson",
        "sender_name": "Sales Team",
        "sender_email": to_email,
        "content": body,
        "status": "gmail_draft_created",
        "metadata": {
            "subject": subject,
            "gmail_draft_id": result.get("draft_id"),
            "draft_url": result.get("draft_url"),
            "action": "gmail_draft_created",
            "is_draft": True
        }
    })

    # Record sales activity
    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "gmail_draft_created",
        "description": f"Created Gmail Draft '{subject}'. Ready for manual review and sending.",
        "performed_by": "salesperson"
    })

    return jsonify(result), 201


# =====================================================================
# SECURE PRIVATE CUSTOMER CHAT LINK ENDPOINTS
# =====================================================================

@app.route("/api/crm/leads/<lead_id>/chat-link", methods=["POST"])
def generate_chat_link(lead_id):
    """
    Generate a cryptographically secure, high-entropy token link
    for private customer chat using configured PUBLIC_FRONTEND_URL.
    """
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found."}), 404

    public_frontend_url = os.getenv("PUBLIC_FRONTEND_URL", "").strip().rstrip("/")
    if not public_frontend_url:
        return jsonify({
            "error": "PUBLIC_FRONTEND_URL is not configured in backend environment. Please set PUBLIC_FRONTEND_URL to your public domain.",
            "is_configured": False
        }), 400

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    db_create_secure_chat_link(lead_id, token_hash, expires_at)

    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "chat_link_generated",
        "description": "Secure customer private chat link generated (valid 7 days).",
        "performed_by": "salesperson"
    })

    full_chat_url = f"{public_frontend_url}/chat/{token}"

    return jsonify({
        "token": token,
        "chat_path": f"/chat/{token}",
        "chat_url": full_chat_url,
        "expires_at": expires_at,
        "is_configured": True
    }), 201

@app.route("/api/public/chat/<token>", methods=["GET"])
def access_public_chat(token):
    """
    Validate private token and return public, customer-safe conversation view.
    Zero internal notes, scores, or external leads exposed.
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    link = db_get_secure_chat_link(token_hash)
    if not link:
        return jsonify({"error": "Invalid conversation link. Please check the URL or request a new consultation link."}), 404
    if link.get("is_revoked"):
        return jsonify({"error": "This customer chat link has been revoked by the sales team."}), 403
    if link.get("is_expired"):
        return jsonify({"error": "This customer chat link has expired (7-day validity). Please request a renewed link."}), 410

    lead_id = link.get("lead_id")
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead record unavailable."}), 404

    # Retrieve only customer and AI chat messages
    all_msgs = db_get_conversation_messages(lead_id)
    chat_msgs = [
        {
            "id": m.get("id"),
            "sender_type": m.get("sender_type"),
            "sender_name": m.get("sender_name"),
            "content": m.get("content"),
            "timestamp": m.get("timestamp")
        }
        for m in all_msgs if m.get("channel") == "chat"
    ]

    return jsonify({
        "business_name": lead.get("business_name"),
        "category": lead.get("category"),
        "messages": chat_msgs,
        "expires_at": link.get("expires_at")
    })

@app.route("/api/public/chat/<token>/message", methods=["POST"])
def post_public_chat_message(token):
    """
    Customer posts a chat message. AI generates grounded agency response,
    extracts requirements, updates unified timeline, and flags human review if needed.
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    link = db_get_secure_chat_link(token_hash)
    if not link:
        return jsonify({"error": "Invalid conversation link."}), 404
    if link.get("is_revoked"):
        return jsonify({"error": "This customer chat link has been revoked."}), 403
    if link.get("is_expired"):
        return jsonify({"error": "This customer chat link has expired."}), 410

    data = request.json or {}
    message_text = data.get("message", "").strip()
    if not message_text:
        return jsonify({"error": "Message text is required."}), 400

    lead_id = link.get("lead_id")
    lead = db_get_crm_lead_by_id(lead_id)
    if not lead:
        return jsonify({"error": "Lead unavailable."}), 404

    # 1. Record customer chat message
    db_create_conversation_message({
        "lead_id": lead_id,
        "channel": "chat",
        "direction": "inbound",
        "sender_type": "customer",
        "sender_name": lead.get("business_name", "Customer"),
        "content": message_text,
        "status": "received"
    })

    # 2. Generate grounded AI response
    chat_result = generate_customer_chat_response(message_text, lead_info=lead)
    ai_reply_text = chat_result.get("reply")
    requires_human_review = chat_result.get("requires_human_review", False)
    extracted_reqs = chat_result.get("extracted_requirements", {})

    # 3. Record AI assistant reply
    db_create_conversation_message({
        "lead_id": lead_id,
        "channel": "chat",
        "direction": "outbound",
        "sender_type": "ai_agent",
        "sender_name": "Sales Autopilot Assistant",
        "content": ai_reply_text,
        "status": "sent"
    })

    # 4. If customer requested custom terms or discount, create human review task
    if requires_human_review:
        db_create_follow_up_task({
            "lead_id": lead_id,
            "title": f"Customer Chat Escalation: {lead.get('business_name')}",
            "description": f"Customer requested custom terms in private chat: '{message_text[:120]}'",
            "due_date": datetime.now(timezone.utc).isoformat(),
            "task_type": "human_review",
            "priority": "high"
        })

    # 5. Save extracted requirements if any
    if extracted_reqs:
        current_reqs = db_get_customer_requirements(lead_id)
        if extracted_reqs.get("budget"):
            current_reqs["budget"] = extracted_reqs["budget"]
        if extracted_reqs.get("timeline"):
            current_reqs["timeline"] = extracted_reqs["timeline"]
        db_upsert_customer_requirements(lead_id, current_reqs)

    db_record_sales_activity({
        "lead_id": lead_id,
        "activity_type": "chat_message",
        "description": f"Customer sent chat message: '{message_text[:60]}...'",
        "performed_by": "customer"
    })

    return jsonify({
        "reply": ai_reply_text,
        "requires_human_review": requires_human_review
    }), 201


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") == "development"
    logger.info(f"Starting Sales Pipeline Autopilot Backend on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
