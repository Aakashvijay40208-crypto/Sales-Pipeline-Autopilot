import os
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase_client = None
local_db = {
    "profiles": {},
    "search_history": {},
    "businesses": {},
    "audit_reports": {},
    "lead_scores": {},
    "crm_leads": {},
    "conversations": {},
    "conversation_messages": {},
    "sales_activities": {},
    "follow_up_tasks": {},
    "customer_requirements": {},
    "secure_conversation_links": {}
}
LOCAL_DB_FILE = os.path.join(os.path.dirname(__file__), "local_db.json")

# Load local DB if exists
if os.path.exists(LOCAL_DB_FILE):
    try:
        with open(LOCAL_DB_FILE, "r") as f:
            loaded = json.load(f)
            if isinstance(loaded, dict):
                for k, v in loaded.items():
                    local_db[k] = v
    except Exception as e:
        logger.error(f"Error loading local DB file: {e}")

# Ensure all schema keys exist in local_db
for key in [
    "profiles", "search_history", "businesses", "audit_reports", "lead_scores",
    "crm_leads", "conversations", "conversation_messages", "sales_activities",
    "follow_up_tasks", "customer_requirements", "secure_conversation_links",
    "gmail_credentials"
]:
    if key not in local_db:
        local_db[key] = {}

DEFAULT_CURRENCY = "INR"

def format_currency_string(amount, currency="INR") -> str:
    """Format currency with locale-appropriate formatting (en-IN for INR by default)."""
    if amount is None or amount == "":
        return ""
    try:
        val = float(amount)
        if val.is_integer():
            val = int(val)
        if currency == "INR":
            s = str(val)
            if len(s) > 3:
                last_three = s[-3:]
                remaining = s[:-3]
                groups = []
                while len(remaining) > 2:
                    groups.insert(0, remaining[-2:])
                    remaining = remaining[:-2]
                if remaining:
                    groups.insert(0, remaining)
                formatted_num = ",".join(groups) + "," + last_three
            else:
                formatted_num = s
            return f"₹{formatted_num}"
        elif currency == "USD":
            return f"${val:,}"
        elif currency == "GBP":
            return f"£{val:,}"
        elif currency == "EUR":
            return f"€{val:,}"
        else:
            return f"{currency} {val:,}"
    except Exception:
        return f"{currency} {amount}"

def save_local_db():
    try:
        with open(LOCAL_DB_FILE, "w") as f:
            json.dump(local_db, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving local DB file: {e}")


if SUPABASE_URL and SUPABASE_KEY and "your-supabase" not in SUPABASE_URL:
    try:
        from supabase import create_client, Client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}. Falling back to Local DB.")
else:
    logger.info("Supabase credentials missing or default. Using local in-memory/JSON database.")

def get_client():
    return supabase_client

def is_mock_mode():
    return supabase_client is None

def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# EXISTING CORE BUSINESS & DISCOVERY FUNCTIONS (PRESERVED)
# =====================================================================

def db_upsert_business(business_data):
    """Upsert business records."""
    place_id = business_data.get("place_id")
    if not place_id:
        return None
    
    if supabase_client:
        try:
            supabase_client.table("businesses").upsert(business_data).execute()
        except Exception as e:
            logger.debug(f"Supabase upsert business: {e}")
    
    local_db["businesses"][place_id] = business_data
    save_local_db()
    return business_data

def db_upsert_audit_report(audit_data):
    """Upsert website audit reports."""
    place_id = audit_data.get("place_id")
    if not place_id:
        return None
    
    if supabase_client:
        try:
            supabase_client.table("audit_reports").upsert(audit_data).execute()
        except Exception as e:
            logger.debug(f"Supabase upsert audit report: {e}")
            
    local_db["audit_reports"][place_id] = audit_data
    save_local_db()
    return audit_data

def db_upsert_lead_score(score_data):
    """Upsert lead score statistics."""
    place_id = score_data.get("place_id")
    if not place_id:
        return None
        
    if supabase_client:
        try:
            supabase_client.table("lead_scores").upsert(score_data).execute()
        except Exception as e:
            logger.debug(f"Supabase upsert lead score: {e}")
            
    local_db["lead_scores"][place_id] = score_data
    save_local_db()
    return score_data

def db_create_search_history(user_id, query_params):
    """Log a new search query execution."""
    history_id = str(uuid.uuid4())
    record = {
        "id": history_id,
        "created_at": _now_iso(),
        "user_id": user_id,
        "query": query_params,
        "status": "running",
        "leads_found": 0
    }
    
    if supabase_client:
        try:
            res = supabase_client.table("search_history").insert(record).execute()
            return history_id
        except Exception as e:
            logger.debug(f"Supabase create search history: {e}")
            
    local_db["search_history"][history_id] = record
    save_local_db()
    return history_id

def db_update_search_history(history_id, status, leads_found):
    """Update status/metrics of search history."""
    if supabase_client:
        try:
            supabase_client.table("search_history").update({
                "status": status,
                "leads_found": leads_found
            }).eq("id", history_id).execute()
            return True
        except Exception as e:
            logger.debug(f"Supabase update search history: {e}")
            
    if history_id in local_db["search_history"]:
        local_db["search_history"][history_id]["status"] = status
        local_db["search_history"][history_id]["leads_found"] = leads_found
        save_local_db()
        return True
    return False

