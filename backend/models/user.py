from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # Expedition Leader, Logistics Officer, Base Admin, Team Member
    station_name = Column(String, nullable=True)  # Maitri, Bharati
    created_at = Column(DateTime, default=datetime.utcnow)
