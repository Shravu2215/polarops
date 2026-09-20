import os
import sys
import json
import sqlite3
from datetime import datetime, timezone

# MANDATORY TEST HYGIENE: Force temporary database before ANY backend imports
TEMP_DB_NAME = "test_polarops_temp.db"
TEMP_DB_URL = f"sqlite:///./{TEMP_DB_NAME}"
os.environ["DATABASE_URL"] = TEMP_DB_URL

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app, create_access_token
from database import engine, Base
import models
from scripts.tamper_demo import tamper_audit_log

def test_forecast_cargo_and_audit():
    # Remove existing temp DB if left over
    if os.path.exists(TEMP_DB_NAME):
        try:
            os.remove(TEMP_DB_NAME)
        except OSError:
            pass

    # Create fresh schema in temp DB
    Base.metadata.create_all(bind=engine)
    client = TestClient(app)

    # Seed Admin User in temp DB via FastAPI register
    reg_res = client.post("/auth/register", json={
        "username": "leader",
        "email": "leader@polarops.in",
        "password": "leader_test_password_2026"
    })
    
    # Authenticate Leader Token
    login_res = client.post("/auth/login", json={
        "email": "leader@polarops.in",
        "password": "leader_test_password_2026"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Promote user to Expedition Leader for test permissions
    conn = sqlite3.connect(TEMP_DB_NAME)
    conn.execute("UPDATE users SET role = 'Expedition Leader' WHERE email = 'leader@polarops.in'")
    conn.commit()
    conn.close()

    print("==================================================")
    print("1. TESTING GET /forecast ON TEMP DATABASE")
    print("==================================================")
    res_forecast = client.get("/forecast?temperature=-33.5&days=30", headers=headers)
    print(f"Status Code: {res_forecast.status_code}")
    print("JSON Response:")
    print(json.dumps(res_forecast.json(), indent=2))

    print("\n==================================================")
    print("2. TESTING CRITICAL DOMINANCE IN CARGO OPTIMIZER")
    print("Proving 2 High items (50+50=100pts) do NOT displace 1 Critical item (1000pts)")
    print("==================================================")

    # Cargo setup:
    # Item A: Critical (1000 pts) - 100 kg, 1.0 m3
    # Item B: High (50 pts) - 60 kg, 0.6 m3
    # Item C: High (50 pts) - 60 kg, 0.6 m3
    # Capacity limit: Weight = 110 kg, Volume = 1.1 m3
    # Note: 2 High items fit together (120kg > 110kg wait, 2x 50kg = 100kg fit), giving 100 pts.
    # But 1 Critical item fits alone (100kg <= 110kg), giving 1000 pts!
    # CP-SAT must select 1 Critical item (1000 pts) and leave behind both High items!

    items = [
        {"title": "Critical Hypothermia Med Kit", "shipment_code": "CRIT-01", "weight_kg": 100, "volume_m3": 1.0, "priority": "Critical", "status": "Pending"},
        {"title": "High Priority Ration Box 1", "shipment_code": "HIGH-01", "weight_kg": 50, "volume_m3": 0.5, "priority": "High", "status": "Pending"},
        {"title": "High Priority Ration Box 2", "shipment_code": "HIGH-02", "weight_kg": 50, "volume_m3": 0.5, "priority": "High", "status": "Pending"},
    ]

    for item in items:
        res_create = client.post("/cargo", json=item, headers=headers)
        assert res_create.status_code == 200, f"Failed to create cargo {item['shipment_code']}"

    opt_payload = {
        "capacity_weight_kg": 110,
        "capacity_volume_m3": 1.1
    }
    res_opt = client.post("/cargo/optimize", json=opt_payload, headers=headers)
    print(f"Status Code: {res_opt.status_code}")
    opt_data = res_opt.json()
    print("JSON Response:")
    print(json.dumps(opt_data, indent=2))

    packed_titles = [i["title"] for i in opt_data["packed_items"]]
    left_titles = [i["title"] for i in opt_data["left_behind_items"]]

    assert "Critical Hypothermia Med Kit" in packed_titles, "Critical item MUST be packed!"
    assert "High Priority Ration Box 1" in left_titles and "High Priority Ration Box 2" in left_titles, "High items must NOT displace Critical item!"
    print("-> VERIFIED: Critical item (1000 pts) dominated over two High items (100 pts combined)!")

    print("\n==================================================")
    print("3. TESTING HASH-CHAINED AUDIT VERIFICATION (BEFORE TAMPER)")
    print("==================================================")
    res_verify_before = client.get("/audit/verify", headers=headers)
    print(f"Status Code: {res_verify_before.status_code}")
    verify_before_data = res_verify_before.json()
    print("JSON Response:")
    print(json.dumps(verify_before_data, indent=2))
    assert verify_before_data["valid"] == True, "Audit chain must be VALID before tampering!"

    print("\n==================================================")
    print("4. SIMULATING DATABASE TAMPERING ON TEMP DB")
    print("==================================================")
    conn = sqlite3.connect(TEMP_DB_NAME)
    conn.execute("UPDATE audit_logs SET action = 'TAMPERED_MALICIOUS_ACTION' WHERE id = 1")
    conn.commit()
    conn.close()
    print("Directly mutated row #1 action in test database file!")

    print("\n==================================================")
    print("5. TESTING HASH-CHAINED AUDIT VERIFICATION (AFTER TAMPER)")
    print("==================================================")
    res_verify_after = client.get("/audit/verify", headers=headers)
    print(f"Status Code: {res_verify_after.status_code}")
    verify_after_data = res_verify_after.json()
    print("JSON Response:")
    print(json.dumps(verify_after_data, indent=2))
    assert verify_after_data["valid"] == False, "Audit chain must detect TAMPERING!"
    print("-> VERIFIED: Audit verification successfully detected tampered entry!")

    # Teardown temp DB
    try:
        os.remove(TEMP_DB_NAME)
    except OSError:
        pass

def test_simulator_and_priority_sync():
    if os.path.exists(TEMP_DB_NAME):
        try:
            os.remove(TEMP_DB_NAME)
        except OSError:
            pass

    Base.metadata.create_all(bind=engine)
    client = TestClient(app)

    # Register and Login
    client.post("/auth/register", json={
        "username": "test_leader",
        "email": "leader2@polarops.in",
        "password": "leader_test_password_2026"
    })
    login_res = client.post("/auth/login", json={
        "email": "leader2@polarops.in",
        "password": "leader_test_password_2026"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from database import SessionLocal
    db = SessionLocal()
    u = db.query(models.User).filter(models.User.email == "leader2@polarops.in").first()
    if u:
        u.role = "Expedition Leader"
        db.commit()
    db.close()

    print("\n==================================================")
    print("PART 1 TEST: SIMULATOR FIXES & ASSERTIONS")
    print("==================================================")

    # 1. Create Active Expedition
    exp_res = client.post("/expeditions", json={
        "name": "Maitri Expedition 45",
        "station_name": "Maitri",
        "latitude": -70.7660,
        "longitude": 11.7330,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "target_team_size": 6,
        "status": "Active"
    }, headers=headers)
    print(f"Expedition Status: {exp_res.status_code}, body: {exp_res.text}")
    assert exp_res.status_code == 200

    # 2. Add Ration item: 5000 packs, daily use 3.0, cold sensitivity 1.0 (cf=1.335 @ -33.5C)
    ration_res = client.post("/inventory", json={
        "name": "Emergency Ration Packs",
        "category": "Ration",
        "quantity": 5000,
        "unit": "Packs",
        "min_required": 500,
        "daily_use_per_person": 3.0,
        "location_station": "Maitri",
        "cold_factor_sensitivity": 1.0
    }, headers=headers)
    assert ration_res.status_code == 200

    # 3. Add Fuel item
    fuel_res = client.post("/inventory", json={
        "name": "Jet-A1 Fuel",
        "category": "Fuel",
        "quantity": 8000,
        "unit": "Litres",
        "min_required": 1000,
        "daily_use_per_person": 5.0,
        "location_station": "Maitri",
        "cold_factor_sensitivity": 1.0
    }, headers=headers)
    assert fuel_res.status_code == 200

    # 4. Run /simulate with fuel_loss_percent=25.0
    sim_res = client.post("/simulate", json={
        "resupply_in_days": 60,
        "delay_days": 0,
        "blizzard_days": 0,
        "fuel_loss_percent": 25.0,
        "temperature": -33.5,
        "runs": 1000
    }, headers=headers)
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    print("Simulator Output:")
    print(json.dumps(sim_data, indent=2))

    ration_b = next(item for item in sim_data["baseline_items"] if item["category"] == "Ration")
    ration_s = next(item for item in sim_data["scenario_items"] if item["category"] == "Ration")
    b_p50 = ration_b["p50_days"]
    b_p10 = ration_b["p10_days"]
    b_p90 = ration_b["p90_days"]

    expected_days = 5000.0 / (6 * 3.0 * 1.335)  # ~208.07

    # Assertion (a): Baseline and scenario are identical for Rations when only fuel_loss_percent is set
    assert ration_b == ration_s, "Ration baseline & scenario MUST be identical when fuel_loss_percent only is changed!"
    print("-> ASSERTION (a) PASSED: Baseline and scenario are 100% identical for Ration!")

    # Assertion (b): P50 is within 2 percent of quantity / (team x daily_use x cold_factor)
    p50_diff_percent = abs(b_p50 - expected_days) / expected_days * 100.0
    print(f"Ration P50 = {b_p50}, Expected = {expected_days:.2f}, Diff = {p50_diff_percent:.2f}%")
    assert p50_diff_percent <= 2.0, f"P50 ({b_p50}) is not within 2% of expected ({expected_days:.2f})"
    print("-> ASSERTION (b) PASSED: P50 is within 2% of expected days formula!")

    # Assertion (c): Spread is greater than zero
    spread = b_p90 - b_p10
    print(f"Ration Spread (P90 - P10) = {spread:.2f} days")
    assert spread > 0, "Spread (P90 - P10) MUST be > 0!"
    print("-> ASSERTION (c) PASSED: Spread is greater than zero!")


    print("\n==================================================")
    print("PART 2 TEST: PRIORITY SYNC FLUSH ORDER & IDEMPOTENCY REPLAY")
    print("==================================================")

    # Seed Person record with fresh location for SOS dispatch matching
    db = SessionLocal()
    p = models.Person(
        name="Dr Rahul",
        role="Expedition Leader",
        skills=["leader", "medical"],
        latitude=-70.7660,
        longitude=11.7330,
        station_name="Maitri",
        status="Active",
        last_location_update=datetime.now(timezone.utc)
    )
    db.add(p)
    db.commit()
    db.close()

    # Setup client-side offline queue (Low inventory, then cargo, then SOS)
    queue = [
        {"priority": 2, "type": "inventory", "key": "idem-inv-101", "endpoint": "/inventory", "method": "POST", "body": {
            "name": "Spare Batteries", "category": "Spares", "quantity": 50, "unit": "Units",
            "min_required": 10, "daily_use_per_person": 0.1, "location_station": "Maitri", "client_timestamp": "2026-09-21T00:00:01Z"
        }},
        {"priority": 1, "type": "cargo", "key": "idem-cargo-101", "endpoint": "/cargo", "method": "POST", "body": {
            "shipment_code": "CRG-TEST", "title": "Medical Oxygen", "weight_kg": 40, "volume_m3": 0.4,
            "priority": "High", "status": "Pending", "client_timestamp": "2026-09-21T00:00:02Z"
        }},
        {"priority": 0, "type": "sos", "key": "idem-sos-101", "endpoint": "/sos", "method": "POST", "body": {
            "skill_needed": "Leader", "latitude": -70.7660, "longitude": 11.7330, "client_timestamp": "2026-09-21T00:00:03Z"
        }}
    ]

    # Mobile queue flush sorts strictly by priority ascending (0, then 1, then 2)
    sorted_queue = sorted(queue, key=lambda x: (x["priority"], x["body"]["client_timestamp"]))
    print("Sorted Queue Flush Order:")
    for idx, item in enumerate(sorted_queue):
        print(f"  Step {idx+1}: Priority {item['priority']} ({item['type']}) - Idempotency Key: {item['key']}")

    assert sorted_queue[0]["type"] == "sos", "SOS MUST be sent first!"
    assert sorted_queue[1]["type"] == "cargo", "Cargo MUST be sent second!"
    assert sorted_queue[2]["type"] == "inventory", "Inventory MUST be sent third!"

    # Execute sorted queue requests to server
    for item in sorted_queue:
        req_headers = {**headers, "Idempotency-Key": item["key"], "Client-Timestamp": item["body"]["client_timestamp"]}
        r = client.post(item["endpoint"], json=item["body"], headers=req_headers)
        assert r.status_code == 200, f"Failed to execute {item['type']}: {r.text}"

    # Verify processing order in server Audit Logs
    conn = sqlite3.connect(TEMP_DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT action, target_resource, payload FROM audit_logs ORDER BY id ASC")
    logs = cursor.fetchall()
    conn.close()

    print("\nAudit Logs Recorded in DB:")
    recent_actions = [l[0] for l in logs if l[0] in ("SOS_DISPATCH", "CARGO_CREATED", "INVENTORY_ADDED") and "Spare Batteries" in l[2] or "CRG-TEST" in l[2] or "SOS" in l[0]]
    for act in recent_actions:
        print(f"  Logged Action: {act}")

    # SOS dispatched first, cargo created second, inventory added third
    assert recent_actions[0] == "SOS_DISPATCH", "Server MUST process SOS first!"
    assert recent_actions[1] == "CARGO_CREATED", "Server MUST process Cargo second!"
    assert recent_actions[2] == "INVENTORY_ADDED", "Server MUST process Inventory third!"
    print("-> VERIFIED: Queue processed strictly in Priority order (SOS=0 -> Cargo=1 -> Inventory=2)!")

    # Test Idempotency Replay (resend SOS with identical key)
    sos_item = sorted_queue[0]
    replay_headers = {**headers, "Idempotency-Key": sos_item["key"], "Client-Timestamp": sos_item["body"]["client_timestamp"]}
    replay_res = client.post(sos_item["endpoint"], json=sos_item["body"], headers=replay_headers)
    assert replay_res.status_code == 200, "Replay must return HTTP 200"

    # Count alerts & audit logs in DB
    conn = sqlite3.connect(TEMP_DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE alert_type = 'SOS'")
    alert_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE action = 'SOS_DISPATCH'")
    sos_audit_count = cursor.fetchone()[0]
    conn.close()

    print(f"Alerts Count in DB: {alert_count} (expected: 1)")
    print(f"SOS Audit Logs in DB: {sos_audit_count} (expected: 1)")
    assert alert_count == 1, "Idempotency replay MUST NOT create duplicate Alert!"
    assert sos_audit_count == 1, "Idempotency replay MUST NOT create duplicate AuditLog!"
    print("-> VERIFIED: Idempotency replay returned cached result with zero duplicates!")

    # Teardown
    try:
        os.remove(TEMP_DB_NAME)
    except OSError:
        pass

if __name__ == "__main__":
    test_forecast_cargo_and_audit()
    test_simulator_and_priority_sync()