def _normalize_lead_joins(lead):
    """Unpack PostgREST array joins (audit_reports, lead_scores) into objects."""
    if not lead or not isinstance(lead, dict):
        return lead
    item = dict(lead)
    aud = item.get("audit_reports")
    if isinstance(aud, list):
        item["audit_reports"] = aud[0] if len(aud) > 0 else {}
    elif aud is None:
        item["audit_reports"] = {}
        
    scr = item.get("lead_scores")
    if isinstance(scr, list):
        item["lead_scores"] = scr[0] if len(scr) > 0 else {}
    elif scr is None:
        item["lead_scores"] = {}
        
    place_id = item.get("place_id")
    if place_id:
        if not item.get("audit_reports") and local_db["audit_reports"].get(place_id):
            item["audit_reports"] = local_db["audit_reports"][place_id]
        if not item.get("lead_scores") and local_db["lead_scores"].get(place_id):
            item["lead_scores"] = local_db["lead_scores"][place_id]
    return item

def db_get_leads(filters=None, sort_by=None):
    """
    Fetch all leads by joining businesses, audit_reports and lead_scores.
    Filters: category, city, priority, has_website, min_score, etc.
    """
    if supabase_client:
        try:
            query = supabase_client.table("businesses").select(
                "*, audit_reports(*), lead_scores(*)"
            )
            res = query.execute()
            leads = [_normalize_lead_joins(l) for l in (res.data or [])]
            return _apply_filters_and_sorting(leads, filters, sort_by)
        except Exception as e:
            logger.debug(f"Supabase get leads: {e}")

    leads = []
    for place_id, bus in local_db["businesses"].items():
        audit = local_db["audit_reports"].get(place_id, {})
        score = local_db["lead_scores"].get(place_id, {})
        joined = {**bus}
        joined["audit_reports"] = audit
        joined["lead_scores"] = score
        leads.append(joined)
        
    return _apply_filters_and_sorting(leads, filters, sort_by)

def db_get_lead_detail(place_id):
    """Get full details of a business lead."""
    if supabase_client:
        try:
            res = supabase_client.table("businesses").select(
                "*, audit_reports(*), lead_scores(*)"
            ).eq("place_id", place_id).execute()
            if res.data:
                return _normalize_lead_joins(res.data[0])
        except Exception as e:
            logger.debug(f"Supabase get lead detail: {e}")
            
    bus = local_db["businesses"].get(place_id)
    if not bus:
        crm_lead = local_db["crm_leads"].get(place_id)
        if not crm_lead:
            for c in local_db["crm_leads"].values():
                if c.get("place_id") == place_id:
                    crm_lead = c
                    break
        if crm_lead:
            p_id = crm_lead.get("place_id") or place_id
            bus = {
                "place_id": p_id,
                "name": crm_lead.get("business_name"),
                "category": crm_lead.get("category"),
                "address": crm_lead.get("address"),
                "phone_number": crm_lead.get("phone"),
                "website": crm_lead.get("website"),
                "google_rating": crm_lead.get("google_rating"),
                "created_at": crm_lead.get("created_at")
            }
            audit = local_db["audit_reports"].get(p_id) or local_db["audit_reports"].get(place_id, {})
            score = local_db["lead_scores"].get(p_id) or local_db["lead_scores"].get(place_id, {})
            return {
                **bus,
                "audit_reports": audit,
                "lead_scores": score
            }
        return None
    audit = local_db["audit_reports"].get(place_id, {})
    score = local_db["lead_scores"].get(place_id, {})
    return {
        **bus,
        "audit_reports": audit,
        "lead_scores": score
    }

def db_get_stats():
    """Retrieve statistical counters for the dashboard."""
    leads = db_get_leads()
    total_leads = len(leads)
    hot_leads = 0
    total_score = 0
    no_website = 0
    
    for lead in leads:
        score_info = lead.get("lead_scores", {}) or {}
        score = score_info.get("score", 0)
        priority = score_info.get("priority", "LOW")
        website = lead.get("website")
        
        if priority == "HOT":
            hot_leads += 1
        total_score += score
        if not website:
            no_website += 1
            
    avg_score = round(total_score / total_leads, 1) if total_leads > 0 else 0
    
    return {
        "leadsGenerated": total_leads,
        "hotLeads": hot_leads,
        "averageLeadScore": avg_score,
        "websitesWithoutWebsite": no_website,
        "analyzedBusinesses": total_leads
    }

def _apply_filters_and_sorting(leads, filters, sort_by):
    filtered_leads = []
    filters = filters or {}
    
    for lead in leads:
        score_info = lead.get("lead_scores") or {}
        
        if filters.get("rating"):
            rating = lead.get("google_rating") or 0
            if rating < float(filters["rating"]):
                continue
                
        if filters.get("website"):
            has_web = bool(lead.get("website"))
            req_web = filters["website"]
            if req_web == "yes" and not has_web:
                continue
            if req_web == "no" and has_web:
                continue
                
        if filters.get("leadScore"):
            req_priority = filters["leadScore"].upper()
            priority = score_info.get("priority", "LOW")
            if priority != req_priority:
                continue
                
        if filters.get("city"):
            addr = lead.get("address") or ""
            if filters["city"].lower() not in addr.lower():
                continue
                
        if filters.get("area"):
            addr = lead.get("address") or ""
            if filters["area"].lower() not in addr.lower():
                continue
                
        filtered_leads.append(lead)
        
    if sort_by:
        reverse = sort_by.startswith("-")
        field = sort_by.lstrip("-")
        
        def sort_key(item):
            if field == "score":
                return item.get("lead_scores", {}).get("score", 0)
            elif field == "rating":
                return item.get("google_rating") or 0
            elif field == "name":
                return item.get("name") or ""
            return 0
            
        filtered_leads.sort(key=sort_key, reverse=reverse)
        
    return filtered_leads


from dedup_manager import (
    is_duplicate_lead,
    merge_two_leads,
    normalize_domain,
    normalize_phone,
    normalize_email,
    normalize_business_name
)

# =====================================================================
# SALES PIPELINE AUTOPILOT: CRM, MESSAGES, TASKS, ACTIVITIES
# =====================================================================

