import os
import sys
from datetime import datetime, timezone
from database import SessionLocal, engine, Base
import models
from models.audit import AuditLog
from auth_utils import hash_password
import config

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

        admin_email = config.ADMIN_EMAIL
        admin_password = config.ADMIN_PASSWORD

        print(f"[!] Seeded 4 demo accounts with configured password: {admin_password}")

        # Create Bootstrap Expedition Leader Account
        leader_user = models.User(
            username="leader",
            email=admin_email,
            hashed_password=hash_password(admin_password),
            role="Expedition Leader",
            station_name="Maitri"
        )
        db.add(leader_user)

        # Create demo Logistics Officer account
        officer_user = models.User(
            username="officer",
            email="officer@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Logistics Officer",
            station_name="Maitri"
        )
        db.add(officer_user)

        # Create demo Base Admin account
        admin_user = models.User(
            username="admin",
            email="admin@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Base Admin",
            station_name="Maitri"
        )
        db.add(admin_user)

        # Create demo Team Member account
        member_user = models.User(
            username="member",
            email="member@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Team Member",
            station_name="Maitri"
        )
        db.add(member_user)

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

        print(f"[SUCCESS] Database reset complete! Seeded 4 user accounts: Leader ({admin_email}), Logistics Officer (officer@polarops.in), Base Admin (admin@polarops.in), Team Member (member@polarops.in). Zero mock operational data.")

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

