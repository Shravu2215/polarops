from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey
from datetime import datetime
from database import Base

class Person(Base):
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    skills = Column(JSON, default=list)  # ["doctor", "first_aid", "mechanic", "pilot"]
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    station_name = Column(String, nullable=False)  # Maitri, Bharati
    status = Column(String, default="Active")  # Active, Standby, On-Mission, Injured
    vehicle_assigned = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_location_update = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
