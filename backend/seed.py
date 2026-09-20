import sys
from datetime import datetime, date, timezone
from database import SessionLocal, engine, Base
import models
from models.audit import AuditLog
from models.vehicle import Vehicle

def seed_database(reset: bool = True):
    if reset:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[+] Seeding PolarOps database with Antarctic data...")

        # 1. Users (4 roles)
        users = [
            models.User(
                username="leader",
                email="leader@polarops.in",
                hashed_password="password123",  # Demo plain hash
                role="Expedition Leader",
                station_name="Maitri"
            ),
            models.User(
                username="logistics",
                email="logistics@polarops.in",
                hashed_password="password123",
                role="Logistics Officer",
                station_name="Maitri"
            ),
            models.User(
                username="admin",
                email="admin@polarops.in",
                hashed_password="password123",
                role="Base Admin",
                station_name="Bharati"
            ),
            models.User(
                username="member",
                email="member@polarops.in",
                hashed_password="password123",
                role="Team Member",
                station_name="Maitri"
            ),
        ]
        db.add_all(users)
        db.commit()
        for u in users:
            db.refresh(u)

        # 2. Expedition
        expedition = models.Expedition(
            name="44th Indian Scientific Expedition to Antarctica (ISEA)",
            station_name="Maitri",
            start_date=date(2025, 11, 15),
            end_date=date(2026, 4, 10),
            status="Active",
            target_team_size=6
        )

        db.add(expedition)
        db.commit()
        db.refresh(expedition)

        # 3. Inventory Items (with daily_use_per_person)
        inventory = [
            models.InventoryItem(
                name="Polar Diesel Fuel Drums",
                category="Fuel",
                quantity=18500.0,
                unit="Litres",
                min_required=5000.0,
                daily_use_per_person=15.0,  # 15L per person per day
                location_station="Maitri",
                cold_factor_sensitivity=1.25
            ),
            models.InventoryItem(
                name="Aviation Jet-A1 Fuel",
                category="Fuel",
                quantity=9200.0,
                unit="Litres",
                min_required=3000.0,
                daily_use_per_person=10.0,
                location_station="Bharati",
                cold_factor_sensitivity=1.15
            ),
            models.InventoryItem(
                name="High-Calorie Polar Ration Packs",
                category="Ration",
                quantity=4800.0,
                unit="Packages",
                min_required=1200.0,
                daily_use_per_person=3.0,  # 3 packs per person per day
                location_station="Maitri",
                cold_factor_sensitivity=1.30
            ),
            models.InventoryItem(
                name="Dehydrated Survival Food Rations",
                category="Ration",
                quantity=3100.0,
                unit="Packages",
                min_required=800.0,
                daily_use_per_person=2.5,
                location_station="Bharati",
                cold_factor_sensitivity=1.20
            ),
            models.InventoryItem(
                name="Main Generator Spare Parts Kit",
                category="Spares",
                quantity=35.0,
                unit="Units",
                min_required=10.0,
                daily_use_per_person=0.1,
                location_station="Maitri",
                cold_factor_sensitivity=1.0
            ),
            models.InventoryItem(
                name="Emergency Trauma Medical & O2 Kit",
                category="Medical",
                quantity=110.0,
                unit="Boxes",
                min_required=25.0,
                daily_use_per_person=0.05,
                location_station="Maitri",
                cold_factor_sensitivity=1.0
            ),
            models.InventoryItem(
                name="Sno-Cat Heavy Rubber Tracks & Belts",
                category="Spares",
                quantity=14.0,
                unit="Sets",
                min_required=4.0,
                daily_use_per_person=0.02,
                location_station="Bharati",
                cold_factor_sensitivity=1.0
            ),
        ]
        db.add_all(inventory)
        db.commit()

        # 4. Cargo Shipments
        cargo = [
            models.CargoShipment(
                shipment_code="CARGO-2026-01",
                title="Caterpillar Auxiliary Power Generator",
                weight_kg=4200.0,
                volume_m3=11.5,
                priority="Critical",
                status="In-Transit",
                expedition_id=expedition.id
            ),
            models.CargoShipment(
                shipment_code="CARGO-2026-02",
                title="Winter Parka Rations & Extreme Thermal Suits",
                weight_kg=2100.0,
                volume_m3=7.8,
                priority="High",
                status="Packed",
                expedition_id=expedition.id
            ),
            models.CargoShipment(
                shipment_code="CARGO-2026-03",
                title="Glaciology Core Drill Rig & Ice Sensors",
                weight_kg=1750.0,
                volume_m3=5.5,
                priority="Medium",
                status="Pending",
                expedition_id=expedition.id
            ),
        ]
        db.add_all(cargo)
        db.commit()

        # 5. People (Within 10-50km of Maitri -70.766, 11.733, plus a couple at Bharati -69.407, 76.191)
        people = [
            models.Person(
                name="Dr. Rahul Sharma",
                role="Medical Officer",
                skills=["doctor", "first_aid", "trauma", "hypothermia_care"],
                latitude=-70.7800,  # ~2 km from Maitri
                longitude=11.7450,
                station_name="Maitri",
                status="Active",
                vehicle_assigned="PistenBully 100 Medical",
                phone="+91-9876543210",
                user_id=users[0].id
            ),
            models.Person(
                name="Vikram Singh",
                role="Chief Vehicle Mechanic",
                skills=["mechanic", "welding", "generator_repair", "diesel_engine"],
                latitude=-70.8200,  # ~8 km from Maitri
                longitude=11.8500,
                station_name="Maitri",
                status="Active",
                vehicle_assigned="Sno-Cat Alpha",
                phone="+91-9876543211",
                user_id=users[3].id
            ),
            models.Person(
                name="Dr. Amit Patel",
                role="Senior Glaciologist",
                skills=["glaciology", "first_aid", "radio_comm", "field_survey"],
                latitude=-70.9500,  # ~23 km from Maitri
                longitude=11.9500,
                station_name="Maitri",
                status="On-Mission",
                vehicle_assigned="Polar Quad 01",
                phone="+91-9876543213",
                user_id=None
            ),
            models.Person(
                name="Suresh Verma",
                role="Logistics Officer",
                skills=["inventory", "cargo_dispatch", "radio_comm"],
                latitude=-70.7660,  # At Maitri Base
                longitude=11.7330,
                station_name="Maitri",
                status="Active",
                vehicle_assigned="None",
                phone="+91-9876543214",
                user_id=users[1].id
            ),
            models.Person(
                name="Captain Ananya Roy",
                role="Helicopter Pilot",
                skills=["pilot", "navigation", "search_and_rescue", "evacuation"],
                latitude=-69.4070,  # Bharati Station (Far away example)
                longitude=76.1910,
                station_name="Bharati",
                status="Standby",
                vehicle_assigned="Eurocopter AS350",
                phone="+91-9876543212",
                user_id=users[2].id
            )
        ]
        db.add_all(people)
        db.commit()

        # 6. Vehicles (Near Maitri & Bharati)
        vehicles = [
            Vehicle(
                name="Sno-Cat Alpha",
                type="Sno-Cat",
                latitude=-70.7700,  # Near Maitri
                longitude=11.7400,
                status="Available",
                weather_limit="Blizzard Level 2",
                station_name="Maitri"
            ),
            Vehicle(
                name="PistenBully 100 Medical",
                type="Sno-Cat",
                latitude=-70.7800,  # Near Maitri
                longitude=11.7450,
                status="Available",
                weather_limit="Blizzard Level 3",
                station_name="Maitri"
            ),
            Vehicle(
                name="Polar Quad 01",
                type="Quad",
                latitude=-70.8200,  # ~8 km from Maitri
                longitude=11.8500,
                status="Available",
                weather_limit="Mild Wind",
                station_name="Maitri"
            ),
            Vehicle(
                name="Eurocopter AS350",
                type="Helicopter",
                latitude=-69.4070,  # At Bharati (Far away example)
                longitude=76.1910,
                status="Standby",
                weather_limit="Clear",
                station_name="Bharati"
            ),
        ]
        db.add_all(vehicles)
        db.commit()

        # 7. Alerts
        alerts = [
            models.Alert(
                alert_type="SOS",
                title="Crevasse Slip near Ridge Bravo",
                message="Field team Skidoo experienced track failure near crevasse zone. 1 team member requesting medical standby.",
                severity="Critical",
                latitude=-70.7800,
                longitude=11.7500,
                status="Active"
            ),
            models.Alert(
                alert_type="Weather",
                title="Blizzard Level 2 Warning",
                message="Winds exceeding 65 knots forecasted across Schirmacher Oasis in next 4 hours.",
                severity="High",
                latitude=-70.7660,
                longitude=11.7330,
                status="Active"
            )
        ]
        db.add_all(alerts)
        db.commit()

        # 8. Deterministic SHA-256 Audit Log Hash Chain
        # Entry 1: Genesis block
        gen_timestamp = datetime(2025, 11, 15, 8, 0, 0, tzinfo=timezone.utc)
        genesis_prev = "0" * 64
        gen_payload = {"event": "PolarOps Ledger Initialized", "expedition": "44th ISEA"}
        gen_hash = AuditLog.compute_hash(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload=gen_payload,
            timestamp=gen_timestamp,
            prev_hash=genesis_prev
        )

        log1 = AuditLog(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload=AuditLog.serialize_payload(gen_payload),
            timestamp=gen_timestamp,
            prev_hash=genesis_prev,
            hash=gen_hash
        )
        db.add(log1)
        db.commit()
        db.refresh(log1)

        # Entry 2: Expedition creation
        exp_timestamp = datetime(2025, 11, 15, 8, 5, 0, tzinfo=timezone.utc)
        exp_payload = {"expedition_id": expedition.id, "target_team_size": 6, "station": "Maitri"}

        exp_hash = AuditLog.compute_hash(
            action="EXPEDITION_CREATED",
            performed_by="leader@polarops.in",
            target_resource=f"EXPEDITION-{expedition.id}",
            payload=exp_payload,
            timestamp=exp_timestamp,
            prev_hash=log1.hash
        )

        log2 = AuditLog(
            action="EXPEDITION_CREATED",
            performed_by="leader@polarops.in",
            target_resource=f"EXPEDITION-{expedition.id}",
            payload=AuditLog.serialize_payload(exp_payload),
            timestamp=exp_timestamp,
            prev_hash=log1.hash,
            hash=exp_hash
        )
        db.add(log2)
        db.commit()

        print("[SUCCESS] Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    do_reset = True
    if len(sys.argv) > 1 and sys.argv[1] == "--no-reset":
        do_reset = False
    seed_database(reset=do_reset)
