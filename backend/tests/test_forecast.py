import os
import sys
import unittest
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["USE_SQLITE"] = "true"
os.environ["ADMIN_EMAIL"] = "leader@polarops.in"
os.environ["ADMIN_PASSWORD"] = "test_suite_leader_password_2026"
os.environ["JWT_SECRET"] = "test_suite_jwt_secret_key_2026_x9k2m7"

from fastapi.testclient import TestClient
from main import app, calculate_cold_factor
from database import engine, Base, get_db
import models
from auth_utils import hash_password

class TestForecastSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
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

        # Seed Bootstrap Leader & Active Expedition
        leader = models.User(
            username="leader",
            email="leader@polarops.in",
            hashed_password=hash_password("test_suite_leader_password_2026"),
            role="Expedition Leader",
            station_name="Maitri"
        )
        db.add(leader)

        from datetime import date
        expedition = models.Expedition(
            name="44th Indian Antarctic Expedition",
            station_name="Maitri",
            start_date=date(2025, 11, 15),
            end_date=date(2026, 4, 10),
            status="Active",
            target_team_size=6
        )
        db.add(expedition)

        # Seed Inventory Items at Maitri
        fuel = models.InventoryItem(
            name="Polar Diesel Fuel Drums",
            category="Fuel",
            quantity=15000.0,
            unit="Litres",
            min_required=4000.0,
            daily_use_per_person=15.0,
            location_station="Maitri",
            cold_factor_sensitivity=1.2
        )
        rations = models.InventoryItem(
            name="High-Calorie Freeze-Dried Rations",
            category="Ration",
            quantity=5000.0,
            unit="Packs",
            min_required=1000.0,
            daily_use_per_person=3.0,
            location_station="Maitri",
            cold_factor_sensitivity=1.0
        )
        medical = models.InventoryItem(
            name="Hypothermia Medical Kits",
            category="Medical",
            quantity=25.0,
            unit="Kits",
            min_required=10.0,
            daily_use_per_person=0.1,
            location_station="Maitri",
            cold_factor_sensitivity=0.5
        )
        db.add_all([fuel, rations, medical])
        db.commit()

        # Login to get token
        resp = self.client.post("/auth/login", json={"email": "leader@polarops.in", "password": "test_suite_leader_password_2026"})
        self.leader_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def test_cold_factor_formula(self):
        """Test cold factor calculation formula at 0C, -10C, and -40C"""
        self.assertEqual(calculate_cold_factor(0.0, 1.0), 1.0)
        self.assertEqual(calculate_cold_factor(-10.0, 1.0), 1.1)  # 1 + (10 * 0.01 * 1) = 1.1
        self.assertEqual(calculate_cold_factor(-40.0, 1.0), 1.4)  # 1 + (40 * 0.01 * 1) = 1.4
        self.assertEqual(calculate_cold_factor(-40.0, 1.2), 1.48) # 1 + (40 * 0.01 * 1.2) = 1.48

    def test_forecast_comparison_at_two_temperatures(self):
        """Compare GET /forecast outputs for temperature = -10C vs temperature = -40C"""
        # Forecast 1: Mild Cold (-10C) for 30 days
        resp_minus_10 = self.client.get("/forecast?temperature=-10.0&days=30", headers=self.leader_headers)
        self.assertEqual(resp_minus_10.status_code, 200)
        data_minus_10 = resp_minus_10.json()

        # Forecast 2: Extreme Cold (-40C) for 30 days
        resp_minus_40 = self.client.get("/forecast?temperature=-40.0&days=30", headers=self.leader_headers)
        self.assertEqual(resp_minus_40.status_code, 200)
        data_minus_40 = resp_minus_40.json()

        print("\n" + "="*80)
        print("FORECAST OUTPUT AT -10°C (Mild Cold):")
        print(json.dumps(data_minus_10, indent=2))
        print("="*80)
        print("FORECAST OUTPUT AT -40°C (Extreme Cold):")
        print(json.dumps(data_minus_40, indent=2))
        print("="*80 + "\n")

        # Assertions
        # At -40C, required supply MUST be higher than at -10C due to higher cold factor burn rate!
        fuel_10 = next(i for i in data_minus_10["items"] if i["category"] == "Fuel")
        fuel_40 = next(i for i in data_minus_40["items"] if i["category"] == "Fuel")

        self.assertGreater(fuel_40["required"], fuel_10["required"])
        self.assertGreater(fuel_40["cold_factor_used"], fuel_10["cold_factor_used"])
        self.assertLess(data_minus_40["survival_days"], data_minus_10["survival_days"])

if __name__ == "__main__":
    unittest.main()