def db_save_crm_lead(data: dict) -> dict:
    """
    Save or update a lead in the persistent CRM (`crm_leads`).
    Prevents duplicates using normalized domain, phone, email, or place_id.
    If a matching duplicate is found, merges non-empty fields into the existing record.
    """
    now = _now_iso()
    candidate_id = data.get("id") or data.get("place_id") or str(uuid.uuid4())
    place_id = data.get("place_id") or candidate_id

    # 1. Check for exact ID match first
    existing = local_db["crm_leads"].get(candidate_id) or local_db["crm_leads"].get(place_id)
    
    # 2. If no direct ID match, scan existing CRM leads for duplicate match signals
    matched_reason = ""
    if not existing:
        for lead_id_key, item in list(local_db["crm_leads"].items()):
            is_dup, reason = is_duplicate_lead(data, item)
            if is_dup:
                existing = item
                matched_reason = reason
                break

    if existing:
        is_exact_match = (existing.get("id") == candidate_id)
        # Merge duplicate details safely
        merged = merge_two_leads(existing, data)
        if is_exact_match and data.get("lifecycle_stage"):
            merged["lifecycle_stage"] = data["lifecycle_stage"]
        merged["updated_at"] = now
        surviving_id = existing["id"]

        if supabase_client:
            try:
                supabase_client.table("crm_leads").upsert(merged).execute()
            except Exception as e:
                logger.debug(f"Supabase update crm_lead: {e}")

        local_db["crm_leads"][surviving_id] = merged
        if candidate_id and candidate_id != surviving_id:
            local_db["crm_leads"][candidate_id] = merged
        save_local_db()

        if matched_reason:
            db_record_sales_activity({
                "lead_id": surviving_id,
                "activity_type": "lead_merged",
                "description": f"Duplicate lead data merged into '{merged['business_name']}' ({matched_reason}).",
                "performed_by": "system"
            })

        merged["_was_merged"] = bool(matched_reason)
        merged["_matched_reason"] = matched_reason
        return merged

    # 3. Completely new lead record
    record = {
        "id": candidate_id,
        "place_id": place_id,
        "business_name": data.get("business_name") or data.get("name") or "Unknown Business",
        "category": data.get("category") or "General",
        "address": data.get("address") or "",
        "phone": data.get("phone") or data.get("phone_number") or "",
        "website": data.get("website") or "",
        "email": data.get("email") or "",
        "linkedin": data.get("linkedin") or "",
        "google_rating": float(data.get("google_rating") or 0.0),
        "review_count": int(data.get("review_count") or 0),
        "lifecycle_stage": data.get("lifecycle_stage") or "Discovered",
        "latest_reply_classification": data.get("latest_reply_classification") or "None",
        "lead_score": int(data.get("lead_score") or data.get("score") or 50),
        "priority": data.get("priority") or "MEDIUM",
        "is_opted_out": bool(data.get("is_opted_out", False)),
        "opt_out_timestamp": data.get("opt_out_timestamp", None),
        "opt_out_reason": data.get("opt_out_reason", None),
        "next_action": data.get("next_action") or "Review lead and draft initial outreach",
        "next_follow_up_date": data.get("next_follow_up_date", None),
        "notes": data.get("notes") or "",
        "source": data.get("source") or "Prospect Scan",
        "created_at": now,
        "updated_at": now
    }

    if supabase_client:
        try:
            supabase_client.table("crm_leads").upsert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase save crm_lead: {e}")

    local_db["crm_leads"][candidate_id] = record
    save_local_db()

    # Log initial creation activity
    db_record_sales_activity({
        "lead_id": candidate_id,
        "activity_type": "lead_created",
        "description": f"Lead '{record['business_name']}' added to CRM.",
        "performed_by": data.get("performed_by", "salesperson")
    })

    record["_was_merged"] = False
    return record

def db_get_crm_leads(filters: dict = None, sort_by: str = None) -> list:
    """Retrieve all CRM leads with stage, classification, and search filtering."""
    filters = filters or {}
    
    leads_list = []
    if supabase_client:
        try:
            res = supabase_client.table("crm_leads").select("*").execute()
            if res.data:
                leads_list = res.data
        except Exception as e:
            logger.debug(f"Supabase get crm_leads: {e}")

    if not leads_list:
        # Use local_db deduplicated by 'id'
        seen_ids = set()
        for item in local_db["crm_leads"].values():
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                leads_list.append(item)

    # Filter
    results = []
    for lead in leads_list:
        if filters.get("stage") and lead.get("lifecycle_stage") != filters["stage"]:
            continue
        if filters.get("classification") and lead.get("latest_reply_classification") != filters["classification"]:
            continue
        if filters.get("opt_out") is not None:
            want_opt = str(filters["opt_out"]).lower() in ["true", "1", "yes"]
            if bool(lead.get("is_opted_out")) != want_opt:
                continue
        if filters.get("search"):
            q = filters["search"].lower()
            name = (lead.get("business_name") or "").lower()
            cat = (lead.get("category") or "").lower()
            city = (lead.get("address") or "").lower()
            if q not in name and q not in cat and q not in city:
                continue
        results.append(lead)

    # Sort
    sort_by = sort_by or "-updated_at"
    reverse = sort_by.startswith("-")
    field = sort_by.lstrip("-")
    results.sort(key=lambda x: str(x.get(field, "")), reverse=reverse)
    return results

