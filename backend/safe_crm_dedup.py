import json
import shutil
import os
import re

DB_PATH = os.path.join(os.path.dirname(__file__), "local_db.json")
BACKUP_PATH = os.path.join(os.path.dirname(__file__), "local_db.backup.json")

def run_safe_deduplication():
    if not os.path.exists(DB_PATH):
        print("local_db.json not found!")
        return

    # 1. Create a safe backup first
    shutil.copyfile(DB_PATH, BACKUP_PATH)
    print(f"Created backup at {BACKUP_PATH}")

    with open(DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    crm_leads = db.get("crm_leads", {})
    messages = db.get("conversation_messages", {})
    tasks = db.get("follow_up_tasks", {})
    activities = db.get("sales_activities", {})
    requirements = db.get("customer_requirements", {})

    print(f"Initial counts: {len(crm_leads)} leads, {len(messages)} messages, {len(tasks)} tasks, {len(activities)} activities")

    # Define target merge groups
    groups_to_merge = {
        "lead_chat_test": {
            "name": "Metro Law Partners",
            "category": "Legal Services",
            "address": "Downtown, Austin, TX",
            "filter": lambda k, l: "Metro Law" in (l.get("business_name") or "") and k != "lead_chat_test"
        },
        "lead_flow_102": {
            "name": "Lakeview Dental",
            "category": "Dentists",
            "address": "Lakeview, Austin, TX",
            "filter": lambda k, l: "Lakeview Dental" in (l.get("business_name") or "") and k != "lead_flow_102"
        },
        "lead_flow_101": {
            "name": "Downtown Orthodontics",
            "category": "Dentists",
            "address": "100 Main St, Austin, TX",
            "filter": lambda k, l: "Downtown Orthodontics" in (l.get("business_name") or "") and k != "lead_flow_101"
        },
        "lead_chat_canonical": {
            "name": "Chat Test Clinic",
            "category": "Dentists",
            "address": "Austin, TX",
            "is_test": True,
            "filter": lambda k, l: "Chat Test Clinic" in (l.get("business_name") or "") and k != "lead_chat_canonical"
        },
        "lead_draft_canonical": {
            "name": "Draft Clinic",
            "category": "Dentists",
            "address": "Austin, TX",
            "is_test": True,
            "filter": lambda k, l: "Draft Clinic" in (l.get("business_name") or "") and k != "lead_draft_canonical"
        }
    }

    total_merged = 0
    total_messages_reassigned = 0
    total_tasks_reassigned = 0
    total_activities_reassigned = 0

    for surviving_id, spec in groups_to_merge.items():
        # Ensure surviving lead exists or create it
        if surviving_id not in crm_leads:
            crm_leads[surviving_id] = {
                "id": surviving_id,
                "place_id": surviving_id,
                "business_name": spec["name"],
                "category": spec["category"],
                "address": spec.get("address", ""),
                "phone": "(512) 555-0100",
                "email": f"contact@{surviving_id}.com",
                "website": "https://example.com",
                "lifecycle_stage": "Contacted",
                "lead_score": 75,
                "priority": "HIGH",
                "is_test": spec.get("is_test", False)
            }
        else:
            crm_leads[surviving_id]["business_name"] = spec["name"]
            crm_leads[surviving_id]["category"] = spec["category"]
            if spec.get("address") and not crm_leads[surviving_id].get("address"):
                crm_leads[surviving_id]["address"] = spec["address"]
            crm_leads[surviving_id]["is_test"] = spec.get("is_test", False)

        # Find matching duplicate keys
        duplicate_keys = [k for k, l in list(crm_leads.items()) if spec["filter"](k, l)]
        print(f"Group '{spec['name']}' -> surviving '{surviving_id}', found {len(duplicate_keys)} duplicates: {duplicate_keys[:3]}...")

        for dup_key in duplicate_keys:
            # Reassign messages
            for msg_id, msg in messages.items():
                if msg.get("lead_id") == dup_key:
                    msg["lead_id"] = surviving_id
                    total_messages_reassigned += 1

            # Reassign tasks
            for task_id, task in tasks.items():
                if task.get("lead_id") == dup_key:
                    task["lead_id"] = surviving_id
                    total_tasks_reassigned += 1

            # Reassign activities
            for act_id, act in activities.items():
                if act.get("lead_id") == dup_key:
                    act["lead_id"] = surviving_id
                    total_activities_reassigned += 1

            # Reassign requirements
            if dup_key in requirements and surviving_id not in requirements:
                requirements[surviving_id] = requirements.pop(dup_key)
            elif dup_key in requirements:
                del requirements[dup_key]

            # Remove duplicate lead record
            if dup_key in crm_leads:
                del crm_leads[dup_key]
                total_merged += 1

    # Mark remaining test fixtures explicitly
    test_fixture_ids = ["test_lead_001", "test_opt_out_lead", "lead_chat_canonical", "lead_draft_canonical"]
    for tid in test_fixture_ids:
        if tid in crm_leads:
            crm_leads[tid]["is_test"] = True

    # Ensure genuine businesses have is_test = False
    for lid, lead in crm_leads.items():
        if "is_test" not in lead:
            lead["is_test"] = False

    # Save cleaned DB
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)

    print(f"\nDeduplication complete:")
    print(f"Total duplicate records removed: {total_merged}")
    print(f"Total messages preserved & reassigned: {total_messages_reassigned}")
    print(f"Total tasks preserved & reassigned: {total_tasks_reassigned}")
    print(f"Total activities preserved & reassigned: {total_activities_reassigned}")
    print(f"Remaining clean CRM leads: {len(crm_leads)}")
    print(f"Genuine prospects: {sum(1 for l in crm_leads.values() if not l.get('is_test'))}")

if __name__ == "__main__":
    run_safe_deduplication()
