from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime, timezone
import hashlib
import json
from database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    performed_by = Column(String, nullable=False)
    target_resource = Column(String, nullable=False)
    payload = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    prev_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False)

    @staticmethod
    def format_timestamp(ts) -> str:
        if isinstance(ts, str):
            return ts
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.strftime("%Y-%m-%dT%H:%M:%SZ")

    @staticmethod
    def serialize_payload(payload_obj) -> str:
        if payload_obj is None:
            return ""
        if isinstance(payload_obj, (dict, list)):
            return json.dumps(payload_obj, sort_keys=True)
        try:
            # Check if valid JSON string and re-serialize deterministically
            parsed = json.loads(payload_obj)
            return json.dumps(parsed, sort_keys=True)
        except (ValueError, TypeError):
            return str(payload_obj)

    @classmethod
    def compute_hash(cls, action: str, performed_by: str, target_resource: str, payload: any, timestamp: any, prev_hash: str) -> str:
        payload_str = cls.serialize_payload(payload)
        ts_str = cls.format_timestamp(timestamp)
        raw_data = f"{prev_hash}{action}{performed_by}{target_resource}{payload_str}{ts_str}"
        return hashlib.sha256(raw_data.encode("utf-8")).hexdigest()

def verify_chain(db):
    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    if not logs:
        return {"valid": True, "count": 0, "message": "No audit entries found."}

    expected_prev_hash = "0" * 64
    for index, entry in enumerate(logs):
        if entry.prev_hash != expected_prev_hash:
            return {
                "valid": False,
                "broken_id": entry.id,
                "index": index,
                "reason": f"Previous hash mismatch. Expected {expected_prev_hash}, found {entry.prev_hash}"
            }
        
        computed = AuditLog.compute_hash(
            action=entry.action,
            performed_by=entry.performed_by,
            target_resource=entry.target_resource,
            payload=entry.payload,
            timestamp=entry.timestamp,
            prev_hash=entry.prev_hash
        )

        if entry.hash != computed:
            return {
                "valid": False,
                "broken_id": entry.id,
                "index": index,
                "reason": f"Entry hash tampered/mismatch. Expected {computed}, found {entry.hash}"
            }
        
        expected_prev_hash = entry.hash

    return {
        "valid": True,
        "count": len(logs),
        "message": f"All {len(logs)} audit entries verified intact."
    }