def db_get_crm_lead_by_id(lead_id: str) -> dict:
    """Get full details of a CRM lead including audit, requirements, and recent tasks."""
    lead = None
    if supabase_client:
        try:
            res = supabase_client.table("crm_leads").select("*").eq("id", lead_id).execute()
            if res.data:
                lead = res.data[0]
        except Exception as e:
            logger.debug(f"Supabase get crm_lead by id: {e}")

    if not lead:
        lead = local_db["crm_leads"].get(lead_id)

    if not lead:
        return None

    place_id = lead.get("place_id") or lead_id
    audit = local_db["audit_reports"].get(place_id) or local_db["audit_reports"].get(lead_id) or {}
    score = local_db["lead_scores"].get(place_id) or local_db["lead_scores"].get(lead_id) or {}

    if not audit and supabase_client:
        try:
            res = supabase_client.table("audit_reports").select("*").eq("place_id", place_id).execute()
            if res.data:
                audit = res.data[0] if isinstance(res.data, list) and res.data else (res.data or {})
        except Exception as e:
            logger.debug(f"Supabase get audit for crm lead: {e}")

    if not score and supabase_client:
        try:
            res = supabase_client.table("lead_scores").select("*").eq("place_id", place_id).execute()
            if res.data:
                score = res.data[0] if isinstance(res.data, list) and res.data else (res.data or {})
        except Exception as e:
            logger.debug(f"Supabase get score for crm lead: {e}")

    if isinstance(audit, list):
        audit = audit[0] if audit else {}
    if isinstance(score, list):
        score = score[0] if score else {}

    requirements = db_get_customer_requirements(lead_id)
    activities = db_get_sales_activities(lead_id)
    messages = db_get_conversation_messages(lead_id)
    tasks = db_get_follow_up_tasks(lead_id=lead_id)

    return {
        **lead,
        "audit_reports": audit,
        "lead_scores": score,
        "requirements": requirements,
        "activities": activities,
        "messages": messages,
        "tasks": tasks
    }

def db_update_crm_lead(lead_id: str, updates: dict) -> dict:
    """Update fields on a CRM lead."""
    lead = local_db["crm_leads"].get(lead_id)
    if not lead:
        return None

    now = _now_iso()
    updates["updated_at"] = now
    
    # Check if lifecycle stage changed
    old_stage = lead.get("lifecycle_stage")
    new_stage = updates.get("lifecycle_stage")
    if new_stage and new_stage != old_stage:
        db_record_sales_activity({
            "lead_id": lead_id,
            "activity_type": "status_change",
            "previous_status": old_stage,
            "new_status": new_stage,
            "description": f"Stage updated from '{old_stage}' to '{new_stage}'.",
            "performed_by": updates.get("performed_by", "salesperson")
        })

    lead.update(updates)
    
    if supabase_client:
        try:
            supabase_client.table("crm_leads").update(updates).eq("id", lead_id).execute()
        except Exception as e:
            logger.debug(f"Supabase update crm_lead: {e}")

    save_local_db()
    return lead


# --- CONVERSATION & MESSAGES ---

def db_create_conversation_message(msg_data: dict) -> dict:
    """Record an email, customer chat message, or internal note in conversation_messages."""
    msg_id = msg_data.get("id") or str(uuid.uuid4())
    lead_id = msg_data.get("lead_id")
    now = _now_iso()

    record = {
        "id": msg_id,
        "lead_id": lead_id,
        "channel": msg_data.get("channel") or "email", # 'email' | 'chat' | 'internal_note' | 'system'
        "direction": msg_data.get("direction") or "outbound", # 'inbound' | 'outbound' | 'internal'
        "sender_type": msg_data.get("sender_type") or "salesperson", # 'customer' | 'salesperson' | 'ai_agent' | 'system'
        "sender_name": msg_data.get("sender_name") or "Salesperson",
        "sender_email": msg_data.get("sender_email") or "",
        "content": msg_data.get("content") or "",
        "status": msg_data.get("status") or "sent", # 'draft' | 'sent' | 'received' | 'simulated'
        "timestamp": msg_data.get("timestamp") or now,
        "metadata": msg_data.get("metadata") or {}
    }

    if supabase_client:
        try:
            supabase_client.table("conversation_messages").insert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase insert message: {e}")

    local_db["conversation_messages"][msg_id] = record
    save_local_db()
    return record

def db_get_conversation_messages(lead_id: str) -> list:
    """Get all unified conversation messages for a lead, sorted chronologically."""
    messages = []
    if supabase_client:
        try:
            res = supabase_client.table("conversation_messages").select("*").eq("lead_id", lead_id).order("timestamp").execute()
            if res.data:
                messages = res.data
        except Exception as e:
            logger.debug(f"Supabase get messages: {e}")

    if not messages:
        messages = [
            m for m in local_db["conversation_messages"].values()
            if m.get("lead_id") == lead_id
        ]

    messages.sort(key=lambda x: x.get("timestamp", ""))
    return messages


# --- SALES ACTIVITIES AUDIT LOG ---

def db_record_sales_activity(activity_data: dict) -> dict:
    """Record an action in sales_activities."""
    act_id = str(uuid.uuid4())
    record = {
        "id": act_id,
        "lead_id": activity_data.get("lead_id"),
        "activity_type": activity_data.get("activity_type") or "general",
        "description": activity_data.get("description") or "",
        "previous_status": activity_data.get("previous_status"),
        "new_status": activity_data.get("new_status"),
        "reason": activity_data.get("reason"),
        "performed_by": activity_data.get("performed_by") or "ai_autopilot",
        "timestamp": activity_data.get("timestamp") or _now_iso()
    }

    if supabase_client:
        try:
            supabase_client.table("sales_activities").insert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase insert activity: {e}")

    local_db["sales_activities"][act_id] = record
    save_local_db()
    return record

def db_get_sales_activities(lead_id: str) -> list:
    """Get all sales activities for a lead sorted chronologically."""
    acts = []
    if supabase_client:
        try:
            res = supabase_client.table("sales_activities").select("*").eq("lead_id", lead_id).order("timestamp", desc=True).execute()
            if res.data:
                acts = res.data
        except Exception as e:
            logger.debug(f"Supabase get activities: {e}")

    if not acts:
        acts = [
            a for a in local_db["sales_activities"].values()
            if a.get("lead_id") == lead_id
        ]
    acts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return acts


