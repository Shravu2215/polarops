from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from database import Base

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # Sno-Cat, Helicopter, Quad
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(String, default="Available")  # Available, On-Mission, Maintenance
    weather_limit = Column(String, nullable=False)  # Blizzard Level 1/2/3, Clear, All-Weather
    station_name = Column(String, nullable=False)  # Maitri, Bharati
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
