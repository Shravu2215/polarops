import os
import sys
from datetime import datetime, timezone, date
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
        print("[+] Initializing PolarOps database with demo-ready data...")

        admin_email = config.ADMIN_EMAIL
        admin_password = config.ADMIN_PASSWORD

        print(f"[!] Seeded 4 demo accounts with configured password: {admin_password}")

        now = datetime.now(timezone.utc)

        # ── 4 Login Accounts ──────────────────────────────────────────
        leader_user = models.User(
            username="leader",
            email=admin_email,
            hashed_password=hash_password(admin_password),
            role="Expedition Leader",
            station_name="Maitri",
            skills=["leadership", "navigation", "communication"],
            latitude=-70.7660,
            longitude=11.7330,
            last_location_update=now,
        )
        db.add(leader_user)

        officer_user = models.User(
            username="officer",
            email="officer@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Logistics Officer",
            station_name="Maitri",
            skills=["logistics", "cargo", "planning"],
            latitude=-70.7670,
            longitude=11.7345,
            last_location_update=now,
        )
        db.add(officer_user)

        admin_user = models.User(
            username="admin",
            email="admin@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Base Admin",
            station_name="Maitri",
            skills=["administration", "communication"],
            latitude=-70.7655,
            longitude=11.7320,
            last_location_update=now,
        )
        db.add(admin_user)

        member_user = models.User(
            username="member",
            email="member@polarops.in",
            hashed_password=hash_password(admin_password),
            role="Team Member",
            station_name="Maitri",
            skills=["fieldwork", "survey", "mechanics"],
            latitude=-70.7680,
            longitude=11.7360,
            last_location_update=now,
        )
        db.add(member_user)

        # ── Active Expedition ─────────────────────────────────────────
        expedition = models.Expedition(
            name="Winter Ops 2026",
            station_name="Maitri",
            latitude=-70.7660,
            longitude=11.7330,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 10, 31),
            status="Active",
            target_team_size=8,
        )
        db.add(expedition)

        # ── Inventory Items ───────────────────────────────────────────
        # 2 items intentionally below min_required to show Low Stock card on dashboard
        inventory_items = [
            models.InventoryItem(
                name="Aviation Fuel (Jet-A1)",
                category="Fuel",
                quantity=320.0,         # LOW STOCK (< min_required 500)
                unit="Litres",
                min_required=500.0,
                daily_use_per_person=8.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.3,
            ),
            models.InventoryItem(
                name="Diesel (Generator)",
                category="Fuel",
                quantity=1800.0,
                unit="Litres",
                min_required=600.0,
                daily_use_per_person=15.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.2,
            ),
            models.InventoryItem(
                name="Emergency Rations (MRE)",
                category="Ration",
                quantity=48.0,          # LOW STOCK (< min_required 80)
                unit="Units",
                min_required=80.0,
                daily_use_per_person=3.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.0,
            ),
            models.InventoryItem(
                name="Drinking Water Canisters",
                category="Ration",
                quantity=600.0,
                unit="Litres",
                min_required=200.0,
                daily_use_per_person=4.0,
                location_station="Maitri",
                cold_factor_sensitivity=1.0,
            ),
            models.InventoryItem(
                name="Thermal Gear Sets",
                category="Spares",
                quantity=10.0,
                unit="Units",
                min_required=8.0,
                daily_use_per_person=0.1,
                location_station="Maitri",
                cold_factor_sensitivity=1.0,
            ),
            models.InventoryItem(
                name="Medical Kit (Field)",
                category="Medical",
                quantity=6.0,
                unit="Boxes",
                min_required=4.0,
                daily_use_per_person=0.05,
                location_station="Maitri",
                cold_factor_sensitivity=1.0,
            ),
        ]
        for item in inventory_items:
            db.add(item)

        # ── Vehicles ──────────────────────────────────────────────────
        vehicles = [
            models.Vehicle(
                name="Sno-Cat Alpha",
                type="Sno-Cat",
                latitude=-70.7660,
                longitude=11.7330,
                status="Available",
                weather_limit="Blizzard Level 2",
                station_name="Maitri",
            ),
            models.Vehicle(
                name="Sno-Cat Bravo",
                type="Sno-Cat",
                latitude=-70.7670,
                longitude=11.7350,
                status="On-Mission",
                weather_limit="Blizzard Level 1",
                station_name="Maitri",
            ),
            models.Vehicle(
                name="Chetak Helicopter",
                type="Helicopter",
                latitude=-70.7640,
                longitude=11.7300,
                status="Available",
                weather_limit="Clear",
                station_name="Maitri",
            ),
        ]
        for veh in vehicles:
            db.add(veh)

        # ── Sample Alerts ─────────────────────────────────────────────
        alerts = [
            models.Alert(
                alert_type="Stock_Low",
                title="Aviation Fuel Below Threshold",
                message="Aviation Fuel (Jet-A1) at 320 L — below minimum requirement of 500 L. Resupply needed before next helicopter sortie.",
                severity="High",
                latitude=-70.7660,
                longitude=11.7330,
                status="Active",
            ),
            models.Alert(
                alert_type="Stock_Low",
                title="Emergency Rations Running Low",
                message="MRE stock at 48 units against minimum of 80. At current consumption rate, critical threshold reached in ~5 days.",
                severity="Medium",
                latitude=-70.7660,
                longitude=11.7330,
                status="Active",
            ),
        ]
        for alert in alerts:
            db.add(alert)

        # ── Genesis AuditLog ──────────────────────────────────────────
        gen_timestamp = datetime.now(timezone.utc)
        genesis_prev = "0" * 64
        gen_payload = {"event": "PolarOps Ledger Initialized", "bootstrap_admin": admin_email}
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

        print("[SUCCESS] Database seeded with demo data:")
        print("  * 4 user accounts (Leader, Officer, Admin, Member) — all with fresh GPS timestamps")
        print("  * 1 active expedition: Winter Ops 2026 @ Maitri (team size 8)")
        print("  * 6 inventory items (2 low-stock for dashboard Low Stock Items card)")
        print("  * 3 vehicles (Sno-Cat Alpha, Sno-Cat Bravo, Chetak Helicopter)")
        print("  * 2 stock alerts (High + Medium severity)")

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