# --- FOLLOW-UP TASKS ---

def db_create_follow_up_task(task_data: dict) -> dict:
    """Create a persistent follow-up reminder / email task."""
    task_id = task_data.get("id") or str(uuid.uuid4())
    record = {
        "id": task_id,
        "lead_id": task_data.get("lead_id"),
        "title": task_data.get("title") or "Follow-up Task",
        "description": task_data.get("description") or "",
        "due_date": task_data.get("due_date") or (_now_iso()),
        "status": task_data.get("status") or "pending", # 'pending' | 'completed' | 'cancelled'
        "task_type": task_data.get("task_type") or "email_follow_up",
        "priority": task_data.get("priority") or "medium", # 'high' | 'medium' | 'low'
        "email_draft": task_data.get("email_draft") or {},
        "created_at": _now_iso(),
        "completed_at": None
    }

    if supabase_client:
        try:
            supabase_client.table("follow_up_tasks").insert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase insert task: {e}")

    local_db["follow_up_tasks"][task_id] = record
    save_local_db()
    return record

def db_get_follow_up_tasks(lead_id: str = None, status: str = None, due_filter: str = None) -> list:
    """
    Retrieve follow-up tasks with optional filters:
    due_filter: 'today' | 'overdue' | 'upcoming'
    """
    tasks = []
    if supabase_client:
        try:
            q = supabase_client.table("follow_up_tasks").select("*")
            if lead_id:
                q = q.eq("lead_id", lead_id)
            if status:
                q = q.eq("status", status)
            res = q.execute()
            if res.data:
                tasks = res.data
        except Exception as e:
            logger.debug(f"Supabase get tasks: {e}")

    if not tasks:
        tasks = list(local_db["follow_up_tasks"].values())
        if lead_id:
            tasks = [t for t in tasks if t.get("lead_id") == lead_id]
        if status:
            tasks = [t for t in tasks if t.get("status") == status]

    # Attach lead info if missing
    for t in tasks:
        lead_id_val = t.get("lead_id")
        lead_obj = local_db["crm_leads"].get(lead_id_val)
        if lead_obj:
            t["business_name"] = lead_obj.get("business_name")
            t["phone"] = lead_obj.get("phone")
            t["email"] = lead_obj.get("email")

    # Filter by date condition
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)

    filtered = []
    for t in tasks:
        due_str = t.get("due_date")
        if not due_str:
            filtered.append(t)
            continue
        try:
            due_dt = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
        except:
            filtered.append(t)
            continue

        if due_filter == "overdue":
            if due_dt < today_start and t.get("status") == "pending":
                filtered.append(t)
        elif due_filter == "today":
            if today_start <= due_dt <= today_end and t.get("status") == "pending":
                filtered.append(t)
        elif due_filter == "upcoming":
            if due_dt > today_end and t.get("status") == "pending":
                filtered.append(t)
        else:
            filtered.append(t)

    filtered.sort(key=lambda x: x.get("due_date", ""))
    return filtered

def db_update_follow_up_task(task_id: str, updates: dict) -> dict:
    """Update task status, due date, or email draft."""
    task = local_db["follow_up_tasks"].get(task_id)
    if not task:
        return None

    task.update(updates)
    if updates.get("status") == "completed" and not task.get("completed_at"):
        task["completed_at"] = _now_iso()

    if supabase_client:
        try:
            supabase_client.table("follow_up_tasks").update(updates).eq("id", task_id).execute()
        except Exception as e:
            logger.debug(f"Supabase update task: {e}")

    save_local_db()
    return task

def db_cancel_pending_tasks_for_lead(lead_id: str, reason: str = "Opted out"):
    """Cancel all pending tasks for a lead (e.g. on opt-out)."""
    for tid, t in local_db["follow_up_tasks"].items():
        if t.get("lead_id") == lead_id and t.get("status") == "pending":
            t["status"] = "cancelled"
            t["cancellation_reason"] = reason

    if supabase_client:
        try:
            supabase_client.table("follow_up_tasks").update({
                "status": "cancelled",
                "cancellation_reason": reason
            }).eq("lead_id", lead_id).eq("status", "pending").execute()
        except Exception as e:
            logger.debug(f"Supabase cancel tasks: {e}")

    save_local_db()


# --- CUSTOMER REQUIREMENTS & CLIENT SCOPE ---

