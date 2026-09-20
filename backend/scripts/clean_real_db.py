import os
import sqlite3

def clean_real_db():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "polarops.db"))
    print(f"Cleaning real database at: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Delete all cargo shipments starting with TEST-
    cursor.execute("DELETE FROM cargo_shipments WHERE shipment_code LIKE 'TEST-%' OR title LIKE 'TEST-%'")
    deleted_cargo = cursor.rowcount

    # Delete test users
    cursor.execute("DELETE FROM users WHERE username IN ('hacker', 'alex', 'user2') OR email LIKE '%test%' OR email LIKE '%hacker%'")
    deleted_users = cursor.rowcount

    # Delete test inventory items if any
    cursor.execute("DELETE FROM inventory_items WHERE name LIKE 'TEST-%'")
    deleted_inventory = cursor.rowcount

    conn.commit()

    print(f"Cleaned: {deleted_cargo} test cargo items, {deleted_users} test users, {deleted_inventory} test inventory items.")

    print("\n==================================================")
    print("REMAINING DATA IN REAL POLAROPS.DB")
    print("==================================================")
    
    users = cursor.execute("SELECT id, username, email, role, station_name FROM users").fetchall()
    print(f"\nUSERS ({len(users)}):")
    for u in users:
        print(f" - ID {u[0]}: {u[1]} ({u[2]}) | Role: {u[3]} | Station: {u[4]}")

    inventory = cursor.execute("SELECT id, name, category, quantity, unit, location_station FROM inventory_items").fetchall()
    print(f"\nINVENTORY ITEMS ({len(inventory)}):")
    for inv in inventory:
        print(f" - ID {inv[0]}: {inv[1]} [{inv[2]}] | Qty: {inv[3]} {inv[4]} | Station: {inv[5]}")

    expeditions = cursor.execute("SELECT id, name, station_name, target_team_size, status FROM expeditions").fetchall()
    print(f"\nEXPEDITIONS ({len(expeditions)}):")
    for exp in expeditions:
        print(f" - ID {exp[0]}: {exp[1]} | Station: {exp[2]} | Team: {exp[3]} | Status: {exp[4]}")

    cargo = cursor.execute("SELECT id, shipment_code, title, priority, weight_kg, volume_m3, status FROM cargo_shipments").fetchall()
    print(f"\nCARGO SHIPMENTS ({len(cargo)}):")
    for c in cargo:
        print(f" - ID {c[0]}: {c[1]} - {c[2]} | Prio: {c[3]} | {c[4]}kg, {c[5]}m3 | Status: {c[6]}")

    audit_logs = cursor.execute("SELECT count(*) FROM audit_logs").fetchone()[0]
    print(f"\nAUDIT LOG ENTRIES: {audit_logs}")

    conn.close()

if __name__ == "__main__":
    clean_real_db()
