import os
import sys
from datetime import datetime, timezone, timedelta

TEMP_DB_NAME = "test_polarops_temp.db"
TEMP_DB_URL = f"sqlite:///./{TEMP_DB_NAME}"
os.environ["DATABASE_URL"] = TEMP_DB_URL

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app, create_access_token
from database import engine, Base
import models

def test_planner_get_and_post():
    Base.metadata.create_all(bind=engine)
    client = TestClient(app)

    token = create_access_token(data={"sub": "leader", "role": "Expedition Leader"})
    headers = {"Authorization": f"Bearer {token}"}

    # GET default planner schedule
    res = client.get("/planner", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "schedule" in data
    assert "scheduled_milestones" in data["schedule"]

    # POST new planner schedule
    deadline = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    payload = {
        "expedition_name": "Maitri 2026 Season Expedition",
        "station_name": "Maitri",
        "departure_deadline": deadline,
        "milestones": [
            {"name": "Procurement", "duration_days": 10},
            {"name": "Cargo Packing", "duration_days": 5},
            {"name": "Vessel Transit", "duration_days": 12},
            {"name": "Station Setup", "duration_days": 3}
        ]
    }

    save_res = client.post("/planner/schedule", json=payload, headers=headers)
    assert save_res.status_code == 200
    save_data = save_res.json()
    assert save_data["schedule"]["departure_deadline"] == deadline
    assert len(save_data["schedule"]["scheduled_milestones"]) == 4

    # Verify audit log recorded the update
    audit_res = client.get("/audit", headers=headers)
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert any(log["action"] == "PLAN_UPDATE" for log in audit_data)
