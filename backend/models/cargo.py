from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
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
    created_at = Column(DateTime, default=datetime.utcnow)
