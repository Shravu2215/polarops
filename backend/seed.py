from datetime import datetime, date
from database import SessionLocal, engine, Base
import models
from models.audit import AuditLog

def seed_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[+] Seeding PolarOps database with Antarctic data...")


        # 1. Users
        users = [
            models.User(
                username="leader",
                email="leader@polarops.in",
                hashed_password="hashed_password_123",  # Demo placeholder
                role="Expedition Leader",
                station_name="Maitri"
            ),
            models.User(
                username="logistics",
                email="logistics@polarops.in",
                hashed_password="hashed_password_123",
                role="Logistics Officer",
                station_name="Maitri"
            ),
            models.User(
                username="admin",
                email="admin@polarops.in",
                hashed_password="hashed_password_123",
                role="Base Admin",
                station_name="Bharati"
            ),
            models.User(
                username="member",
                email="member@polarops.in",
                hashed_password="hashed_password_123",
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
            target_team_size=40
        )
        db.add(expedition)
        db.commit()
        db.refresh(expedition)

        # 3. Inventory Items
        inventory = [
            models.InventoryItem(
                name="Polar Diesel Fuel Drums",
                category="Fuel",
                quantity=18500.0,
                unit="Litres",
                min_required=5000.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.25
            ),
            models.InventoryItem(
                name="Aviation Jet-A1 Fuel",
                category="Fuel",
                quantity=9200.0,
                unit="Litres",
                min_required=3000.0,
                location_station="Bharati",
                cold_factor_sensitivity=1.15
            ),
            models.InventoryItem(
                name="High-Calorie Polar Ration Packs",
                category="Ration",
                quantity=4800.0,
                unit="Packages",
                min_required=1200.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.30
            ),
            models.InventoryItem(
                name="Dehydrated Survival Food Rations",
                category="Ration",
                quantity=3100.0,
                unit="Packages",
                min_required=800.0,
                location_station="Bharati",
                cold_factor_sensitivity=1.20
            ),
            models.InventoryItem(
                name="Main Generator Spare Parts Kit",
                category="Spares",
                quantity=35.0,
                unit="Units",
                min_required=10.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.0
            ),
            models.InventoryItem(
                name="Emergency Trauma Medical & O2 Kit",
                category="Medical",
                quantity=110.0,
                unit="Boxes",
                min_required=25.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.0
            ),
            models.InventoryItem(
                name="Sno-Cat Heavy Rubber Tracks & Drive Belts",
                category="Spares",
                quantity=14.0,
                unit="Sets",
                min_required=4.0,
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

        # 5. People
        people = [
            models.Person(
                name="Dr. Rahul Sharma",
                role="Medical Officer",
                skills=["doctor", "first_aid", "trauma", "hypothermia_care"],
                latitude=-70.7670,
                longitude=11.7340,
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
                latitude=-70.7610,
                longitude=11.7290,
                station_name="Maitri",
                status="Active",
                vehicle_assigned="Sno-Cat Alpha",
                phone="+91-9876543211",
                user_id=users[3].id
            ),
            models.Person(
                name="Captain Ananya Roy",
                role="Helicopter Pilot",
                skills=["pilot", "navigation", "search_and_rescue", "evacuation"],
                latitude=-69.4050,
                longitude=76.1940,
                station_name="Bharati",
                status="Standby",
                vehicle_assigned="Eurocopter AS350",
                phone="+91-9876543212",
                user_id=users[2].id
            ),
            models.Person(
                name="Dr. Amit Patel",
                role="Senior Glaciologist",
                skills=["glaciology", "first_aid", "radio_comm", "field_survey"],
                latitude=-70.7750,
                longitude=11.7420,
                station_name="Maitri",
                status="On-Mission",
                vehicle_assigned="Skidoo Arctic 02",
                phone="+91-9876543213",
                user_id=None
            )
        ]
        db.add_all(people)
        db.commit()

        # 6. Alerts
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

        # 7. Audit Logs Hash Chain
        # Genesis entry
        gen_time = datetime.utcnow()
        gen_timestamp_str = gen_time.isoformat()
        genesis_prev_hash = "0" * 64
        genesis_hash = AuditLog.compute_hash(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload="PolarOps Ledger Initialized for 44th ISEA",
            timestamp_str=gen_timestamp_str,
            prev_hash=genesis_prev_hash
        )

        genesis_log = AuditLog(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload="PolarOps Ledger Initialized for 44th ISEA",
            timestamp=gen_time,
            prev_hash=genesis_prev_hash,
            hash=genesis_hash
        )
        db.add(genesis_log)
        db.commit()
        db.refresh(genesis_log)

        # Second entry
        entry2_time = datetime.utcnow()
        entry2_timestamp_str = entry2_time.isoformat()
        entry2_hash = AuditLog.compute_hash(
            action="EXPEDITION_CREATED",
            performed_by="leader@polarops.in",
            target_resource=f"EXPEDITION-{expedition.id}",
            payload=f"Created 44th ISEA Expedition target_team_size=40",
            timestamp_str=entry2_timestamp_str,
            prev_hash=genesis_log.hash
        )

        log2 = AuditLog(
            action="EXPEDITION_CREATED",
            performed_by="leader@polarops.in",
            target_resource=f"EXPEDITION-{expedition.id}",
            payload=f"Created 44th ISEA Expedition target_team_size=40",
            timestamp=entry2_time,
            prev_hash=genesis_log.hash,
            hash=entry2_hash
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
    seed_database()
