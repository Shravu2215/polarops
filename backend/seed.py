import os
import sys
from datetime import datetime, timezone, timedelta
from database import SessionLocal, engine, Base
import models
from models.audit import AuditLog
from auth_utils import hash_password

def seed_database(reset: bool = True):
    env_name = os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower()
    if env_name in ["production", "prod"]:
        print("[ERROR] Database seeding is strictly blocked in production environment!")
        sys.exit(1)

    if reset:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[+] Initializing clean PolarOps database (No mock data)...")

        admin_email = os.getenv("ADMIN_EMAIL", "leader@polarops.in")
        admin_password = os.getenv("ADMIN_PASSWORD", "password123")

        # Create ONLY Bootstrap Expedition Leader Account
        leader_user = models.User(
            username="leader",
            email=admin_email,
            hashed_password=hash_password(admin_password),
            role="Expedition Leader",
            station_name="Maitri"
        )
        db.add(leader_user)
        db.commit()
        db.refresh(leader_user)

        # Seed Station Personnel (People)
        now_utc = datetime.now(timezone.utc)
        people_data = [
            {
                "name": "Dr. Ananya Sharma",
                "role": "Chief Medical Officer",
                "skills": ["doctor", "first_aid", "trauma"],
                "station_name": "Maitri",
                "status": "Active",
                "latitude": -70.766,
                "longitude": 11.733,
                "phone": "+91-9876543210",
                "last_location_update": now_utc - timedelta(minutes=4) # Fresh
            },
            {
                "name": "Vikram Singh",
                "role": "Senior Aviation Pilot",
                "skills": ["pilot", "navigation", "evac"],
                "station_name": "Bharati",
                "status": "Active",
                "latitude": -69.408,
                "longitude": 76.191,
                "phone": "+91-9876543211",
                "last_location_update": now_utc - timedelta(minutes=8) # Fresh
            },
            {
                "name": "Rajesh Kumar",
                "role": "Lead Maintenance Engineer",
                "skills": ["mechanic", "engineer", "generator"],
                "station_name": "Maitri",
                "status": "On-Mission",
                "latitude": -70.768,
                "longitude": 11.735,
                "phone": "+91-9876543212",
                "last_location_update": now_utc - timedelta(minutes=25) # Stale
            },
            {
                "name": "Siddharth Verma",
                "role": "Communications Specialist",
                "skills": ["radio", "satellite", "engineer"],
                "station_name": "Bharati",
                "status": "Standby",
                "latitude": -69.410,
                "longitude": 76.195,
                "phone": "+91-9876543213",
                "last_location_update": now_utc - timedelta(minutes=2) # Fresh
            }
        ]
        for p in people_data:
            db.add(models.Person(**p))

        # Seed Vehicles
        vehicles_data = [
            {"name": "Sno-Cat Alpha", "type": "Sno-Cat", "latitude": -70.766, "longitude": 11.733, "status": "Available", "weather_limit": "Blizzard Level 3", "station_name": "Maitri"},
            {"name": "Polar Helicopter H-1", "type": "Helicopter", "latitude": -69.408, "longitude": 76.191, "status": "On-Mission", "weather_limit": "Clear Weather Only", "station_name": "Bharati"},
            {"name": "Rescue Quad Q-4", "type": "Quad", "latitude": -70.770, "longitude": 11.740, "status": "Maintenance", "weather_limit": "Blizzard Level 1", "station_name": "Maitri"}
        ]
        for v in vehicles_data:
            db.add(models.Vehicle(**v))

        # Seed Initial Expedition & Planner Schedule
        dep_date = (now_utc + timedelta(days=45)).date()
        from main import calculate_backward_schedule
        default_milestones = [
            {"name": "Procurement & Gear Sourcing", "duration_days": 14},
            {"name": "Packing & Cold Cargo Prep", "duration_days": 7},
            {"name": "Vessel / Air Shipping to Base", "duration_days": 18},
            {"name": "Station Setup & Safety Audit", "duration_days": 5}
        ]
        sched = calculate_backward_schedule(dep_date.isoformat(), default_milestones)

        exp = models.Expedition(
            name="Bharati 45th Scientific Expedition",
            station_name="Bharati",
            start_date=dep_date - timedelta(days=60),
            end_date=dep_date,
            status="Planning",
            target_team_size=25,
            departure_deadline=dep_date.isoformat(),
            milestones_json=default_milestones,
            schedule_output=sched
        )
        db.add(exp)

        # Genesis block in SHA-256 AuditLog
        gen_timestamp = datetime.now(timezone.utc)
        genesis_prev = "0" * 64
        gen_payload = {"event": "PolarOps Clean Ledger Initialized", "bootstrap_admin": admin_email}
        gen_hash = AuditLog.compute_hash(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload=gen_payload,
            timestamp=gen_timestamp,
            prev_hash=genesis_prev
        )

        genesis_log = AuditLog(
            action="GENESIS_BLOCK",
            performed_by="SYSTEM",
            target_resource="SYSTEM",
            payload=AuditLog.serialize_payload(gen_payload),
            timestamp=gen_timestamp,
            prev_hash=genesis_prev,
            hash=gen_hash
        )
        db.add(genesis_log)
        db.commit()

        print(f"[SUCCESS] Database reset complete! Bootstrap Leader ({admin_email}), personnel, vehicles & expedition seeded.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error initializing database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    do_reset = True
    if len(sys.argv) > 1 and sys.argv[1] == "--no-reset":
        do_reset = False
    seed_database(reset=do_reset)
