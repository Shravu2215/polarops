import os
import sys
import unittest
from datetime import datetime, timezone, timedelta

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set SQLite dev test DB
os.environ["USE_SQLITE"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///./test_polarops_temp.db"
os.environ["ADMIN_EMAIL"] = "leader@polarops.in"
os.environ["ADMIN_PASSWORD"] = "test_suite_leader_password_2026"
os.environ["JWT_SECRET"] = "test_suite_jwt_secret_key_2026_x9k2m7"

from fastapi.testclient import TestClient
from main import app
from database import engine, Base, get_db
import models
from auth_utils import hash_password

class TestRequirementsSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
        # Clean DB tables before each test
        db = next(get_db())
        db.query(models.AuditLog).delete()
        db.query(models.Alert).delete()
        db.query(models.Vehicle).delete()
        db.query(models.Person).delete()
        db.query(models.User).delete()
        db.query(models.InventoryItem).delete()
        db.query(models.CargoShipment).delete()
        db.query(models.Expedition).delete()
        db.commit()

        # Seed Bootstrap Expedition Leader
        leader = models.User(
            username="leader",
            email="leader@polarops.in",
            hashed_password=hash_password("test_suite_leader_password_2026"),
            role="Expedition Leader",
            station_name="Maitri"
        )
        db.add(leader)
        db.commit()

        # Obtain Leader Token
        resp = self.client.post("/auth/login", json={"email": "leader@polarops.in", "password": "test_suite_leader_password_2026"})
        self.assertEqual(resp.status_code, 200)
        self.leader_token = resp.json()["access_token"]
        self.leader_headers = {"Authorization": f"Bearer {self.leader_token}"}

    def test_requirement_1_registration_role_enforcement(self):
        """Req 1: POST /auth/register must ALWAYS assign role 'Team Member' ignoring client attempt to claim Leader"""
        resp = self.client.post("/auth/register", json={
            "username": "hacker",
            "email": "hacker@polarops.in",
            "password": "password123",
            "role": "Expedition Leader"  # Client trying to claim Leader role!
        })
        self.assertEqual(resp.status_code, 200)
        user_data = resp.json()["user"]
        self.assertEqual(user_data["role"], "Team Member", "Registration must strictly enforce Team Member role!")

    def test_requirement_4_auth_unauthenticated_and_forbidden_calls(self):
        """Req 4: Unauthenticated calls get 401, Team Member gets 403 on write endpoints"""
        # Unauthenticated 401 checks
        self.assertEqual(self.client.get("/inventory").status_code, 401)
        self.assertEqual(self.client.get("/expeditions").status_code, 401)
        self.assertEqual(self.client.get("/vehicles").status_code, 401)
        self.assertEqual(self.client.get("/cargo").status_code, 401)
        self.assertEqual(self.client.get("/dashboard/summary").status_code, 401)

        # Register a Team Member
        reg_resp = self.client.post("/auth/register", json={
            "username": "alex",
            "email": "alex@polarops.in",
            "password": "password123"
        })
        team_token = reg_resp.json()["access_token"]
        team_headers = {"Authorization": f"Bearer {team_token}"}

        # Team Member 403 Forbidden on write endpoints
        post_inv = self.client.post("/inventory", headers=team_headers, json={
            "name": "Diesel Fuel Drums", "category": "Fuel", "quantity": 1000, "unit": "L", "min_required": 100, "daily_use_per_person": 2, "location_station": "Maitri"
        })
        self.assertEqual(post_inv.status_code, 403, "Team Member must get 403 on POST /inventory")

        post_usr = self.client.post("/users", headers=team_headers, json={
            "username": "user2", "email": "user2@polarops.in", "password": "pw", "role": "Base Admin", "station_name": "Maitri"
        })
        self.assertEqual(post_usr.status_code, 403, "Team Member must get 403 on POST /users")

        patch_role = self.client.patch("/users/1/role", headers=team_headers, json={"role": "Expedition Leader"})
        self.assertEqual(patch_role.status_code, 403, "Team Member must get 403 on PATCH /users/{id}/role")

    def test_requirement_5_end_to_end_sos_dispatch(self):
        """Req 5: SOS dispatch with real doctor & vehicle (<10m fresh) vs stale location (>15m old)"""
        db = next(get_db())

        # 1. Leader provisions Doctor account with doctor skill & fresh location (1 minute ago)
        now_dt = datetime.now(timezone.utc)
        doctor_user = models.User(
            username="drsarah",
            email="sarah@polarops.in",
            hashed_password=hash_password("password123"),
            role="Team Member",
            station_name="Maitri",
            skills=["doctor", "first_aid"],
            latitude=-70.7660,
            longitude=11.7330,
            last_location_update=now_dt - timedelta(minutes=1)
        )
        db.add(doctor_user)
        db.commit()

        doctor_person = models.Person(
            name="Dr. Sarah",
            role="Doctor",
            skills=["doctor", "first_aid"],
            latitude=-70.7660,
            longitude=11.7330,
            station_name="Maitri",
            status="Active",
            user_id=doctor_user.id,
            last_location_update=now_dt - timedelta(minutes=1)
        )
        db.add(doctor_person)

        # 2. Add Available Vehicle
        vehicle = models.Vehicle(
            name="Snowcat Alpha",
            type="Sno-Cat",
            latitude=-70.7660,
            longitude=11.7330,
            station_name="Maitri",
            status="Available",
            weather_limit="80 km/h"
        )
        db.add(vehicle)
        db.commit()

        # 3. Register Team Member Alex & trigger SOS for doctor skill
        reg_resp = self.client.post("/auth/register", json={
            "username": "alex",
            "email": "alex@polarops.in",
            "password": "password123"
        })
        team_headers = {"Authorization": f"Bearer {reg_resp.json()['access_token']}"}

        sos_resp1 = self.client.post("/sos", headers=team_headers, json={
            "skill_needed": "doctor",
            "latitude": -70.7660,
            "longitude": 11.7330
        })
        self.assertEqual(sos_resp1.status_code, 200)
        data1 = sos_resp1.json()
        self.assertEqual(data1["status"], "Dispatched")
        self.assertEqual(data1["responder_name"], "Dr. Sarah")
        self.assertEqual(data1["vehicle_name"], "Snowcat Alpha")
        print("\n[Req 5 Test] Fresh Location Dispatch Success:", data1)

        # 4. Age Dr. Sarah's location timestamp to 15 minutes ago in DB
        stale_time = now_dt - timedelta(minutes=15)
        doctor_person.last_location_update = stale_time
        doctor_person.updated_at = stale_time
        doctor_person.status = "Active"  # Reset status
        vehicle.status = "Available"
        db.commit()

        # 5. Trigger SOS again -> Expect "No Responder Available"
        sos_resp2 = self.client.post("/sos", headers=team_headers, json={
            "skill_needed": "doctor",
            "latitude": -70.7660,
            "longitude": 11.7330
        })
        self.assertEqual(sos_resp2.status_code, 200)
        data2 = sos_resp2.json()
        self.assertEqual(data2["status"], "No Responder Available")
        print("[Req 5 Test] Stale Location (>15m) No Responder Response:", data2)

    def test_requirement_4_startup_secret_refusal(self):
        """Req 4: Server startup must refuse/raise RuntimeError if ADMIN_PASSWORD or JWT_SECRET are missing"""
        orig_pass = os.environ.get("ADMIN_PASSWORD")
        try:
            os.environ["ADMIN_PASSWORD"] = ""
            import config
            # Reloading config with empty ADMIN_PASSWORD must raise RuntimeError
            import importlib
            with self.assertRaises(RuntimeError) as ctx:
                importlib.reload(config)
            self.assertIn("ADMIN_PASSWORD and JWT_SECRET", str(ctx.exception))
            print("\n[Req 4 Test] Startup Secret Refusal Success: Raised RuntimeError on missing secret.")
        finally:
            if orig_pass:
                os.environ["ADMIN_PASSWORD"] = orig_pass
            import config
            import importlib
            importlib.reload(config)

if __name__ == "__main__":
    unittest.main()
