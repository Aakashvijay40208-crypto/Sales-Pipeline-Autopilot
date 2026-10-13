import pytest
import uuid
from app import app
from supabase_client import local_db, save_local_db, db_get_lead_detail, db_save_crm_lead, db_get_crm_lead_by_id


@pytest.fixture
def client():
    app.config["TESTING"] = True
    initial_crm = set(local_db["crm_leads"].keys())
    initial_bus = set(local_db["businesses"].keys())
    with app.test_client() as client:
        yield client
    # Clean up test artifacts
    for k in set(local_db["crm_leads"].keys()) - initial_crm:
        local_db["crm_leads"].pop(k, None)
    for k in set(local_db["businesses"].keys()) - initial_bus:
        local_db["businesses"].pop(k, None)
    save_local_db()


def test_lead_audit_endpoints(client):
    """Test that POST /api/leads/<id>/audit and /api/crm/leads/<id>/audit execute properly."""
    test_id = f"test_audit_lead_{uuid.uuid4().hex[:6]}"
    lead_payload = {
        "id": test_id,
        "place_id": test_id,
        "business_name": "Test Dental Clinic",
        "category": "Dentists",
        "address": "123 Test Rd, Dallas, TX",
        "phone": "(214) 555-0199",
        "website": f"https://{test_id}.com",
        "lifecycle_stage": "Discovered"
    }
    db_save_crm_lead(lead_payload)

    # Re-run audit via endpoint
    res = client.post(f"/api/crm/leads/{test_id}/audit")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "audit_reports" in data
    assert "lead_scores" in data

    # Verify GET /api/leads/<id> finds this lead and returns normalized audit + scores
    get_res = client.get(f"/api/leads/{test_id}")
    assert get_res.status_code == 200
    detail = get_res.get_json()
    assert detail["name"] == "Test Dental Clinic"
    assert "audit_reports" in detail
    assert "lead_scores" in detail
    assert not isinstance(detail["audit_reports"], list)


def test_lead_without_website_baseline_audit(client):
    """Test auditing a lead with no website creates a baseline without error."""
    test_id = f"test_noweb_{uuid.uuid4().hex[:6]}"
    lead_payload = {
        "id": test_id,
        "place_id": test_id,
        "business_name": "No Website Practice",
        "category": "Dentists",
        "address": "456 Main St, Dallas, TX",
        "phone": "(214) 555-0200",
        "website": None,
        "lifecycle_stage": "Discovered"
    }
    db_save_crm_lead(lead_payload)

    res = client.post(f"/api/crm/leads/{test_id}/audit")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["audit_reports"]["website_status"] == 0
    assert data["lead_scores"]["score"] > 0
