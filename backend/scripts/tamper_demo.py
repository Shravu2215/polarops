import os
import sys
import sqlite3
import argparse

def tamper_audit_log(target_db_path=None):
    parser = argparse.ArgumentParser(description="Demonstrate database tampering by directly editing an audit log entry.")
    parser.add_argument("--confirm", action="store_true", help="Explicitly confirm tampering execution")
    parser.add_argument("--db", type=str, default=None, help="Optional target database path")
    args = parser.parse_args()

    if not args.confirm:
        print("ERROR: Safety check failed! You must pass the '--confirm' flag to execute database tampering.")
        print("Usage: python scripts/tamper_demo.py --confirm [--db path/to/database.db]")
        sys.exit(1)

    if args.db:
        db_path = os.path.abspath(args.db)
    elif target_db_path:
        db_path = os.path.abspath(target_db_path)
    else:
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "polarops.db"))

    if not os.path.exists(db_path):
        print(f"Error: Target database not found at '{db_path}'")
        sys.exit(1)

    print(f"Targeting Database for Tamper Simulation: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get first audit log entry
    row = cursor.execute("SELECT id, action, payload, hash FROM audit_logs ORDER BY id ASC LIMIT 1").fetchone()
    if not row:
        print("No audit log entries found in database to tamper with!")
        conn.close()
        sys.exit(1)

    entry_id, orig_action, orig_payload, orig_hash = row
    tampered_action = "TAMPERED_MALICIOUS_ACTION"
    
    # Directly update SQLite row bypassing FastAPI models & hash computation
    cursor.execute(
        "UPDATE audit_logs SET action = ? WHERE id = ?",
        (tampered_action, entry_id)
    )
    conn.commit()

    print("\n==================================================")
    print(f"TAMPER SIMULATION SUCCESSFUL (Entry #{entry_id})")
    print("==================================================")
    print(f"Entry ID: {entry_id}")
    print(f"Original Action: '{orig_action}' -> Tampered Action: '{tampered_action}'")
    print(f"Stored Hash: {orig_hash[:16]}... (unchanged, creating hash mismatch!)")
    print("Run GET /audit/verify to see cryptographic chain failure.")

    conn.close()

if __name__ == "__main__":
    tamper_audit_log()
