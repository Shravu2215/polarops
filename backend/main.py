from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import math

from database import engine, get_db, Base
import models
from models.audit import verify_chain, AuditLog
import config

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)

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

# Schemas
class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class SOSRequest(BaseModel):
    skill_needed: str
    latitude: float
    longitude: float
    performed_by: Optional[str] = "Team Member"

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
    team_size = active_exp.target_team_size if (active_exp and active_exp.target_team_size) else 6
    station_name = active_exp.station_name if active_exp else "Maitri"

    # 2. Survival Days (Minimum days over Fuel & Ration items at active expedition station)
    items = db.query(models.InventoryItem).filter(
        models.InventoryItem.location_station == station_name,
        models.InventoryItem.category.in_(["Fuel", "Ration"])
    ).all()
    
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
        "station": station_name,
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

# --- Real SOS Emergency Dispatch Route ---
@app.post("/sos")
def trigger_sos_dispatch(req: SOSRequest, db: Session = Depends(get_db)):
    skill_target = req.skill_needed.lower()
    
    # 1. Find nearest Person with required skill
    all_people = db.query(models.Person).all()
    matching_people = []
    for p in all_people:
        skills_lower = [s.lower() for s in (p.skills or [])]
        if skill_target in skills_lower or skill_target in p.role.lower():
            matching_people.append(p)
    
    if not matching_people:
        matching_people = all_people  # fallback to all personnel if no skill match

    nearest_person = None
    min_person_dist = float("inf")
    for p in matching_people:
        dist = haversine_km(req.latitude, req.longitude, p.latitude, p.longitude)
        if dist < min_person_dist:
            min_person_dist = dist
            nearest_person = p

    if nearest_person:
        nearest_person.status = "On-Mission"

    # 2. Find nearest Available Vehicle
    available_vehicles = db.query(models.Vehicle).filter(models.Vehicle.status == "Available").all()
    if not available_vehicles:
        available_vehicles = db.query(models.Vehicle).all()

    nearest_vehicle = None
    min_vehicle_dist = float("inf")
    for v in available_vehicles:
        dist = haversine_km(req.latitude, req.longitude, v.latitude, v.longitude)
        if dist < min_vehicle_dist:
            min_vehicle_dist = dist
            nearest_vehicle = v

    if nearest_vehicle:
        nearest_vehicle.status = "Dispatched"

    # 3. Create Critical Alert
    responder_name = nearest_person.name if nearest_person else "Base Rescue Team"
    vehicle_name = nearest_vehicle.name if nearest_vehicle else "Emergency Sno-Cat"
    
    new_alert = models.Alert(
        alert_type="SOS",
        title=f"SOS Dispatch - {req.skill_needed.capitalize()} Required",
        message=f"Dispatched responder {responder_name} with vehicle {vehicle_name} to ({req.latitude:.4f}, {req.longitude:.4f}).",
        severity="Critical",
        latitude=req.latitude,
        longitude=req.longitude,
        status="Active"
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    # 4. Write SHA-256 Audit Log Entry
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    
    payload_dict = {
        "alert_id": new_alert.id,
        "skill_requested": req.skill_needed,
        "responder": responder_name,
        "responder_distance_km": min_person_dist,
        "vehicle": vehicle_name,
        "vehicle_distance_km": min_vehicle_dist,
        "coordinates": {"lat": req.latitude, "long": req.longitude}
    }
    
    new_hash = AuditLog.compute_hash(
        action="SOS_DISPATCH",
        performed_by=req.performed_by or "Team Member",
        target_resource=f"ALERT-{new_alert.id}",
        payload=payload_dict,
        timestamp=now_dt,
        prev_hash=prev_hash
    )

    audit_entry = AuditLog(
        action="SOS_DISPATCH",
        performed_by=req.performed_by or "Team Member",
        target_resource=f"ALERT-{new_alert.id}",
        payload=AuditLog.serialize_payload(payload_dict),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    return {
        "status": "Dispatched",
        "responder_name": responder_name,
        "responder_role": nearest_person.role if nearest_person else "Responder",
        "responder_distance_km": min_person_dist,
        "vehicle_name": vehicle_name,
        "vehicle_distance_km": min_vehicle_dist,
        "alert_id": new_alert.id,
        "audit_hash": audit_entry.hash
    }

# --- Audit Chain Verification Route ---
@app.get("/audit/verify")
def verify_audit_log_chain(db: Session = Depends(get_db)):
    return verify_chain(db)

# --- Entity List GET Routes ---
@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    return db.query(models.InventoryItem).all()

@app.get("/people")
def get_people(db: Session = Depends(get_db)):
    return db.query(models.Person).all()

@app.get("/vehicles")
def get_vehicles(db: Session = Depends(get_db)):
    return db.query(models.Vehicle).all()

@app.get("/alerts")
def get_alerts(db: Session = Depends(get_db)):
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).all()

@app.get("/cargo")
def get_cargo(db: Session = Depends(get_db)):
    return db.query(models.CargoShipment).all()
