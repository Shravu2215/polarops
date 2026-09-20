from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
import hashlib
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
    def compute_hash(action: str, performed_by: str, target_resource: str, payload: str, timestamp_str: str, prev_hash: str) -> str:
        raw_data = f"{action}|{performed_by}|{target_resource}|{payload or ''}|{timestamp_str}|{prev_hash}"
        return hashlib.sha256(raw_data.encode("utf-8")).hexdigest()
