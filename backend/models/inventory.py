from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from database import Base

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)  # Fuel, Ration, Spares, Medical, Equipment
    quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String, nullable=False)  # Litres, Kg, Units, Boxes
    min_required = Column(Float, nullable=False, default=0.0)
    daily_use_per_person = Column(Float, nullable=False, default=1.0)  # Rate per person per day
    location_station = Column(String, nullable=False)  # Maitri, Bharati
    cold_factor_sensitivity = Column(Float, default=1.0)  # Multiplier sensitivity for colder temps
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
