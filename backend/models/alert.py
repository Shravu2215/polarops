from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from database import Base

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, nullable=False)  # SOS, Weather, Stock_Low, System
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    severity = Column(String, default="High")  # Critical, High, Medium, Info
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(String, default="Active")  # Active, Responded, Resolved
    created_at = Column(DateTime, default=datetime.utcnow)
