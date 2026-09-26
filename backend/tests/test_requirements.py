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
        db.query(models.EmergencySOS).delete()
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
            "password": "test_suite_password_2026",
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
            "password": "test_suite_password_2026"
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

    def test_expedition_creation_role_permissions(self):
        """Only Expedition Leader can create expeditions. Logistics Officer, Base Admin, Team Member get 403."""
        # 1. Register users for each non-leader role
        reg_tm = self.client.post("/auth/register", json={"username": "member1", "email": "m1@polarops.in", "password": "password123"})
        tm_headers = {"Authorization": f"Bearer {reg_tm.json()['access_token']}"}

        # Leader creates user with Logistics Officer role
        prov_log = self.client.post("/users", headers=self.leader_headers, json={
            "username": "logistics1", "email": "log1@polarops.in", "password": "password123", "role": "Logistics Officer", "station_name": "Maitri"
        })
        log_token = self.client.post("/auth/login", json={"email": "log1@polarops.in", "password": "password123"}).json()["access_token"]
        log_headers = {"Authorization": f"Bearer {log_token}"}

        # Leader creates user with Base Admin role
        prov_admin = self.client.post("/users", headers=self.leader_headers, json={
            "username": "admin1", "email": "admin1@polarops.in", "password": "password123", "role": "Base Admin", "station_name": "Bharati"
        })
        admin_token = self.client.post("/auth/login", json={"email": "admin1@polarops.in", "password": "password123"}).json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Test Polar Expedition",
            "station_name": "Maitri",
            "start_date": "2026-11-01",
            "end_date": "2027-03-01",
            "assigned_members": [reg_tm.json()["user"]["id"]]
        }

        # Non-Leader roles must get 403 Forbidden
        self.assertEqual(self.client.post("/expeditions", headers=tm_headers, json=payload).status_code, 403)
        self.assertEqual(self.client.post("/expeditions", headers=log_headers, json=payload).status_code, 403)
        self.assertEqual(self.client.post("/expeditions", headers=admin_headers, json=payload).status_code, 403)

        # Leader role must succeed (200)
        leader_resp = self.client.post("/expeditions", headers=self.leader_headers, json=payload)
        self.assertEqual(leader_resp.status_code, 200)
        exp_data = leader_resp.json()
        self.assertIn("id", exp_data)
        self.assertEqual(exp_data["latitude"], -70.7660)
        self.assertEqual(exp_data["longitude"], 11.7330)
        self.assertEqual(exp_data["target_team_size"], 1)
        self.assertEqual(exp_data["assigned_members"], [reg_tm.json()["user"]["id"]])

    def test_multiple_expeditions_coexist_without_status_changes(self):
        statuses = ["Active", "Active", "Planning", "Completed"]
        created_statuses = {}

        for index, expedition_status in enumerate(statuses, start=1):
            response = self.client.post("/expeditions", headers=self.leader_headers, json={
                "name": f"Persistence Expedition {index}",
                "station_name": "Maitri",
                "start_date": "2026-11-01",
                "end_date": "2027-03-01",
                "status": expedition_status
            })
            self.assertEqual(response.status_code, 200, response.text)
            created_statuses[response.json()["id"]] = expedition_status

        self.assertEqual(len(created_statuses), len(statuses))

        list_response = self.client.get("/expeditions", headers=self.leader_headers)
        self.assertEqual(list_response.status_code, 200)
        returned_statuses = {
            expedition["id"]: expedition["status"]
            for expedition in list_response.json()
            if expedition["id"] in created_statuses
        }
        self.assertEqual(returned_statuses, created_statuses)

    def test_expedition_details_include_saved_plan_and_activity(self):
        create_response = self.client.post("/expeditions", headers=self.leader_headers, json={
            "name": "Detailed Expedition",
            "station_name": "Maitri",
            "start_date": "2026-11-01",
            "end_date": "2027-03-01",
            "status": "Completed"
        })
        self.assertEqual(create_response.status_code, 200)
        expedition_id = create_response.json()["id"]
        deadline = (datetime.now(timezone.utc) + timedelta(days=60)).strftime("%Y-%m-%d")

        plan_response = self.client.post("/planner/schedule", headers=self.leader_headers, json={
            "expedition_id": expedition_id,
            "departure_deadline": deadline,
            "milestones": [{"name": "Cargo preparation", "duration_days": 5}]
        })
        self.assertEqual(plan_response.status_code, 200)

        detail_response = self.client.get(
            f"/expeditions/{expedition_id}", headers=self.leader_headers
        )
        self.assertEqual(detail_response.status_code, 200)
        detail = detail_response.json()
        self.assertEqual(detail["id"], expedition_id)
        self.assertEqual(detail["status"], "Completed")
        self.assertEqual(detail["departure_deadline"], deadline)
        self.assertEqual(detail["milestones"][0]["name"], "Cargo preparation")
        self.assertEqual(
            [entry["action"] for entry in detail["activity"]],
            ["EXPEDITION_CREATED", "PLAN_UPDATE"]
        )

        missing_response = self.client.get("/expeditions/999999", headers=self.leader_headers)
        self.assertEqual(missing_response.status_code, 404)

    def test_leader_supply_requirements_persist_for_station_operations(self):
        expedition_response = self.client.post("/expeditions", headers=self.leader_headers, json={
            "name": "Supply Request Expedition",
            "station_name": "Maitri",
            "start_date": "2026-11-01",
            "end_date": "2027-03-01",
            "status": "Active"
        })
        self.assertEqual(expedition_response.status_code, 200)
        expedition_id = expedition_response.json()["id"]

        requirement_response = self.client.post("/expedition-requirements", headers=self.leader_headers, json={
            "expedition_id": expedition_id,
            "supply_name": "Sub-Zero Diesel Fuel (Special Additive)",
            "quantity": 200
        })
        self.assertEqual(requirement_response.status_code, 200)
        self.assertEqual(requirement_response.json()["unit"], "Litres")
        self.assertEqual(requirement_response.json()["status"], "Requested")

        for role in ("Logistics Officer", "Base Admin"):
            username = role.lower().replace(" ", "_")
            email = f"{username}@polarops.in"
            user_response = self.client.post("/users", headers=self.leader_headers, json={
                "username": username,
                "email": email,
                "password": "password123",
                "role": role,
                "station_name": "Maitri"
            })
            self.assertEqual(user_response.status_code, 200)
            token_response = self.client.post("/auth/login", json={
                "email": email,
                "password": "password123"
            })
            self.assertEqual(token_response.status_code, 200)
            headers = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

            visible_response = self.client.get(
                f"/expedition-requirements?expedition_id={expedition_id}",
                headers=headers
            )
            self.assertEqual(visible_response.status_code, 200)
            self.assertEqual(len(visible_response.json()), 1)
            self.assertEqual(visible_response.json()[0]["quantity"], 200)

    def test_vehicle_permissions_assignment_status_and_soft_deactivation(self):
        member_response = self.client.post("/auth/register", json={
            "username": "fleet_member",
            "email": "fleet_member@polarops.in",
            "password": "test_suite_password_2026",
            "station_name": "Maitri",
        })
        member_headers = {"Authorization": f"Bearer {member_response.json()['access_token']}"}
        member_id = member_response.json()["user"]["id"]

        logistics_headers = self._create_role_user("fleet_logistics", "Logistics Officer", "Maitri")
        admin_headers = self._create_role_user("fleet_admin", "Base Admin", "Maitri")

        expedition_response = self.client.post("/expeditions", headers=self.leader_headers, json={
            "name": "Fleet Assignment Expedition",
            "station_name": "Maitri",
            "start_date": "2026-11-01",
            "end_date": "2027-03-01",
            "assigned_members": [member_id],
            "status": "Active",
        })
        expedition_id = expedition_response.json()["id"]

        vehicle_payload = {
            "name": "Fleet Test Sno-Cat",
            "type": "Sno-Cat",
            "station_name": "Maitri",
            "latitude": -70.766,
            "longitude": 11.733,
            "weather_limit": "80 km/h",
        }
        self.assertEqual(self.client.post("/vehicles", headers=self.leader_headers, json=vehicle_payload).status_code, 403)

        create_response = self.client.post("/vehicles", headers=admin_headers, json=vehicle_payload)
        self.assertEqual(create_response.status_code, 200, create_response.text)
        vehicle_id = create_response.json()["id"]

        edit_response = self.client.patch(
            f"/vehicles/{vehicle_id}",
            headers=admin_headers,
            json={"name": "Fleet Test Sno-Cat Edited"},
        )
        self.assertEqual(edit_response.status_code, 200)

        leader_vehicles = self.client.get("/vehicles", headers=self.leader_headers).json()
        vehicle = next(item for item in leader_vehicles if item["id"] == vehicle_id)
        self.assertEqual(vehicle["name"], "Fleet Test Sno-Cat Edited")
        self.assertEqual(vehicle["status"], "Available")

        request_response = self.client.post(
            f"/vehicles/{vehicle_id}/request",
            headers=self.leader_headers,
            json={"expedition_id": expedition_id},
        )
        self.assertEqual(request_response.status_code, 200)
        logistics_vehicle = next(
            item for item in self.client.get("/vehicles", headers=logistics_headers).json()
            if item["id"] == vehicle_id
        )
        self.assertEqual(logistics_vehicle["request_status"], "Requested")

        assign_response = self.client.post(
            f"/vehicles/{vehicle_id}/assign",
            headers=logistics_headers,
            json={"expedition_id": expedition_id},
        )
        self.assertEqual(assign_response.status_code, 200)
        team_vehicles = self.client.get("/vehicles", headers=member_headers).json()
        self.assertEqual([item["id"] for item in team_vehicles], [vehicle_id])
        self.assertEqual(team_vehicles[0]["status"], "In Use")
        self.assertEqual(team_vehicles[0]["assigned_expedition_id"], expedition_id)

        status_response = self.client.patch(
            f"/vehicles/{vehicle_id}/status",
            headers=logistics_headers,
            json={"status": "Maintenance"},
        )
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(self.client.get("/vehicles", headers=member_headers).json()[0]["status"], "Maintenance")

        deactivate_response = self.client.patch(
            f"/vehicles/{vehicle_id}/deactivate",
            headers=admin_headers,
        )
        self.assertEqual(deactivate_response.status_code, 200)
        self.assertEqual(self.client.get("/vehicles", headers=member_headers).json(), [])
        retired_vehicle = next(
            item for item in self.client.get("/vehicles", headers=admin_headers).json()
            if item["id"] == vehicle_id
        )
        self.assertFalse(retired_vehicle["is_active"])
        self.assertEqual(retired_vehicle["assigned_expedition_id"], expedition_id)

    def _create_role_user(self, username, role, station_name):
        email = f"{username}@polarops.in"
        create_response = self.client.post("/users", headers=self.leader_headers, json={
            "username": username,
            "email": email,
            "password": "password123",
            "role": role,
            "station_name": station_name,
        })
        self.assertEqual(create_response.status_code, 200, create_response.text)
        login_response = self.client.post("/auth/login", json={"email": email, "password": "password123"})
        self.assertEqual(login_response.status_code, 200)
        return {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    def test_station_inventory_supply_catalog_and_permissions(self):
        """Req: Standard catalog, Base Admin ownership, non-Base Admin 403, and duplicate prevention."""
        # 1. GET /supply-catalog returns list of standard catalog supplies
        cat_resp = self.client.get("/supply-catalog", headers=self.leader_headers)
        self.assertEqual(cat_resp.status_code, 200)
        catalog = cat_resp.json()
        self.assertGreater(len(catalog), 5)
        self.assertIn("Food & Water", [c["category"] for c in catalog])

        # 2. Register users & tokens
        reg_tm = self.client.post("/auth/register", json={"username": "m2", "email": "m2@polarops.in", "password": "password123"})
        tm_headers = {"Authorization": f"Bearer {reg_tm.json()['access_token']}"}

        self.client.post("/users", headers=self.leader_headers, json={
            "username": "baseadmin1", "email": "ba1@polarops.in", "password": "password123", "role": "Base Admin", "station_name": "Maitri"
        })
        ba_token = self.client.post("/auth/login", json={"email": "ba1@polarops.in", "password": "password123"}).json()["access_token"]
        ba_headers = {"Authorization": f"Bearer {ba_token}"}

        inv_payload = {
            "name": "Dehydrated Ration Packs",
            "category": "Food & Water",
            "quantity": 500.0,
            "unit": "Packs",
            "min_required": 100.0,
            "daily_use_per_person": 3.0,
            "location_station": "Maitri"
        }

        # 3. Non-Base Admin roles (Leader & Team Member) get 403 Forbidden on POST /inventory
        self.assertEqual(self.client.post("/inventory", headers=tm_headers, json=inv_payload).status_code, 403)
        self.assertEqual(self.client.post("/inventory", headers=self.leader_headers, json=inv_payload).status_code, 403)

        # 4. Base Admin succeeds (200)
        ba_resp = self.client.post("/inventory", headers=ba_headers, json=inv_payload)
        self.assertEqual(ba_resp.status_code, 200)

        # 5. Adding exact duplicate supply in same station returns 400 Bad Request
        dup_resp = self.client.post("/inventory", headers=ba_headers, json=inv_payload)
        self.assertEqual(dup_resp.status_code, 400)
        self.assertIn("already exists", dup_resp.json()["detail"])

    def test_sos_persistence_role_visibility_idempotency_and_status_history(self):
        member_response = self.client.post("/auth/register", json={
            "username": "sos_member",
            "email": "sos_member@polarops.in",
            "password": "test_suite_password_2026",
            "station_name": "Maitri"
        })
        self.assertEqual(member_response.status_code, 200)
        member_id = member_response.json()["user"]["id"]
        member_headers = {"Authorization": f"Bearer {member_response.json()['access_token']}"}

        expedition_response = self.client.post("/expeditions", headers=self.leader_headers, json={
            "name": "SOS Assigned Expedition",
            "station_name": "Maitri",
            "start_date": "2026-11-01",
            "end_date": "2027-03-01",
            "assigned_members": [member_id],
            "status": "Active"
        })
        self.assertEqual(expedition_response.status_code, 200)
        expedition_id = expedition_response.json()["id"]

        context_response = self.client.get("/sos/context", headers=member_headers)
        self.assertEqual(context_response.status_code, 200)
        self.assertEqual(context_response.json()["expedition_id"], expedition_id)
        self.assertEqual(context_response.json()["station_name"], "Maitri")

        create_payload = {
            "skill_needed": "Vehicle Mechanic",
            "latitude": -70.77,
            "longitude": 11.75,
            "description": "Sno-Cat has stopped near the ridge"
        }
        create_headers = {**member_headers, "Idempotency-Key": "sos-create-once"}
        first_response = self.client.post("/sos", headers=create_headers, json=create_payload)
        replay_response = self.client.post("/sos", headers=create_headers, json=create_payload)
        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(replay_response.status_code, 200)
        self.assertEqual(first_response.json()["id"], replay_response.json()["id"])
        record = first_response.json()
        self.assertEqual(record["user_id"], member_id)
        self.assertEqual(record["expedition_id"], expedition_id)
        self.assertEqual(record["assistance_required"], "Vehicle Mechanic")
        self.assertEqual(record["description"], create_payload["description"])
        self.assertEqual(record["status"], "ACTIVE")

        db = next(get_db())
        self.assertEqual(db.query(models.EmergencySOS).count(), 1)
        self.assertEqual(db.query(models.Person).filter(models.Person.user_id == member_id).count(), 1)

        def create_station_role(username, role, station="Maitri"):
            response = self.client.post("/users", headers=self.leader_headers, json={
                "username": username,
                "email": f"{username}@polarops.in",
                "password": "password123",
                "role": role,
                "station_name": station,
            })
            self.assertEqual(response.status_code, 200)
            login_response = self.client.post("/auth/login", json={
                "email": f"{username}@polarops.in",
                "password": "password123",
            })
            self.assertEqual(login_response.status_code, 200)
            return {"Authorization": f"Bearer {login_response.json()['access_token']}"}

        logistics_headers = create_station_role("sos_logistics", "Logistics Officer")
        admin_headers = create_station_role("sos_admin", "Base Admin")
        other_station_admin_headers = create_station_role("other_admin", "Base Admin", "Bharati")

        self.assertEqual(len(self.client.get("/sos", headers=member_headers).json()), 1)
        self.assertEqual(len(self.client.get("/sos", headers=self.leader_headers).json()), 1)
        self.assertEqual(len(self.client.get("/sos", headers=admin_headers).json()), 1)
        self.assertEqual(len(self.client.get("/sos", headers=logistics_headers).json()), 1)
        self.assertEqual(len(self.client.get("/sos", headers=other_station_admin_headers).json()), 0)

        self.assertEqual(
            self.client.patch(f"/sos/{record['id']}/status", headers=member_headers, json={"status": "ACKNOWLEDGED"}).status_code,
            403
        )
        role_status_updates = [
            (logistics_headers, "ACKNOWLEDGED"),
            (admin_headers, "RESPONDING"),
            (self.leader_headers, "RESOLVED"),
        ]
        for role_headers, next_status in role_status_updates:
            update_response = self.client.patch(
                f"/sos/{record['id']}/status",
                headers=role_headers,
                json={"status": next_status}
            )
            self.assertEqual(update_response.status_code, 200, update_response.text)
            self.assertEqual(update_response.json()["status"], next_status)
            self.assertEqual(
                self.client.get("/sos", headers=member_headers).json()[0]["status"],
                next_status
            )

        member_history = self.client.get("/sos", headers=member_headers).json()
        self.assertEqual(len(member_history), 1)
        self.assertEqual(member_history[0]["status"], "RESOLVED")
        audit_actions = [
            entry.action for entry in db.query(models.AuditLog).order_by(models.AuditLog.id.asc()).all()
        ]
        self.assertIn("SOS_CREATED", audit_actions)
        self.assertEqual(audit_actions.count("SOS_STATUS_UPDATED"), 3)

        for sender_headers in (self.leader_headers, admin_headers, logistics_headers):
            sender_response = self.client.post("/sos", headers=sender_headers, json={
                "skill_needed": "Medical",
                "latitude": -70.76,
                "longitude": 11.74,
                "description": "Broadcast access check",
            })
            self.assertEqual(sender_response.status_code, 200, sender_response.text)
            sender_record = sender_response.json()
            sender_history = self.client.get("/sos", headers=sender_headers)
            self.assertTrue(any(item["id"] == sender_record["id"] for item in sender_history.json()))

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
