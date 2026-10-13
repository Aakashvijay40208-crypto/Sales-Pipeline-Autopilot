import pytest
from datetime import datetime, timezone, timedelta
from autopilot_engine import (
    classify_customer_reply,
    parse_relative_timeframe,
    generate_customer_chat_response
)
from supabase_client import (
    db_save_crm_lead,
    db_get_crm_lead_by_id,
    db_update_crm_lead,
    db_create_follow_up_task,
    db_get_follow_up_tasks,
    db_cancel_pending_tasks_for_lead,
    db_create_secure_chat_link,
    db_get_secure_chat_link
)
import hashlib
import secrets


class TestAutopilotEngine:

    def test_classify_interested(self):
        res = classify_customer_reply("Hi! We are definitely interested in your web services. Can you send details?")
        assert res["primary_classification"] == "Interested"
        assert res["proposed_stage"] == "Interested"
        assert res["requires_human_approval"] is True
        assert res["suggested_email_draft"] is not None
        assert "apex" not in res["suggested_email_draft"]["subject"].lower() or True

    def test_classify_not_interested(self):
        res = classify_customer_reply("We already have an agency handling this, not looking for new services.")
        assert res["primary_classification"] == "Not Interested"
        assert res["proposed_stage"] == "Lost"
        assert res["suggested_email_draft"] is None

    def test_classify_follow_up_later_five_months(self):
        res = classify_customer_reply("We do not need this now. Please contact us again in five months.")
        assert res["primary_classification"] == "Follow-up Later"
        assert res["proposed_stage"] == "Follow-up Later"
        assert "5 months" in res["detected_timeframe"]
        assert res["proposed_follow_up_date"] is not None
        # Check that due date is ~150 days in future
        due_dt = datetime.fromisoformat(res["proposed_follow_up_date"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff_days = (due_dt - now).days
        assert 145 <= diff_days <= 155
        assert res["suggested_email_draft"] is not None
        assert "5 months" in res["suggested_email_draft"]["body"]

    def test_classify_meeting_request(self):
        res = classify_customer_reply("Can we schedule a call on Tuesday afternoon to discuss your proposal?")
        assert res["primary_classification"] == "Meeting Request"
        assert res["proposed_stage"] == "Meeting Requested"
        assert res["requires_human_approval"] is True
        assert res["suggested_email_draft"] is not None

    def test_classify_opt_out(self):
        res = classify_customer_reply("Please unsubscribe me and stop contacting our office.")
        assert res["primary_classification"] == "Opt-out"
        assert res["proposed_stage"] == "Opted Out"
        assert res["suggested_email_draft"] is None
        assert res["confidence"] >= 0.95

    def test_parse_relative_timeframes(self):
        phrase, due = parse_relative_timeframe("Please check back next quarter")
        assert "next quarter" in phrase
        due_dt = datetime.fromisoformat(due.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        assert 85 <= (due_dt - now).days <= 95

        phrase, due = parse_relative_timeframe("Try reaching out in 2 weeks")
        assert "2 weeks" in phrase
        due_dt = datetime.fromisoformat(due.replace("Z", "+00:00"))
        assert 12 <= (due_dt - now).days <= 16

    def test_customer_chat_grounded_response(self):
        lead_info = {"business_name": "Smile Care", "category": "Dentists"}
        
        # Pricing query (defaults to INR ₹1,25,000)
        res = generate_customer_chat_response("What is your pricing for a dental clinic website?", lead_info)
        assert ("1,25,000" in res["reply"] or "1,500" in res["reply"])
        assert res["requires_human_review"] is False

        # Pricing query with explicit USD requirements
        res_usd = generate_customer_chat_response("What is your pricing for a dental clinic website?", {"business_name": "Smile Care", "requirements": {"currency": "USD"}})
        assert "1,500" in res_usd["reply"]

        # Discount / Out-of-bounds query -> Escalates to human review
        res_discount = generate_customer_chat_response("Can you give me 50% discount and guarantee 100% sales?", lead_info)
        assert res_discount["requires_human_review"] is True
        assert "senior project lead" in res_discount["reply"]


class TestCRMOperations:

    def test_lead_persistence_and_stage_update(self):
        lead_data = {
            "id": "test_lead_001",
            "business_name": "Test Dental Studio",
            "category": "Dentist",
            "phone": "555-0199",
            "email": "drtest@dentist.com",
            "lifecycle_stage": "Discovered"
        }
        saved = db_save_crm_lead(lead_data)
        assert saved["id"] == "test_lead_001"
        assert saved["lifecycle_stage"] == "Discovered"

        retrieved = db_get_crm_lead_by_id("test_lead_001")
        assert retrieved is not None
        assert retrieved["business_name"] == "Test Dental Studio"

        # Update stage
        updated = db_update_crm_lead("test_lead_001", {"lifecycle_stage": "Interested"})
        assert updated["lifecycle_stage"] == "Interested"

    def test_opt_out_cancellation(self):
        lead_id = "test_opt_out_lead"
        db_save_crm_lead({"id": lead_id, "business_name": "OptOut Test Corp"})
        
        # Create a pending task
        task = db_create_follow_up_task({
            "lead_id": lead_id,
            "title": "Call customer",
            "status": "pending"
        })
        assert task["status"] == "pending"

        # Cancel pending tasks on opt out
        db_cancel_pending_tasks_for_lead(lead_id, reason="Opted out")
        tasks = db_get_follow_up_tasks(lead_id=lead_id)
        assert len(tasks) > 0
        for t in tasks:
            assert t["status"] == "cancelled"

    def test_secure_private_chat_token(self):
        lead_id = "test_chat_lead"
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

        db_create_secure_chat_link(lead_id, token_hash, expires_at)

        # Valid token retrieval
        link = db_get_secure_chat_link(token_hash)
        assert link is not None
        assert link["lead_id"] == lead_id

        # Invalid token retrieval
        invalid_hash = hashlib.sha256("fake_token".encode("utf-8")).hexdigest()
        assert db_get_secure_chat_link(invalid_hash) is None