def db_upsert_customer_requirements(lead_id: str, req_data: dict, updated_by: str = "salesperson") -> dict:
    """
    Update or save structured customer requirements and project scope for a lead.
    Tracks budget, scope, deliverables, confirmation status, and full change history.
    Never automatically marks AI-extracted budget/timeline as confirmed.
    """
    now = _now_iso()
    existing = local_db["customer_requirements"].get(lead_id, {})

    # Detect changes to record in audit history
    history = list(existing.get("change_history") or [])
    changes = []
    
    new_budget_amt = req_data.get("budget_amount")
    old_budget_amt = existing.get("budget_amount")
    if new_budget_amt is not None and str(new_budget_amt) != str(old_budget_amt):
        changes.append(f"Budget amount changed from '{old_budget_amt}' to '{new_budget_amt}'")

    new_budget_type = req_data.get("budget_type")
    old_budget_type = existing.get("budget_type")
    if new_budget_type and new_budget_type != old_budget_type:
        changes.append(f"Budget status changed from '{old_budget_type}' to '{new_budget_type}'")

    new_timeline = req_data.get("timeline")
    old_timeline = existing.get("timeline")
    if new_timeline and new_timeline != old_timeline:
        changes.append(f"Timeline changed from '{old_timeline}' to '{new_timeline}'")

    new_service = req_data.get("requested_service")
    old_service = existing.get("requested_service")
    if new_service and new_service != old_service:
        changes.append(f"Requested service updated to '{new_service}'")

    is_confirm_action = bool(req_data.get("is_confirmation_action", False))
    if is_confirm_action:
        changes.append("Client requirements & scope officially reviewed and marked as Confirmed.")

    if changes:
        history.append({
            "timestamp": now,
            "user": updated_by,
            "action": "confirmed" if is_confirm_action else "updated",
            "summary": "; ".join(changes),
            "changes": changes
        })
        # Keep last 50 changes
        if len(history) > 50:
            history = history[-50:]

    # Parse and format budget display string
    raw_amount = req_data.get("budget_amount")
    currency = req_data.get("currency") or existing.get("currency") or DEFAULT_CURRENCY
    budget_type = req_data.get("budget_type") or existing.get("budget_type") or "Not discussed"
    
    budget_display = "Not discussed"
    if raw_amount:
        formatted_val = format_currency_string(raw_amount, currency)
        budget_display = f"{formatted_val} ({budget_type})"
    elif budget_type != "Not discussed":
        budget_display = budget_type

    record = {
        "id": lead_id,
        "lead_id": lead_id,
        # Budget fields
        "budget_amount": raw_amount,
        "currency": currency,
        "budget_type": budget_type,
        "budget_notes": req_data.get("budget_notes", existing.get("budget_notes", "")),
        "budget_confirmed_at": req_data.get("budget_confirmed_at", existing.get("budget_confirmed_at")) if budget_type == "Client confirmed" else None,
        "budget_confirmation_source": req_data.get("budget_confirmation_source") or existing.get("budget_confirmation_source") or "Manual entry",
        "budget_is_confirmed": (budget_type == "Client confirmed"),
        
        # Project Scope fields
        "requested_service": req_data.get("requested_service", existing.get("requested_service", "")),
        "client_requirements": req_data.get("client_requirements", existing.get("client_requirements", "")),
        "deliverables": req_data.get("deliverables", existing.get("deliverables", [])),
        "expected_outcome": req_data.get("expected_outcome", existing.get("expected_outcome", "")),
        "constraints": req_data.get("constraints", existing.get("constraints", "")),
        "timeline": req_data.get("timeline", existing.get("timeline", "Not stated")),
        "timeline_type": req_data.get("timeline_type", existing.get("timeline_type", "Estimated")),
        "timeline_is_confirmed": (req_data.get("timeline_type", existing.get("timeline_type", "Estimated")) == "Client confirmed"),
        "timeline_confirmed_at": req_data.get("timeline_confirmed_at", existing.get("timeline_confirmed_at")) if req_data.get("timeline_type", existing.get("timeline_type")) == "Client confirmed" else None,
        "decision_maker": req_data.get("decision_maker", existing.get("decision_maker", "Unknown")),
        "decision_maker_role": req_data.get("decision_maker_role", existing.get("decision_maker_role", "")),
        "key_stakeholders": req_data.get("key_stakeholders", existing.get("key_stakeholders", "")),
        "scope_notes": req_data.get("scope_notes", existing.get("scope_notes", "")),

        # Legacy & compatibility
        "pain_points": req_data.get("pain_points", existing.get("pain_points", [])),
        "objections": req_data.get("objections", existing.get("objections", [])),
        "preferences": req_data.get("preferences", existing.get("preferences", "")),
        "source": req_data.get("source", existing.get("source", "manual_entry")),
        "budget": budget_display,
        "change_history": history,
        "last_updated_by": updated_by,
        "updated_at": now
    }

    if supabase_client:
        try:
            supabase_client.table("customer_requirements").upsert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase upsert requirements: {e}")

    local_db["customer_requirements"][lead_id] = record
    
    # Mirror key scope data onto CRM lead for fast board display
    if lead_id in local_db.get("crm_leads", {}):
        crm_item = local_db["crm_leads"][lead_id]
        crm_item["confirmed_budget"] = budget_display if record["budget_is_confirmed"] else None
        crm_item["budget_type"] = budget_type
        crm_item["budget"] = budget_display
        crm_item["requested_service"] = record["requested_service"]
        crm_item["timeline"] = record["timeline"]
        if supabase_client:
            try:
                supabase_client.table("crm_leads").update({
                    "confirmed_budget": crm_item["confirmed_budget"],
                    "budget_type": budget_type,
                    "requested_service": record["requested_service"],
                    "timeline": record["timeline"]
                }).eq("id", lead_id).execute()
            except Exception as e:
                logger.debug(f"Supabase sync lead scope: {e}")

    save_local_db()

    # Log sales activity if confirmed or significant edit
    if is_confirm_action or changes:
        db_record_sales_activity({
            "lead_id": lead_id,
            "activity_type": "scope_confirmed" if is_confirm_action else "scope_updated",
            "description": f"Client Scope: {history[-1]['summary'] if history else 'Updated requirements'}",
            "performed_by": updated_by
        })

    return record


def db_get_customer_requirements(lead_id: str) -> dict:
    """Get customer requirements and project scope for a lead with robust defaults."""
    req = None
    if supabase_client:
        try:
            res = supabase_client.table("customer_requirements").select("*").eq("lead_id", lead_id).execute()
            if res.data:
                req = res.data[0]
        except Exception as e:
            logger.debug(f"Supabase get requirements: {e}")

    if not req:
        req = local_db.get("customer_requirements", {}).get(lead_id)

    if not req:
        req = {
            "lead_id": lead_id,
            "budget_amount": None,
            "currency": DEFAULT_CURRENCY,
            "budget_type": "Not discussed",
            "budget_notes": "",
            "budget_confirmed_at": None,
            "budget_confirmation_source": "Manual entry",
            "budget_is_confirmed": False,
            "requested_service": "",
            "client_requirements": "",
            "deliverables": [],
            "expected_outcome": "",
            "constraints": "",
            "timeline": "Not stated",
            "timeline_type": "Estimated",
            "timeline_is_confirmed": False,
            "timeline_confirmed_at": None,
            "decision_maker": "Unknown",
            "decision_maker_role": "",
            "key_stakeholders": "",
            "scope_notes": "",
            "pain_points": [],
            "budget": "Not discussed",
            "objections": [],
            "preferences": "",
            "source": "manual_entry",
            "change_history": [],
            "updated_at": _now_iso()
        }
    return req


