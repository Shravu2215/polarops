import os
import sys
import json
import sqlite3
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app, create_access_token, get_db

def test_forecast_and_cargo_optimizer():
    client = TestClient(app)

    # Generate admin JWT token
    token = create_access_token({"sub": "leader", "role": "Expedition Leader", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    print("==================================================")
    print("1. TESTING GET /forecast LIVE API OUTPUT")
    print("==================================================")
    res_forecast = client.get("/forecast?temperature=-33.5&days=30", headers=headers)
    print(f"Status Code: {res_forecast.status_code}")
    print("JSON Response:")
    print(json.dumps(res_forecast.json(), indent=2))

    print("\n==================================================")
    print("2. ADDING MIX OF CARGO ITEMS FOR KNAPSACK TEST")
    print("==================================================")

    # Insert test items with varied priorities, weights, and volumes
    import time
    ts = int(time.time())
    test_items = [
        {"title": f"Emergency Medical Kit {ts}", "shipment_code": f"TEST-MED-{ts}", "weight_kg": 100, "volume_m3": 1.0, "priority": "Critical", "status": "Pending"},
        {"title": f"Radio Transmitter & Batteries {ts}", "shipment_code": f"TEST-RAD-{ts}", "weight_kg": 150, "volume_m3": 1.5, "priority": "Critical", "status": "Pending"},
        {"title": f"Polar Fuel Canisters {ts}", "shipment_code": f"TEST-FUEL-{ts}", "weight_kg": 200, "volume_m3": 2.0, "priority": "High", "status": "Pending"},
        {"title": f"Scientific Drill Spare Parts {ts}", "shipment_code": f"TEST-DRILL-{ts}", "weight_kg": 250, "volume_m3": 2.5, "priority": "Medium", "status": "Pending"},
        {"title": f"Recreational Books & Games {ts}", "shipment_code": f"TEST-BOOK-{ts}", "weight_kg": 120, "volume_m3": 1.2, "priority": "Low", "status": "Pending"},
    ]

    for item in test_items:
        res_create = client.post("/cargo", json=item, headers=headers)
        if res_create.status_code in (200, 201):
            print(f"Created: {item['title']} ({item['priority']}) - {item['weight_kg']}kg, {item['volume_m3']}m3")

    print("\n==================================================")
    print("3. TESTING POST /cargo/optimize WITH CONSTRAINED CAPACITY")
    print("Capacity: 400 kg Weight, 4.0 m3 Volume")
    print("==================================================")
    opt_payload = {
        "capacity_weight_kg": 400,
        "capacity_volume_m3": 4.0
    }
    res_opt = client.post("/cargo/optimize", json=opt_payload, headers=headers)
    print(f"Status Code: {res_opt.status_code}")
    print("JSON Response:")
    print(json.dumps(res_opt.json(), indent=2))

if __name__ == "__main__":
    test_forecast_and_cargo_optimizer()
