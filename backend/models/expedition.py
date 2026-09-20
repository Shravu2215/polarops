from sqlalchemy import Column, Integer, String, Float, DateTime, Date
from datetime import datetime
from database import Base

class Expedition(Base):
    __tablename__ = "expeditions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    station_name = Column(String, nullable=False)  # Maitri, Bharati
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, default="Planning")  # Planning, Active, Completed, Suspended
    target_team_size = Column(Integer, default=25)
    created_at = Column(DateTime, default=datetime.utcnow)
