import os
import sys
import json
import sqlite3

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

if __name__ == "__main__":
    test_forecast_cargo_and_audit()
