import os
import sys
import json
import unittest
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app
from database import get_db
import models

class TestCargoOptimizerSuite(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_forecast_cargo_and_audit(self):
        # Seed Admin User via FastAPI register
        reg_res = self.client.post("/auth/register", json={
            "username": "leader",
            "email": "leader@polarops.in",
            "password": "leader_test_password_2026"
        })
        self.assertEqual(reg_res.status_code, 200)

        # Authenticate Leader Token
        login_res = self.client.post("/auth/login", json={
            "email": "leader@polarops.in",
            "password": "leader_test_password_2026"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Promote user to Expedition Leader for test permissions
        db = next(get_db())
        u = db.query(models.User).filter(models.User.email == "leader@polarops.in").first()
        if u:
            u.role = "Expedition Leader"
            db.commit()

        print("==================================================")
        print("1. TESTING GET /forecast ON TEMP DATABASE")
        print("==================================================")
        res_forecast = self.client.get("/forecast?temperature=-33.5&days=30", headers=headers)
        self.assertEqual(res_forecast.status_code, 200)
        print(f"Status Code: {res_forecast.status_code}")
        print("JSON Response:")
        print(json.dumps(res_forecast.json(), indent=2))

        print("\n==================================================")
        print("2. TESTING CRITICAL DOMINANCE IN CARGO OPTIMIZER")
        print("Proving 2 High items (50+50=100pts) do NOT displace 1 Critical item (1000pts)")
        print("==================================================")

        items = [
            {"title": "Critical Hypothermia Med Kit", "shipment_code": "CRIT-01", "weight_kg": 100, "volume_m3": 1.0, "priority": "Critical", "status": "Pending"},
            {"title": "High Priority Ration Box 1", "shipment_code": "HIGH-01", "weight_kg": 50, "volume_m3": 0.5, "priority": "High", "status": "Pending"},
            {"title": "High Priority Ration Box 2", "shipment_code": "HIGH-02", "weight_kg": 50, "volume_m3": 0.5, "priority": "High", "status": "Pending"},
        ]

        for item in items:
            res_create = self.client.post("/cargo", json=item, headers=headers)
            self.assertEqual(res_create.status_code, 200, f"Failed to create cargo {item['shipment_code']}")

        opt_payload = {
            "capacity_weight_kg": 110,
            "capacity_volume_m3": 1.1
        }
        res_opt = self.client.post("/cargo/optimize", json=opt_payload, headers=headers)
        self.assertEqual(res_opt.status_code, 200)
        print(f"Status Code: {res_opt.status_code}")
        opt_data = res_opt.json()
        print("JSON Response:")
        print(json.dumps(opt_data, indent=2))

        packed_titles = [i["title"] for i in opt_data["packed_items"]]
        left_titles = [i["title"] for i in opt_data["left_behind_items"]]

        self.assertIn("Critical Hypothermia Med Kit", packed_titles, "Critical item MUST be packed!")
        self.assertTrue("High Priority Ration Box 1" in left_titles and "High Priority Ration Box 2" in left_titles, "High items must NOT displace Critical item!")
        print("-> VERIFIED: Critical item (1000 pts) dominated over two High items (100 pts combined)!")

        print("\n==================================================")
        print("3. TESTING HASH-CHAINED AUDIT VERIFICATION (BEFORE TAMPER)")
        print("==================================================")
        res_verify_before = self.client.get("/audit/verify", headers=headers)
        self.assertEqual(res_verify_before.status_code, 200)
        verify_before_data = res_verify_before.json()
        print("JSON Response:")
        print(json.dumps(verify_before_data, indent=2))
        self.assertTrue(verify_before_data["valid"], "Audit chain must be VALID before tampering!")

        print("\n==================================================")
        print("4. SIMULATING DATABASE TAMPERING ON TEMP DB")
        print("==================================================")
        db = next(get_db())
        audit_entry = db.query(models.AuditLog).filter(models.AuditLog.id == 1).first()
        if audit_entry:
            audit_entry.action = "TAMPERED_MALICIOUS_ACTION"
            db.commit()
        print("Directly mutated row #1 action in test database!")

        print("\n==================================================")
        print("5. TESTING HASH-CHAINED AUDIT VERIFICATION (AFTER TAMPER)")
        print("==================================================")
        res_verify_after = self.client.get("/audit/verify", headers=headers)
        self.assertEqual(res_verify_after.status_code, 200)
        verify_after_data = res_verify_after.json()
        print("JSON Response:")
        print(json.dumps(verify_after_data, indent=2))
        self.assertFalse(verify_after_data["valid"], "Audit chain must detect TAMPERING!")
        print("-> VERIFIED: Audit verification successfully detected tampered entry!")

    def test_simulator_and_priority_sync(self):
        # Register and Login
        self.client.post("/auth/register", json={
            "username": "test_leader",
            "email": "leader2@polarops.in",
            "password": "leader_test_password_2026"
        })
        login_res = self.client.post("/auth/login", json={
            "email": "leader2@polarops.in",
            "password": "leader_test_password_2026"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        db = next(get_db())
        u = db.query(models.User).filter(models.User.email == "leader2@polarops.in").first()
        if u:
            u.role = "Expedition Leader"
            db.commit()

        print("\n==================================================")
        print("PART 1 TEST: SIMULATOR FIXES & ASSERTIONS")
        print("==================================================")

        # 1. Create Active Expedition
        exp_res = self.client.post("/expeditions", json={
            "name": "Maitri Expedition 45",
            "station_name": "Maitri",
            "latitude": -70.7660,
            "longitude": 11.7330,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "target_team_size": 6,
            "status": "Active"
        }, headers=headers)
        self.assertEqual(exp_res.status_code, 200)

        # 2. Add Ration item
        ration_res = self.client.post("/inventory", json={
            "name": "Emergency Ration Packs",
            "category": "Ration",
            "quantity": 5000,
            "unit": "Packs",
            "min_required": 500,
            "daily_use_per_person": 3.0,
            "location_station": "Maitri",
            "cold_factor_sensitivity": 1.0
        }, headers=headers)
        self.assertEqual(ration_res.status_code, 200)

        # 3. Add Fuel item
        fuel_res = self.client.post("/inventory", json={
            "name": "Jet-A1 Fuel",
            "category": "Fuel",
            "quantity": 8000,
            "unit": "Litres",
            "min_required": 1000,
            "daily_use_per_person": 5.0,
            "location_station": "Maitri",
            "cold_factor_sensitivity": 1.0
        }, headers=headers)
        self.assertEqual(fuel_res.status_code, 200)

        # 4. Run /simulate with fuel_loss_percent=25.0
        sim_res = self.client.post("/simulate", json={
            "resupply_in_days": 60,
            "delay_days": 0,
            "blizzard_days": 0,
            "fuel_loss_percent": 25.0,
            "temperature": -33.5,
            "runs": 1000
        }, headers=headers)
        self.assertEqual(sim_res.status_code, 200)
        sim_data = sim_res.json()

        ration_b = next(item for item in sim_data["baseline_items"] if item["category"] == "Ration")
        ration_s = next(item for item in sim_data["scenario_items"] if item["category"] == "Ration")
        b_p50 = ration_b["p50_days"]
        b_p10 = ration_b["p10_days"]
        b_p90 = ration_b["p90_days"]

        expected_days = 5000.0 / (6 * 3.0 * 1.335)  # ~208.07

        # Assertion (a)
        self.assertEqual(ration_b, ration_s, "Ration baseline & scenario MUST be identical when fuel_loss_percent only is changed!")

        # Assertion (b)
        p50_diff_percent = abs(b_p50 - expected_days) / expected_days * 100.0
        self.assertLessEqual(p50_diff_percent, 2.0, f"P50 ({b_p50}) is not within 2% of expected ({expected_days:.2f})")

        # Assertion (c)
        spread = b_p90 - b_p10
        self.assertGreater(spread, 0, "Spread (P90 - P10) MUST be > 0!")

        print("\n==================================================")
        print("PART 2 TEST: PRIORITY SYNC FLUSH ORDER & IDEMPOTENCY REPLAY")
        print("==================================================")

        # Seed Person record with fresh location for SOS dispatch matching
        db = next(get_db())
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

        self.assertEqual(sorted_queue[0]["type"], "sos", "SOS MUST be sent first!")
        self.assertEqual(sorted_queue[1]["type"], "cargo", "Cargo MUST be sent second!")
        self.assertEqual(sorted_queue[2]["type"], "inventory", "Inventory MUST be sent third!")

        # Execute sorted queue requests to server
        for item in sorted_queue:
            req_headers = {**headers, "Idempotency-Key": item["key"], "Client-Timestamp": item["body"]["client_timestamp"]}
            r = self.client.post(item["endpoint"], json=item["body"], headers=req_headers)
            self.assertEqual(r.status_code, 200, f"Failed to execute {item['type']}: {r.text}")

        # Verify processing order in server Audit Logs
        db = next(get_db())
        logs = db.query(models.AuditLog).order_by(models.AuditLog.id.asc()).all()

        recent_actions = [l.action for l in logs if l.action in ("SOS_DISPATCH", "CARGO_CREATED", "INVENTORY_ADDED") and ("Spare Batteries" in (l.payload or "") or "CRG-TEST" in (l.payload or "") or "SOS" in l.action)]

        self.assertEqual(recent_actions[0], "SOS_DISPATCH", "Server MUST process SOS first!")
        self.assertEqual(recent_actions[1], "CARGO_CREATED", "Server MUST process Cargo second!")
        self.assertEqual(recent_actions[2], "INVENTORY_ADDED", "Server MUST process Inventory third!")

        # Test Idempotency Replay (resend SOS with identical key)
        sos_item = sorted_queue[0]
        replay_headers = {**headers, "Idempotency-Key": sos_item["key"], "Client-Timestamp": sos_item["body"]["client_timestamp"]}
        replay_res = self.client.post(sos_item["endpoint"], json=sos_item["body"], headers=replay_headers)
        self.assertEqual(replay_res.status_code, 200, "Replay must return HTTP 200")

        # Count alerts & audit logs in DB
        db = next(get_db())
        alert_count = db.query(models.Alert).filter(models.Alert.alert_type == "SOS").count()
        sos_audit_count = db.query(models.AuditLog).filter(models.AuditLog.action == "SOS_DISPATCH").count()

        self.assertEqual(alert_count, 1, "Idempotency replay MUST NOT create duplicate Alert!")
        self.assertEqual(sos_audit_count, 1, "Idempotency replay MUST NOT create duplicate AuditLog!")

if __name__ == "__main__":
    unittest.main()


