import os
import sys
import json
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app, create_access_token

def test_simulate():
    client = TestClient(app)

    # Auth Token for leader
    token = create_access_token({"sub": "leader", "role": "Expedition Leader", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    print("==================================================")
    print("TESTING POST /simulate (Resupply=100 days, Delay=5 days)")
    print("==================================================")
    payload = {
        "resupply_in_days": 100,
        "delay_days": 5,
        "blizzard_days": 2,
        "fuel_loss_percent": 10,
        "temperature": -33.5,
        "runs": 1000
    }

    res = client.post("/simulate", json=payload, headers=headers)
    print(f"Status Code: {res.status_code}")
    print("JSON Response Output:")
    print(json.dumps(res.json(), indent=2))

if __name__ == "__main__":
    test_simulate()
