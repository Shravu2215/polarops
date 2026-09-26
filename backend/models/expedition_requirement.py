from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from database import Base


class ExpeditionRequirement(Base):
    __tablename__ = "expedition_requirements"

    id = Column(Integer, primary_key=True, index=True)
    expedition_id = Column(Integer, ForeignKey("expeditions.id"), nullable=False, index=True)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    supply_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Requested")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)