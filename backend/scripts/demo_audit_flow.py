import os
import sys
import json
import sqlite3

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app, create_access_token
from scripts.clean_real_db import clean_real_db
from scripts.tamper_demo import tamper_audit_log

def demo_audit_verification():
    client = TestClient(app)

    # 1. Clean real DB first
    clean_real_db()

    # Generate token for leader
    token = create_access_token({"sub": "leader", "role": "Expedition Leader", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    print("\n==================================================")
    print("1. GENERATING AUDIT LOG WRITE EVENTS IN REAL DB")
    print("==================================================")

    # Action 1: Create Cargo
    res1 = client.post("/cargo", json={
        "shipment_code": "POLAR-MED-01",
        "title": "Hypothermia Emergency Kits",
        "weight_kg": 150.0,
        "volume_m3": 1.2,
        "priority": "Critical",
        "status": "Pending"
    }, headers=headers)
    print(f"Created Cargo: {res1.status_code}")

    # Action 2: Create Vehicle
    res2 = client.post("/vehicles", json={
        "name": "Sno-Cat Bravo",
        "type": "Sno-Cat",
        "latitude": -70.766,
        "longitude": 11.733,
        "weather_limit": "Blizzard Grade A",
        "station_name": "Maitri",
        "status": "Available"
    }, headers=headers)
    print(f"Created Vehicle: {res2.status_code}")

    # Action 3: Run Cargo Optimizer
    res3 = client.post("/cargo/optimize", json={
        "capacity_weight_kg": 500.0,
        "capacity_volume_m3": 5.0
    }, headers=headers)
    print(f"Ran Cargo Optimizer: {res3.status_code}")

    print("\n==================================================")
    print("2. TESTING GET /audit/verify (BEFORE TAMPER - VALID CHAIN)")
    print("==================================================")
    res_v1 = client.get("/audit/verify", headers=headers)
    print(f"Status Code: {res_v1.status_code}")
    print("JSON Output:")
    print(json.dumps(res_v1.json(), indent=2))

    print("\n==================================================")
    print("3. EXECUTING TAMPER DEMO SCRIPT (scripts/tamper_demo.py --confirm)")
    print("==================================================")
    db_real_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "polarops.db"))
    
    # Mutate DB directly using sqlite3
    conn = sqlite3.connect(db_real_path)
    conn.execute("UPDATE audit_logs SET action = 'MALICIOUS_TAMPERED_ACTION' WHERE id = 1")
    conn.commit()
    conn.close()
    print("Directly tampered row #1 in polarops.db!")

    print("\n==================================================")
    print("4. TESTING GET /audit/verify (AFTER TAMPER - BROKEN CHAIN)")
    print("==================================================")
    res_v2 = client.get("/audit/verify", headers=headers)
    print(f"Status Code: {res_v2.status_code}")
    print("JSON Output:")
    print(json.dumps(res_v2.json(), indent=2))

    print("\n==================================================")
    print("5. RESTORING REAL POLAROPS.DB TO CLEAN STATE")
    print("==================================================")
    conn = sqlite3.connect(db_real_path)
    conn.execute("DELETE FROM audit_logs")
    conn.execute("DELETE FROM cargo_shipments WHERE shipment_code = 'POLAR-MED-01'")
    conn.execute("DELETE FROM vehicles WHERE name = 'Sno-Cat Bravo'")
    conn.commit()
    conn.close()
    print("Restored real database to clean baseline.")

if __name__ == "__main__":
    demo_audit_verification()
