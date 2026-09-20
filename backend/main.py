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

# --- Dashboard Summary Route ---
@app.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    # 1. Team Size from Active Expedition
    active_exp = db.query(models.Expedition).filter(models.Expedition.status == "Active").first()
    team_size = active_exp.target_team_size if (active_exp and active_exp.target_team_size) else 40

    # 2. Survival Days (Minimum days over Fuel & Ration items)
    items = db.query(models.InventoryItem).filter(models.InventoryItem.category.in_(["Fuel", "Ration"])).all()
    days_list = []
    for item in items:
        daily_burn = team_size * item.daily_use_per_person
        if daily_burn > 0:
            days_list.append(item.quantity / daily_burn)
    
    survival_days = round(min(days_list), 1) if days_list else 120.0

    # 3. Aggregated Counts
    active_expeditions_count = db.query(models.Expedition).filter(models.Expedition.status == "Active").count()
    cargo_in_transit_count = db.query(models.CargoShipment).filter(models.CargoShipment.status == "In-Transit").count()
    personnel_on_field_count = db.query(models.Person).filter(models.Person.status.in_(["Active", "On-Mission"])).count()
    
    # Low stock count: quantity <= min_required
    all_inventory = db.query(models.InventoryItem).all()
    low_stock_count = sum(1 for i in all_inventory if i.quantity <= i.min_required)

    # 4. Latest 5 Alerts
    latest_alerts_query = db.query(models.Alert).order_by(models.Alert.created_at.desc()).limit(5).all()
    latest_alerts = [
        {
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "severity": a.severity,
            "alert_type": a.alert_type,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in latest_alerts_query
    ]

    # 5. Weather Mock Object
    weather = {
        "temperature": -24.5,
        "unit": "°C",
        "wind_chill": -38.0,
        "station": active_exp.station_name if active_exp else "Maitri",
        "blizzard_warning": "Blizzard Level 2 Warning: Winds > 65 knots expected in 4 hours"
    }

    return {
        "survival_days": survival_days,
        "active_expeditions": active_expeditions_count,
        "cargo_in_transit": cargo_in_transit_count,
        "personnel_on_field": personnel_on_field_count,
        "low_stock_items": low_stock_count,
        "team_size": team_size,
        "latest_alerts": latest_alerts,
        "weather": weather
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
