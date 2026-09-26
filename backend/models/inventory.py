from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from database import Base

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)  # Fuel, Ration, Spares, Medical, Equipment
    quantity = Column(Float, nullable=False, default=0.0)
    opening_quantity = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="IN STOCK")
    unit = Column(String, nullable=False)  # Litres, Kg, Units, Boxes
    min_required = Column(Float, nullable=False, default=0.0)
    daily_use_per_person = Column(Float, nullable=False, default=1.0)  # Rate per person per day
    location_station = Column(String, nullable=False)  # Maitri, Bharati
    cold_factor_sensitivity = Column(Float, default=1.0)  # Multiplier sensitivity for colder temps
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_client_timestamp = Column(String, nullable=True)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    movement_type = Column(String, nullable=False)
    quantity_delta = Column(Float, nullable=False)
    quantity_after = Column(Float, nullable=False)
    station_name = Column(String, nullable=False, index=True)
    reference_type = Column(String, nullable=True)
    reference_id = Column(Integer, nullable=True)
    notes = Column(String, nullable=True)
    performed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
