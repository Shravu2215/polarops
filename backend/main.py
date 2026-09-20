from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from contextlib import asynccontextmanager

from database import engine, get_db, Base
import models
from models.audit import verify_chain
import config

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="PolarOps Backend API",
    description="Digital Twin API for Antarctic Research Expeditions (Maitri & Bharati)",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas for Auth
class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

@app.get("/")
def read_root():
    return {
        "app": "PolarOps Digital Twin Engine",
        "stations": ["Maitri", "Bharati"],
        "status": "Operational"
    }

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db_status = "disconnected"
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    db_type = engine.name  # 'sqlite' or 'postgresql'
    db_url_display = str(engine.url)
    if "@" in db_url_display:
        db_url_display = db_url_display.split("@")[-1]

    return {
        "status": "ok",
        "service": "PolarOps Backend",
        "database": db_status,
        "database_type": db_type,
        "database_url": db_url_display,
        "mqtt": {
            "broker": config.MQTT_BROKER_HOST,
            "port": config.MQTT_BROKER_PORT
        }
    }


# --- Auth Routes ---
@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    query = db.query(models.User)
    if req.username:
        user = query.filter(models.User.username == req.username).first()
    elif req.email:
        user = query.filter(models.User.email == req.email).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is required"
        )

    if not user or user.hashed_password != req.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    role_slug = user.role.lower().replace(" ", "-")
    mock_token = f"mock-jwt-token-{role_slug}-{user.id}"

    return {
        "access_token": mock_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "station_name": user.station_name
        }
    }

# --- Audit Chain Verification Route ---
@app.get("/audit/verify")
def verify_audit_log_chain(db: Session = Depends(get_db)):
    return verify_chain(db)

# --- Entity List GET Routes ---
@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    items = db.query(models.InventoryItem).all()
    return items

@app.get("/people")
def get_people(db: Session = Depends(get_db)):
    people = db.query(models.Person).all()
    return people

@app.get("/vehicles")
def get_vehicles(db: Session = Depends(get_db)):
    vehicles = db.query(models.Vehicle).all()
    return vehicles

@app.get("/alerts")
def get_alerts(db: Session = Depends(get_db)):
    alerts = db.query(models.Alert).all()
    return alerts

@app.get("/cargo")
def get_cargo(db: Session = Depends(get_db)):
    shipments = db.query(models.CargoShipment).all()
    return shipments
