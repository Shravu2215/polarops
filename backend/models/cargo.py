from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from datetime import datetime
from database import Base

class CargoShipment(Base):
    __tablename__ = "cargo_shipments"

    id = Column(Integer, primary_key=True, index=True)
    shipment_code = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    weight_kg = Column(Float, nullable=False)
    volume_m3 = Column(Float, nullable=False)
    priority = Column(String, default="Medium")  # Critical, High, Medium, Low
    status = Column(String, default="Pending")  # Pending, Packed, In-Transit, Delivered
    expedition_id = Column(Integer, ForeignKey("expeditions.id"), nullable=True)
    station_name = Column(String, nullable=True)
    direction = Column(String, nullable=False, default="Inbound")
    items_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class CargoManifest(Base):
    __tablename__ = "cargo_manifests"

    id = Column(Integer, primary_key=True, index=True)
    expedition_id = Column(Integer, ForeignKey("expeditions.id"), nullable=False, index=True)
    shipment_code = Column(String, nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Draft")
    vehicle_capacity_weight_kg = Column(Float, nullable=False, default=0.0)
    vehicle_capacity_volume_m3 = Column(Float, nullable=False, default=0.0)
    total_weight_kg = Column(Float, nullable=False, default=0.0)
    total_volume_m3 = Column(Float, nullable=False, default=0.0)
    selected_item_count = Column(Integer, nullable=False, default=0)
    total_priority_value = Column(Integer, nullable=False, default=0)
    items_json = Column(JSON, nullable=False, default=list)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