def db_confirm_customer_requirements(lead_id: str, confirmation_meta: dict, confirmed_by: str = "salesperson") -> dict:
    """
    Mark client budget and project scope as Confirmed after explicit user review.
    Enforces review requirements: records confirmation date, source, and audit trail.
    """
    now = _now_iso()
    existing = db_get_customer_requirements(lead_id)

    updates = {
        **existing,
        **confirmation_meta,
        "is_confirmation_action": True,
        "budget_is_confirmed": bool(confirmation_meta.get("confirm_budget", True)),
        "budget_confirmed_at": now if confirmation_meta.get("confirm_budget", True) else existing.get("budget_confirmed_at"),
        "budget_type": "Client confirmed" if confirmation_meta.get("confirm_budget", True) else existing.get("budget_type"),
        "budget_confirmation_source": confirmation_meta.get("confirmation_source", "Customer conversation"),
        "timeline_is_confirmed": bool(confirmation_meta.get("confirm_timeline", True)),
        "timeline_confirmed_at": now if confirmation_meta.get("confirm_timeline", True) else existing.get("timeline_confirmed_at"),
        "timeline_type": "Client confirmed" if confirmation_meta.get("confirm_timeline", True) else existing.get("timeline_type")
    }

    return db_upsert_customer_requirements(lead_id, updates, updated_by=confirmed_by)


# --- SECURE CUSTOMER CHAT PRIVATE LINKS ---

def db_create_secure_chat_link(lead_id: str, token_hash: str, expires_at: str) -> dict:
    """Store high-entropy private token hash for private customer chat link."""
    link_id = str(uuid.uuid4())
    record = {
        "id": link_id,
        "lead_id": lead_id,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "is_revoked": False,
        "created_at": _now_iso()
    }

    if supabase_client:
        try:
            supabase_client.table("secure_conversation_links").insert(record).execute()
        except Exception as e:
            logger.debug(f"Supabase insert secure link: {e}")

    local_db["secure_conversation_links"][token_hash] = record
    save_local_db()
    return record

def db_get_secure_chat_link(token_hash: str) -> dict:
    """Validate token hash and return link record if valid, unexpired, and unrevoked."""
    link = None
    if supabase_client:
        try:
            res = supabase_client.table("secure_conversation_links").select("*").eq("token_hash", token_hash).execute()
            if res.data:
                link = res.data[0]
        except Exception as e:
            logger.debug(f"Supabase get secure link: {e}")

    if not link:
        link = local_db["secure_conversation_links"].get(token_hash)

    if not link:
        return None

    if link.get("is_revoked"):
        return {"is_revoked": True, "lead_id": link.get("lead_id")}

    # Check expiration
    exp_str = link.get("expires_at")
    if exp_str:
        try:
            exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                return {"is_expired": True, "lead_id": link.get("lead_id"), "expires_at": exp_str}
        except Exception:
            pass

    return link


# --- OVERVIEW DASHBOARD METRICS ---

def db_get_overview_stats() -> dict:
    """
    Compute real CRM dashboard overview statistics:
    - total saved leads
    - qualified leads
    - interested customers
    - follow-ups due today
    - overdue follow-ups
    - leads waiting for reply
    - recent activity list
    - leads requiring attention
    """
    seen_ids = set()
    leads = []
    for item in local_db["crm_leads"].values():
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            leads.append(item)

    total_saved = len(leads)
    qualified = sum(1 for l in leads if l.get("lifecycle_stage") in ["Qualified", "Opportunity", "Meeting Requested", "Interested"])
    interested = sum(1 for l in leads if l.get("latest_reply_classification") == "Interested" or l.get("lifecycle_stage") == "Interested")
    waiting_reply = sum(1 for l in leads if l.get("lifecycle_stage") == "Contacted")
    attention_count = sum(1 for l in leads if l.get("latest_reply_classification") == "Needs Human Review" or l.get("lifecycle_stage") == "Meeting Requested")

    # Tasks calculation
    tasks = list(local_db["follow_up_tasks"].values())
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)

    due_today = 0
    overdue = 0
    for t in tasks:
        if t.get("status") != "pending":
            continue
        due_str = t.get("due_date")
        if not due_str:
            continue
        try:
            due_dt = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
            if due_dt < today_start:
                overdue += 1
            elif today_start <= due_dt <= today_end:
                due_today += 1
        except:
            pass

    # Recent activities (last 10)
    all_activities = list(local_db["sales_activities"].values())
    all_activities.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    recent_activities = all_activities[:8]

    return {
        "totalSavedLeads": total_saved,
        "qualifiedLeads": qualified,
        "interestedCustomers": interested,
        "followUpsDueToday": due_today,
        "overdueFollowUps": overdue,
        "leadsWaitingForReply": waiting_reply,
        "attentionCount": attention_count,
        "recentActivities": recent_activities
    }


# =====================================================================
# DUPLICATE AUDITING, MERGING & BATCH PERSISTENCE
# =====================================================================

