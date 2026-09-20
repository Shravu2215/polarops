import os
import sys
from datetime import datetime, timezone
from database import SessionLocal, engine, Base
import models
from models.audit import AuditLog
from auth_utils import hash_password

def seed_database(reset: bool = True):
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

        print(f"[SUCCESS] Database reset complete! Bootstrap Leader created ({admin_email}).")
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
