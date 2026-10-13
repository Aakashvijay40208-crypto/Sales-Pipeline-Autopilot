import pytest
import json
from app import app


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


def test_crm_leads_lifecycle_and_replies(client):
    import uuid
    uid1 = f"lead_flow_{uuid.uuid4().hex[:6]}"
    uid2 = f"lead_flow_{uuid.uuid4().hex[:6]}"

    # 1. Save a new lead
    lead_payload = {
        "id": uid1,
        "business_name": f"Downtown Orthodontics {uid1}",
        "category": "Dentists",
        "address": "100 Main St, Austin, TX",
        "phone": f"(512) 555-{uid1[-4:]}",
        "email": f"contact@{uid1}.com",
        "website": f"https://{uid1}.com",
        "lifecycle_stage": "Discovered"
    }
    res = client.post("/api/crm/leads/save", json=lead_payload)
    assert res.status_code == 201
    lead_data = res.get_json()
    assert lead_data["lifecycle_stage"] == "Discovered"

    # 2. Record an outbound introductory email
    msg_res = client.post(f"/api/crm/leads/{uid1}/messages", json={
        "content": "Hi Downtown Orthodontics, we noticed your site could benefit from online patient booking...",
        "channel": "email",
        "direction": "outbound"
    })
    assert msg_res.status_code == 201

    # Verify stage moved to Contacted
    get_lead = client.get(f"/api/crm/leads/{uid1}")
    assert get_lead.get_json()["lifecycle_stage"] == "Contacted"

    # 3. Customer replies: "We are interested, what are your rates?"
    reply_res = client.post(f"/api/crm/leads/{uid1}/record-reply", json={
        "content": "We are interested in this, what are your rates?"
    })
    assert reply_res.status_code == 201
    reply_data = reply_res.get_json()
    assert reply_data["classification"]["primary_classification"] == "Interested"
    assert reply_data["lead"]["lifecycle_stage"] == "Interested"

    # Verify a follow-up task was generated
    tasks_res = client.get(f"/api/crm/tasks?lead_id={uid1}")
    tasks = tasks_res.get_json()
    assert len(tasks) > 0
    assert any("Proposal" in t.get("title", "") for t in tasks)

    # 4. Another lead replies with: "Please contact us again in 5 months"
    client.post("/api/crm/leads/save", json={
        "id": uid2,
        "business_name": f"Lakeview Dental {uid2}",
        "category": "Dentists",
        "lifecycle_stage": "Discovered"
    })
    follow_later_res = client.post(f"/api/crm/leads/{uid2}/record-reply", json={
        "content": "Not right now. Please contact us again in 5 months."
    })
    assert follow_later_res.status_code == 201
    fl_data = follow_later_res.get_json()
    assert fl_data["classification"]["primary_classification"] == "Follow-up Later"
    assert fl_data["lead"]["lifecycle_stage"] == "Follow-up Later"
    assert "5 months" in fl_data["classification"]["detected_timeframe"]

    # Verify task with personalized email draft was created
    fl_tasks = client.get(f"/api/crm/tasks?lead_id={uid2}").get_json()
    assert len(fl_tasks) > 0
    assert "5 months" in fl_tasks[0]["email_draft"]["body"]

    # 5. Customer opt-out: "Stop emailing me and unsubscribe"
    opt_out_res = client.post(f"/api/crm/leads/{uid2}/record-reply", json={
        "content": "Stop emailing me and unsubscribe immediately."
    })
    assert opt_out_res.status_code == 201
    opt_data = opt_out_res.get_json()
    assert opt_data["classification"]["primary_classification"] == "Opt-out"
    assert opt_data["lead"]["is_opted_out"] is True
    assert opt_data["lead"]["lifecycle_stage"] == "Opted Out"

    # Verify previous pending tasks are now cancelled
    tasks_after_opt = client.get(f"/api/crm/tasks?lead_id={uid2}").get_json()
    for t in tasks_after_opt:
        assert t["status"] == "cancelled"

    # Attempting to send an outbound message to this opted-out lead must fail (403 Forbidden)
    block_res = client.post(f"/api/crm/leads/{uid2}/messages", json={
        "content": "Hey checking back in!",
        "channel": "email",
        "direction": "outbound"
    })
    assert block_res.status_code == 403


def test_secure_private_chat_link_flow(client):
    import uuid
    uid = f"lead_chat_{uuid.uuid4().hex[:6]}"

    # 1. Create a lead
    client.post("/api/crm/leads/save", json={
        "id": uid,
        "business_name": f"Metro Law Partners {uid}",
        "category": "Legal"
    })

    # 2. Generate private chat link
    link_res = client.post(f"/api/crm/leads/{uid}/chat-link")
    assert link_res.status_code == 201
    token = link_res.get_json()["token"]

    # 3. Access public customer chat view
    pub_res = client.get(f"/api/public/chat/{token}")
    assert pub_res.status_code == 200
    pub_data = pub_res.get_json()
    assert pub_data["business_name"].startswith("Metro Law Partners")
    # Ensure no internal data leaked
    assert "lead_score" not in pub_data
    assert "audit_reports" not in pub_data

    # 4. Customer sends chat message
    chat_post = client.post(f"/api/public/chat/{token}/message", json={
        "message": "Hello, what is your standard project timeline for redesigning our legal website?"
    })
    assert chat_post.status_code == 201
    chat_reply = chat_post.get_json()
    assert "weeks" in chat_reply["reply"].lower()

    # 5. Invalid token should return 404
    bad_res = client.get("/api/public/chat/invalid_random_token_123")
    assert bad_res.status_code == 404