def db_find_all_duplicate_groups() -> list:
    """
    Scan all CRM leads and group records that represent the same business entity.
    Returns candidate duplicate groups with surviving lead recommendation.
    """
    seen_ids = set()
    leads = []
    for item in local_db["crm_leads"].values():
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            leads.append(item)

    processed_ids = set()
    groups = []

    for i, lead_a in enumerate(leads):
        if lead_a["id"] in processed_ids:
            continue

        cluster = [lead_a]
        reasons = []

        for j in range(i + 1, len(leads)):
            lead_b = leads[j]
            if lead_b["id"] in processed_ids:
                continue

            is_dup, reason = is_duplicate_lead(lead_b, lead_a)
            if is_dup:
                cluster.append(lead_b)
                reasons.append(reason)
                processed_ids.add(lead_b["id"])

        if len(cluster) > 1:
            processed_ids.add(lead_a["id"])
            
            # Select surviving lead based on data completeness
            def completeness_score(lead_obj):
                score = 0
                if lead_obj.get("website"): score += 3
                if lead_obj.get("phone"): score += 3
                if lead_obj.get("email"): score += 3
                if lead_obj.get("address"): score += 2
                if lead_obj.get("lead_score"): score += 1
                # More child messages / tasks
                msgs = [m for m in local_db["conversation_messages"].values() if m.get("lead_id") == lead_obj["id"]]
                score += len(msgs) * 2
                return score

            cluster.sort(key=completeness_score, reverse=True)
            surviving = cluster[0]
            duplicates = cluster[1:]

            groups.append({
                "surviving_id": surviving["id"],
                "surviving_lead": surviving,
                "duplicate_ids": [d["id"] for d in duplicates],
                "duplicate_leads": duplicates,
                "match_reasons": list(set(reasons))
            })

    return groups


def db_merge_duplicate_group(surviving_id: str, duplicate_ids: list) -> dict:
    """
    Safely merge duplicate leads into surviving_id:
    - Merges contact info and scores into surviving lead
    - Reassigns conversation messages, sales activities, follow-up tasks, requirements, chat links
    - Safely removes duplicate records
    """
    surviving = local_db["crm_leads"].get(surviving_id)
    if not surviving:
        return {"error": f"Surviving lead '{surviving_id}' not found."}

    now = _now_iso()
    records_merged_count = 0
    msgs_reassigned = 0
    tasks_reassigned = 0
    acts_reassigned = 0

    for dup_id in duplicate_ids:
        if dup_id == surviving_id:
            continue

        duplicate = local_db["crm_leads"].get(dup_id)
        if not duplicate:
            continue

        # Merge fields into surviving
        surviving = merge_two_leads(surviving, duplicate)
        surviving["updated_at"] = now

        # Reassign conversation messages
        for mid, msg in local_db["conversation_messages"].items():
            if msg.get("lead_id") == dup_id:
                msg["lead_id"] = surviving_id
                msgs_reassigned += 1
                if supabase_client:
                    try:
                        supabase_client.table("conversation_messages").update({"lead_id": surviving_id}).eq("id", mid).execute()
                    except Exception as e:
                        logger.debug(f"Supabase reassign message: {e}")

        # Reassign follow-up tasks
        for tid, task in local_db["follow_up_tasks"].items():
            if task.get("lead_id") == dup_id:
                task["lead_id"] = surviving_id
                tasks_reassigned += 1
                if supabase_client:
                    try:
                        supabase_client.table("follow_up_tasks").update({"lead_id": surviving_id}).eq("id", tid).execute()
                    except Exception as e:
                        logger.debug(f"Supabase reassign task: {e}")

        # Reassign sales activities
        for aid, act in local_db["sales_activities"].items():
            if act.get("lead_id") == dup_id:
                act["lead_id"] = surviving_id
                acts_reassigned += 1
                if supabase_client:
                    try:
                        supabase_client.table("sales_activities").update({"lead_id": surviving_id}).eq("id", aid).execute()
                    except Exception as e:
                        logger.debug(f"Supabase reassign act: {e}")

        # Reassign secure chat links
        for l_key, link in local_db["secure_conversation_links"].items():
            if link.get("lead_id") == dup_id:
                link["lead_id"] = surviving_id

        # Delete duplicate lead
        del local_db["crm_leads"][dup_id]
        if supabase_client:
            try:
                supabase_client.table("crm_leads").delete().eq("id", dup_id).execute()
            except Exception as e:
                logger.debug(f"Supabase delete duplicate lead: {e}")

        records_merged_count += 1

    # Save surviving lead
    local_db["crm_leads"][surviving_id] = surviving
    if supabase_client:
        try:
            supabase_client.table("crm_leads").upsert(surviving).execute()
        except Exception as e:
            logger.debug(f"Supabase upsert surviving: {e}")

    # Log activity on surviving lead
    db_record_sales_activity({
        "lead_id": surviving_id,
        "activity_type": "lead_merged",
        "description": f"Consolidated {records_merged_count} duplicate lead(s) into '{surviving.get('business_name')}'. Reassigned {msgs_reassigned} messages and {tasks_reassigned} tasks.",
        "performed_by": "salesperson"
    })

    save_local_db()

    return {
        "surviving_id": surviving_id,
        "surviving_lead": surviving,
        "records_merged": records_merged_count,
        "messages_reassigned": msgs_reassigned,
        "tasks_reassigned": tasks_reassigned,
        "activities_reassigned": acts_reassigned
    }


def db_batch_save_crm_leads(leads_list: list) -> dict:
    """
    Save multiple leads in batch, running duplicate detection on each.
    Returns: {"added": int, "merged": int, "leads": list}
    """
    added_count = 0
    merged_count = 0
    saved_records = []

    for item in leads_list:
        res = db_save_crm_lead(item)
        saved_records.append(res)
        if res.get("_was_merged"):
            merged_count += 1
        else:
            added_count += 1

    return {
        "total": len(leads_list),
        "added": added_count,
        "merged": merged_count,
        "leads": saved_records
    }

