import os
import sys
import unittest
from datetime import datetime, timezone, timedelta

TEMP_DB_NAME = "test_polarops_temp.db"
TEMP_DB_URL = f"sqlite:///./{TEMP_DB_NAME}"
os.environ["DATABASE_URL"] = TEMP_DB_URL

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app, create_access_token
from database import engine, Base, get_db
import models

class TestPlannerSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
        db = next(get_db())
        db.query(models.AuditLog).delete()
        db.query(models.User).delete()
        db.query(models.Expedition).delete()
        db.commit()

        leader = models.User(
            username="leader",
            email="leader@polarops.in",
            hashed_password="hashed_pw_test",
            role="Expedition Leader",
            station_name="Maitri"
        )
        db.add(leader)
        db.commit()

    def test_planner_get_and_post(self):
        token = create_access_token(data={"sub": "leader", "role": "Expedition Leader"})
        headers = {"Authorization": f"Bearer {token}"}

        # GET default planner schedule
        res = self.client.get("/planner", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("schedule", data)
        self.assertIn("scheduled_milestones", data["schedule"])

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

        save_res = self.client.post("/planner/schedule", json=payload, headers=headers)
        self.assertEqual(save_res.status_code, 200)
        save_data = save_res.json()
        self.assertEqual(save_data["schedule"]["departure_deadline"], deadline)
        self.assertEqual(len(save_data["schedule"]["scheduled_milestones"]), 4)

        # Verify audit log recorded the update
        audit_res = self.client.get("/audit", headers=headers)
        self.assertEqual(audit_res.status_code, 200)
        audit_data = audit_res.json()
        self.assertTrue(any(log["action"] == "PLAN_UPDATE" for log in audit_data))

if __name__ == "__main__":
    unittest.main()

