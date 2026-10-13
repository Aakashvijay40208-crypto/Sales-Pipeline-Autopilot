import pytest
import os
import uuid
from app import app
from email_draft_generator import generate_personalized_email_draft, EMAIL_TYPES


@pytest.fixture
def client():
    from supabase_client import local_db, save_local_db
    app.config["TESTING"] = True
    initial_leads = set(local_db["crm_leads"].keys())
    with app.test_client() as client:
        yield client
    # Teardown: Clean up any test leads created
    new_leads = set(local_db["crm_leads"].keys()) - initial_leads
    for l_id in new_leads:
        local_db["crm_leads"].pop(l_id, None)
        for mid, m in list(local_db.get("conversation_messages", {}).items()):
            if m.get("lead_id") == l_id:
                local_db["conversation_messages"].pop(mid, None)
        for tid, t in list(local_db.get("follow_up_tasks", {}).items()):
            if t.get("lead_id") == l_id:
                local_db["follow_up_tasks"].pop(tid, None)
    save_local_db()


def test_personalized_email_draft_grounded_flaws():
    lead = {
        "business_name": "Lone Star Dental",
        "category": "Dentists",
        "address": "123 Congress Ave, Austin, TX",
        "website": "https://lonestardental.example.com",
        "contact_name": "Dr. Sarah",
        "audit_reports": {
            "is_https": False,
            "response_time_ms": 4200,
            "ux": {"isMobileFriendly": False},
            "tech_detected": {"bookingSystem": None}
        }
    }

    # Test initial outreach
    draft = generate_personalized_email_draft(lead, email_type="initial_outreach")
    assert "Hi Dr. Sarah," in draft["body"]
    assert "Lone Star Dental" in draft["subject"]
    # Flaws detected
    assert "missing SSL/HTTPS" in draft["body"] or "slower initial page load" in draft["body"]

    # Test delayed reconnect
    lead["requirements"] = {"timeline": "in 4 months"}
    draft_delayed = generate_personalized_email_draft(lead, email_type="delayed_reconnect")
    assert "in 4 months" in draft_delayed["subject"] or "in 4 months" in draft_delayed["body"]

    # Test meeting request
    draft_meeting = generate_personalized_email_draft(lead, email_type="meeting_request")
    assert "Introductory discussion" in draft_meeting["subject"]


def test_customer_chat_link_generation_and_public_frontend_url(client):
    test_id = f"lead_chat_{uuid.uuid4().hex[:6]}"
    # Save lead
    client.post("/api/crm/leads/save", json={
        "id": test_id,
        "business_name": f"Chat Test Clinic {test_id}",
        "website": f"https://chat-{test_id}.com",
        "phone": f"512-555-{test_id[-4:]}"
    })

    # Case 1: PUBLIC_FRONTEND_URL configured
    os.environ["PUBLIC_FRONTEND_URL"] = "https://sales-autopilot.app"
    res = client.post(f"/api/crm/leads/{test_id}/chat-link")
    assert res.status_code == 201
    data = res.get_json()
    assert data["token"] is not None
    assert data["chat_url"].startswith("https://sales-autopilot.app/chat/")

    # Access public chat with token
    token = data["token"]
    pub_res = client.get(f"/api/public/chat/{token}")
    assert pub_res.status_code == 200
    pub_data = pub_res.get_json()
    assert pub_data["business_name"] == f"Chat Test Clinic {test_id}"

    # Invalid token check
    invalid_res = client.get("/api/public/chat/non_existent_token_123")
    assert invalid_res.status_code == 404

    # Case 2: PUBLIC_FRONTEND_URL missing/empty
    os.environ["PUBLIC_FRONTEND_URL"] = ""
    err_res = client.post(f"/api/crm/leads/{test_id}/chat-link")
    assert err_res.status_code == 400
    assert "PUBLIC_FRONTEND_URL is not configured" in err_res.get_json()["error"]

    # Restore for other tests
    os.environ["PUBLIC_FRONTEND_URL"] = "http://localhost:5173"


def test_draft_saving_and_approval_without_false_send(client):
    lead_id = f"lead_draft_{uuid.uuid4().hex[:6]}"
    client.post("/api/crm/leads/save", json={
        "id": lead_id,
        "business_name": f"Draft Clinic {lead_id}",
        "website": f"https://draft-{lead_id}.com",
        "phone": f"512-555-{lead_id[-4:]}"
    })

    # 1. Generate draft endpoint
    gen_res = client.post(f"/api/crm/leads/{lead_id}/generate-draft", json={
        "scenario": "initial_outreach"
    })
    assert gen_res.status_code == 200
    draft_data = gen_res.get_json()
    assert draft_data["subject"] is not None

    # 2. Save draft endpoint
    save_res = client.post(f"/api/crm/leads/{lead_id}/save-draft", json={
        "subject": draft_data["subject"],
        "body": draft_data["body"],
        "create_task": True,
        "follow_up_date": "2026-10-20T10:00:00Z"
    })
    assert save_res.status_code == 201
    saved_json = save_res.get_json()
    assert saved_json["draft_message"]["status"] == "draft"

    # 3. Approve task when no email provider is configured
    task_id = saved_json["task"]["id"]
    approve_res = client.post(f"/api/crm/tasks/{task_id}/approve-send")
    assert approve_res.status_code == 200
    app_data = approve_res.get_json()
    # Must NOT falsely claim sent when no provider configured!
    assert app_data["email_provider_configured"] is False
    assert app_data["status"] == "approved_draft"


def test_duplicate_scan_and_merge_api(client):
    # Scan duplicates endpoint
    scan_res = client.get("/api/crm/duplicates/scan")
    assert scan_res.status_code == 200
    scan_data = scan_res.get_json()
    assert "groups_count" in scan_data
    assert "groups" in scan_data
