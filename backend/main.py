from fastapi import FastAPI, Depends, HTTPException, status, Request, Response, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Any
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import math
import json
import numpy as np

from database import engine, get_db, Base
import models
from models.audit import verify_chain, AuditLog
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_leader,
    require_write_role,
)
from weather_service import fetch_real_weather
import config

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)
def extract_timestamps(request: Request, client_ts_param: Optional[str] = None):
    now_iso = datetime.now(timezone.utc).isoformat()
    client_ts = (
        request.headers.get("Client-Timestamp") or 
        request.headers.get("X-Client-Timestamp") or 
        client_ts_param or 
        now_iso
    )
    return client_ts, now_iso

def check_idempotency(request: Request, db: Session):
    idem_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    if idem_key:
        record = db.query(models.IdempotencyRecord).filter(models.IdempotencyRecord.key == idem_key).first()
        if record:
            try:
                body = json.loads(record.response_body)
            except Exception:
                body = record.response_body
            return JSONResponse(status_code=record.response_status, content=body)
    return None

def save_idempotency(request: Request, response_status: int, response_body: Any, db: Session):
    idem_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    if idem_key:
        existing = db.query(models.IdempotencyRecord).filter(models.IdempotencyRecord.key == idem_key).first()
        if not existing:
            body_str = json.dumps(response_body) if isinstance(response_body, (dict, list)) else str(response_body)
            record = models.IdempotencyRecord(
                key=idem_key,
                endpoint=request.url.path,
                response_status=response_status,
                response_body=body_str,
                created_at=datetime.now(timezone.utc)
            )
            db.add(record)
            db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="PolarOps Digital Twin Engine",
    description="Real-time operations & emergency dispatch API for Antarctic stations",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str  # Expedition Leader, Logistics Officer, Base Admin, Team Member
    station_name: str  # Maitri, Bharati
    skills: Optional[List[str]] = []

class LocationUpdateRequest(BaseModel):
    latitude: float
    longitude: float

class ProfileUpdateRequest(BaseModel):
    role: Optional[str] = None
    skills: Optional[List[str]] = None
    phone: Optional[str] = None

class CreateExpeditionRequest(BaseModel):
    name: str
    station_name: str
    latitude: float
    longitude: float
    start_date: str  # YYYY-MM-DD
    end_date: str
    target_team_size: int
    status: Optional[str] = "Active"
    client_timestamp: Optional[str] = None

class CreateInventoryItemRequest(BaseModel):
    name: str
    category: str  # Fuel, Ration, Spares, Medical, Equipment
    quantity: float
    unit: str
    min_required: float
    daily_use_per_person: float
    location_station: str
    cold_factor_sensitivity: Optional[float] = 1.0
    client_timestamp: Optional[str] = None

class UpdateInventoryItemRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    min_required: Optional[float] = None
    daily_use_per_person: Optional[float] = None
    location_station: Optional[str] = None
    cold_factor_sensitivity: Optional[float] = None
    client_timestamp: Optional[str] = None

class CreateCargoRequest(BaseModel):
    shipment_code: str
    title: str
    weight_kg: float
    volume_m3: float
    priority: str  # Critical, High, Medium, Low
    status: Optional[str] = "Pending"
    expedition_id: Optional[int] = None
    client_timestamp: Optional[str] = None

class UpdateCargoStatusRequest(BaseModel):
    status: str
    client_timestamp: Optional[str] = None

class CreateVehicleRequest(BaseModel):
    name: str
    type: str  # Sno-Cat, Helicopter, Quad
    latitude: float
    longitude: float
    weather_limit: str
    station_name: str
    status: Optional[str] = "Available"
    client_timestamp: Optional[str] = None

class SOSRequest(BaseModel):
    skill_needed: str
    latitude: float
    longitude: float
    client_timestamp: Optional[str] = None

class CreatePersonRequest(BaseModel):
    name: str
    role: str
    skills: Optional[List[str]] = []
    latitude: float
    longitude: float
    station_name: str
    status: Optional[str] = "Active"
    phone: Optional[str] = None
    vehicle_assigned: Optional[str] = None

class MilestoneInput(BaseModel):
    name: str
    duration_days: int

class PlanScheduleRequest(BaseModel):
    expedition_id: Optional[int] = None
    expedition_name: Optional[str] = "Bharati 2026 Season Expedition"
    station_name: Optional[str] = "Bharati"
    departure_deadline: str
    milestones: List[MilestoneInput]


# --- Root & Health Routes ---
@app.get("/")
def read_root():
    return {
        "app": "PolarOps Digital Twin Engine",
        "status": "Operational",
        "mode": "Zero Mock Data"
    }

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db_status = "disconnected"
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    db_type = engine.name
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

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    role: Optional[str] = "Team Member"
    station_name: Optional[str] = "Maitri"
    skills: Optional[List[str]] = []

class UpdateRoleRequest(BaseModel):
    role: str

# --- Real Auth & User Management Routes ---
@app.post("/auth/register")
def register_user(req: RegisterRequest, db: Session = Depends(get_db)):
    clean_username = req.username.strip().lower()
    clean_email = req.email.strip().lower()

    existing_user = db.query(models.User).filter(
        (models.User.username == clean_username) | (models.User.email == clean_email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is already registered."
        )

    # Requirement 1: Security - POST /auth/register MUST ALWAYS create a Team Member. Ignore client-provided role.
    assigned_role = "Team Member"
    user_skills = req.skills if (req.skills and len(req.skills) > 0) else []

    hashed_pw = hash_password(req.password)
    new_user = models.User(
        username=clean_username,
        email=clean_email,
        hashed_password=hashed_pw,
        role=assigned_role,
        station_name=req.station_name or "Maitri",
        skills=user_skills
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Sync a Person record for location/dispatching
    initial_lat = -70.7660 if new_user.station_name == "Maitri" else -69.4070
    initial_lon = 11.7330 if new_user.station_name == "Maitri" else 76.1910

    person = models.Person(
        name=clean_username.capitalize(),
        role=new_user.role,
        skills=user_skills,
        latitude=initial_lat,
        longitude=initial_lon,
        station_name=new_user.station_name,
        status="Active",
        user_id=new_user.id
    )
    db.add(person)
    db.commit()

    # Log to Audit Ledger
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)

    payload = {"user_id": new_user.id, "username": new_user.username, "email": new_user.email, "role": new_user.role, "station": new_user.station_name}
    new_hash = AuditLog.compute_hash("USER_REGISTERED", new_user.username, f"USER-{new_user.id}", payload, now_dt, prev_hash)

    audit_entry = AuditLog(
        action="USER_REGISTERED",
        performed_by=new_user.username,
        target_resource=f"USER-{new_user.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    access_token = create_access_token(data={"sub": new_user.username, "role": new_user.role, "user_id": new_user.id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "role": new_user.role,
            "station_name": new_user.station_name
        }
    }

@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    identifier = (req.email or req.username or "").strip().lower()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required"
        )

    user = db.query(models.User).filter(
        (models.User.email == identifier) | (models.User.username == identifier)
    ).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please check your email/username and password."
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role, "user_id": user.id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "station_name": user.station_name
        }
    }

@app.get("/users")
def get_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.id.asc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "station_name": u.station_name,
            "skills": u.skills or [],
            "latitude": u.latitude,
            "longitude": u.longitude,
            "last_location_update": u.last_location_update.isoformat() if u.last_location_update else None
        }
        for u in users
    ]

@app.post("/users")
def create_user(
    req: CreateUserRequest,
    current_user: models.User = Depends(require_leader),
    db: Session = Depends(get_db)
):
    existing = db.query(models.User).filter(
        (models.User.username == req.username) | (models.User.email == req.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists"
        )

    new_user = models.User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role=req.role,
        station_name=req.station_name,
        skills=req.skills or []
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Sync a Person record for dispatching
    person = models.Person(
        name=req.username.capitalize(),
        role=req.role,
        skills=req.skills or [],
        latitude=-70.7660 if req.station_name == "Maitri" else -69.4070,
        longitude=11.7330 if req.station_name == "Maitri" else 76.1910,
        station_name=req.station_name,
        status="Active",
        user_id=new_user.id
    )
    db.add(person)
    db.commit()

    # Log to Hash Chain
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)

    payload = {"username": new_user.username, "role": new_user.role, "station": new_user.station_name}
    new_hash = AuditLog.compute_hash("USER_CREATED", current_user.username, f"USER-{new_user.id}", payload, now_dt, prev_hash)
    
    audit_entry = AuditLog(
        action="USER_CREATED",
        performed_by=current_user.username,
        target_resource=f"USER-{new_user.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    return {"message": "User account created successfully", "user_id": new_user.id}

@app.patch("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    req: UpdateRoleRequest,
    current_user: models.User = Depends(require_leader),
    db: Session = Depends(get_db)
):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_role = target_user.role
    target_user.role = req.role

    # Sync to Person record
    person = db.query(models.Person).filter(models.Person.user_id == target_user.id).first()
    if person:
        person.role = req.role

    db.commit()

    # Log to Hash Chain
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {"user_id": target_user.id, "old_role": old_role, "new_role": req.role}
    new_hash = AuditLog.compute_hash("ROLE_CHANGE", current_user.username, f"USER-{target_user.id}", payload, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="ROLE_CHANGE",
        performed_by=current_user.username,
        target_resource=f"USER-{target_user.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    return {"message": "User role updated successfully", "user_id": target_user.id, "new_role": req.role}

@app.patch("/me/location")
def update_user_location(
    req: LocationUpdateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now_dt = datetime.now(timezone.utc)
    current_user.latitude = req.latitude
    current_user.longitude = req.longitude
    current_user.last_location_update = now_dt

    # Sync to Person record
    person = db.query(models.Person).filter(models.Person.user_id == current_user.id).first()
    if not person:
        person = models.Person(
            name=current_user.username,
            role=current_user.role,
            skills=[],
            latitude=req.latitude,
            longitude=req.longitude,
            station_name=current_user.station_name or "Maitri",
            status="Active",
            user_id=current_user.id,
            last_location_update=now_dt
        )
        db.add(person)
    else:
        person.latitude = req.latitude
        person.longitude = req.longitude
        person.last_location_update = now_dt

    db.commit()
    return {"status": "updated", "latitude": req.latitude, "longitude": req.longitude, "updated_at": now_dt.isoformat()}

@app.put("/me/profile")
def update_user_profile(
    req: ProfileUpdateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    person = db.query(models.Person).filter(models.Person.user_id == current_user.id).first()
    if person:
        if req.skills is not None:
            person.skills = req.skills
        if req.role:
            person.role = req.role
        if req.phone:
            person.phone = req.phone
        db.commit()
    return {"status": "profile_updated"}

# --- Expeditions CRUD ---
@app.post("/expeditions")
def create_expedition(
    req: CreateExpeditionRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    if req.status == "Active":
        db.query(models.Expedition).filter(models.Expedition.status == "Active").update({"status": "Completed"})

    start_d = datetime.strptime(req.start_date, "%Y-%m-%d").date()
    end_d = datetime.strptime(req.end_date, "%Y-%m-%d").date()

    exp = models.Expedition(
        name=req.name,
        station_name=req.station_name,
        start_date=start_d,
        end_date=end_d,
        status=req.status or "Active",
        target_team_size=req.target_team_size
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    # Audit log
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "expedition_id": exp.id,
        "name": exp.name,
        "target_team_size": exp.target_team_size,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("EXPEDITION_CREATED", current_user.username, f"EXPEDITION-{exp.id}", payload, now_dt, prev_hash)

    audit = AuditLog(
        action="EXPEDITION_CREATED",
        performed_by=current_user.username,
        target_resource=f"EXPEDITION-{exp.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit)
    db.commit()

    res = {
        "id": exp.id,
        "name": exp.name,
        "station_name": exp.station_name,
        "start_date": exp.start_date.isoformat(),
        "end_date": exp.end_date.isoformat(),
        "target_team_size": exp.target_team_size,
        "status": exp.status
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/expeditions")
def get_expeditions(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Expedition).order_by(models.Expedition.id.desc()).all()

# --- Inventory CRUD ---
@app.post("/inventory")
def create_inventory_item(
    req: CreateInventoryItemRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    item = models.InventoryItem(
        name=req.name,
        category=req.category,
        quantity=req.quantity,
        unit=req.unit,
        min_required=req.min_required,
        daily_use_per_person=req.daily_use_per_person,
        location_station=req.location_station,
        cold_factor_sensitivity=req.cold_factor_sensitivity or 1.0,
        last_client_timestamp=client_ts
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Audit log
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "item_id": item.id,
        "name": item.name,
        "quantity": item.quantity,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("INVENTORY_ADDED", current_user.username, f"INVENTORY-{item.id}", payload, now_dt, prev_hash)

    audit = AuditLog(
        action="INVENTORY_ADDED",
        performed_by=current_user.username,
        target_resource=f"INVENTORY-{item.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit)
    db.commit()

    res = {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "quantity": item.quantity,
        "unit": item.unit,
        "min_required": item.min_required,
        "daily_use_per_person": item.daily_use_per_person,
        "location_station": item.location_station
    }
    save_idempotency(request, 200, res, db)
    return res

@app.put("/inventory/{item_id}")
@app.patch("/inventory/{item_id}")
def update_inventory_item(
    item_id: int,
    req: UpdateInventoryItemRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    # Conflict Resolution: Last-Write-Wins by client_timestamp
    if item.last_client_timestamp and client_ts < item.last_client_timestamp:
        res = {
            "id": item.id,
            "name": item.name,
            "category": item.category,
            "quantity": item.quantity,
            "unit": item.unit,
            "min_required": item.min_required,
            "daily_use_per_person": item.daily_use_per_person,
            "location_station": item.location_station,
            "status": "conflict_skipped"
        }
        save_idempotency(request, 200, res, db)
        return res

    overwritten_value = item.quantity
    if req.quantity is not None:
        item.quantity = req.quantity
    if req.name is not None:
        item.name = req.name
    if req.category is not None:
        item.category = req.category
    if req.unit is not None:
        item.unit = req.unit
    if req.min_required is not None:
        item.min_required = req.min_required
    if req.daily_use_per_person is not None:
        item.daily_use_per_person = req.daily_use_per_person
    if req.location_station is not None:
        item.location_station = req.location_station
    if req.cold_factor_sensitivity is not None:
        item.cold_factor_sensitivity = req.cold_factor_sensitivity
    item.last_client_timestamp = client_ts

    db.commit()
    db.refresh(item)

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "item_id": item.id,
        "overwritten_value": overwritten_value,
        "new_quantity": item.quantity,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("INVENTORY_UPDATED", current_user.username, f"INVENTORY-{item.id}", payload, now_dt, prev_hash)
    audit = AuditLog(
        action="INVENTORY_UPDATED",
        performed_by=current_user.username,
        target_resource=f"INVENTORY-{item.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit)
    db.commit()

    res = {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "quantity": item.quantity,
        "unit": item.unit,
        "min_required": item.min_required,
        "daily_use_per_person": item.daily_use_per_person,
        "location_station": item.location_station
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/inventory")
def get_inventory(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.InventoryItem).order_by(models.InventoryItem.id.asc()).all()

# --- Cargo CRUD ---
@app.post("/cargo")
def create_cargo(
    req: CreateCargoRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    cargo = models.CargoShipment(
        shipment_code=req.shipment_code,
        title=req.title,
        weight_kg=req.weight_kg,
        volume_m3=req.volume_m3,
        priority=req.priority,
        status=req.status or "Pending",
        expedition_id=req.expedition_id
    )
    db.add(cargo)
    db.commit()
    db.refresh(cargo)

    # Log to Hash Chain
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "cargo_id": cargo.id,
        "code": cargo.shipment_code,
        "title": cargo.title,
        "priority": cargo.priority,
        "weight_kg": cargo.weight_kg,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("CARGO_CREATED", current_user.username, f"CARGO-{cargo.id}", payload, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="CARGO_CREATED",
        performed_by=current_user.username,
        target_resource=f"CARGO-{cargo.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    res = {
        "id": cargo.id,
        "shipment_code": cargo.shipment_code,
        "title": cargo.title,
        "weight_kg": cargo.weight_kg,
        "volume_m3": cargo.volume_m3,
        "priority": cargo.priority,
        "status": cargo.status
    }
    save_idempotency(request, 200, res, db)
    return res

@app.patch("/cargo/{cargo_id}/status")
@app.put("/cargo/{cargo_id}")
def update_cargo_status(
    cargo_id: int,
    req: UpdateCargoStatusRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)
    cargo = db.query(models.CargoShipment).filter(models.CargoShipment.id == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo shipment not found")

    old_status = cargo.status
    cargo.status = req.status
    db.commit()
    db.refresh(cargo)

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "cargo_id": cargo.id,
        "old_status": old_status,
        "new_status": cargo.status,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("CARGO_STATUS_CHANGED", current_user.username, f"CARGO-{cargo.id}", payload, now_dt, prev_hash)
    audit = AuditLog(
        action="CARGO_STATUS_CHANGED",
        performed_by=current_user.username,
        target_resource=f"CARGO-{cargo.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit)
    db.commit()

    res = {
        "id": cargo.id,
        "shipment_code": cargo.shipment_code,
        "title": cargo.title,
        "weight_kg": cargo.weight_kg,
        "volume_m3": cargo.volume_m3,
        "priority": cargo.priority,
        "status": cargo.status
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/cargo")
def get_cargo(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.CargoShipment).order_by(models.CargoShipment.id.desc()).all()

# --- Vehicles CRUD ---
@app.post("/vehicles")
def create_vehicle(
    req: CreateVehicleRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    v = models.Vehicle(
        name=req.name,
        type=req.type,
        latitude=req.latitude,
        longitude=req.longitude,
        weather_limit=req.weather_limit,
        station_name=req.station_name,
        status=req.status or "Available"
    )
    db.add(v)
    db.commit()
    db.refresh(v)

    # Log to Hash Chain
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload = {
        "vehicle_id": v.id,
        "name": v.name,
        "type": v.type,
        "station": v.station_name,
        "client_timestamp": client_ts,
        "received_at": received_at
    }
    new_hash = AuditLog.compute_hash("VEHICLE_CREATED", current_user.username, f"VEHICLE-{v.id}", payload, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="VEHICLE_CREATED",
        performed_by=current_user.username,
        target_resource=f"VEHICLE-{v.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    res = {
        "id": v.id,
        "name": v.name,
        "type": v.type,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "status": v.status,
        "weather_limit": v.weather_limit,
        "station_name": v.station_name
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/vehicles")
def get_vehicles(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Vehicle).all()


# --- People Routes ---
@app.get("/people")
def get_people(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Person).all()

@app.post("/people")
def create_person(
    req: CreatePersonRequest,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    person = models.Person(
        name=req.name,
        role=req.role,
        skills=req.skills or [],
        latitude=req.latitude,
        longitude=req.longitude,
        station_name=req.station_name,
        status=req.status or "Active",
        phone=req.phone,
        vehicle_assigned=req.vehicle_assigned,
        last_location_update=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person

# --- Planner / Backward Scheduling Engine ---
def calculate_backward_schedule(departure_deadline_str: str, milestones: List[dict]):
    try:
        deadline = datetime.strptime(departure_deadline_str, "%Y-%m-%d").date()
    except Exception:
        deadline = datetime.fromisoformat(departure_deadline_str.replace("Z", "+00:00")).date()

    today = datetime.now(timezone.utc).date()

    scheduled = []
    curr_finish = deadline
    for m in reversed(milestones):
        m_name = m.get("name") or "Milestone"
        duration = int(m.get("duration_days", 1))
        start_date = curr_finish - timedelta(days=duration)
        is_at_risk = start_date < today

        scheduled.append({
            "name": m_name,
            "duration_days": duration,
            "latest_start_date": start_date.isoformat(),
            "latest_finish_date": curr_finish.isoformat(),
            "is_at_risk": is_at_risk
        })
        curr_finish = start_date

    scheduled.reverse()

    earliest_start = datetime.strptime(scheduled[0]["latest_start_date"], "%Y-%m-%d").date() if scheduled else today
    total_buffer_days = (earliest_start - today).days
    at_risk_count = sum(1 for item in scheduled if item["is_at_risk"])

    return {
        "departure_deadline": deadline.isoformat(),
        "total_buffer_days": total_buffer_days,
        "scheduled_milestones": scheduled,
        "at_risk_count": at_risk_count,
        "has_at_risk": at_risk_count > 0,
        "calculated_at": datetime.now(timezone.utc).isoformat()
    }

@app.get("/planner")
def get_planner_schedule(
    expedition_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp = None
    if expedition_id:
        exp = db.query(models.Expedition).filter(models.Expedition.id == expedition_id).first()
    else:
        exp = db.query(models.Expedition).first()

    if exp and exp.schedule_output:
        return {
            "expedition_id": exp.id,
            "expedition_name": exp.name,
            "station_name": exp.station_name,
            "schedule": exp.schedule_output
        }

    default_deadline = (datetime.now(timezone.utc) + timedelta(days=45)).strftime("%Y-%m-%d")
    default_milestones = [
        {"name": "Procurement & Gear Sourcing", "duration_days": 14},
        {"name": "Packing & Cold Cargo Prep", "duration_days": 7},
        {"name": "Vessel / Air Shipping to Base", "duration_days": 18},
        {"name": "Station Setup & Safety Audit", "duration_days": 5}
    ]
    schedule_res = calculate_backward_schedule(default_deadline, default_milestones)
    return {
        "expedition_id": exp.id if exp else None,
        "expedition_name": exp.name if exp else "Bharati 2026 Season Expedition",
        "station_name": exp.station_name if exp else "Bharati",
        "schedule": schedule_res
    }

@app.post("/planner/schedule")
def save_planner_schedule(
    req: PlanScheduleRequest,
    request: Request,
    current_user: models.User = Depends(require_write_role),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    milestone_dicts = [m.model_dump() for m in req.milestones]
    schedule_res = calculate_backward_schedule(req.departure_deadline, milestone_dicts)

    exp = None
    if req.expedition_id:
        exp = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()

    if not exp:
        exp = db.query(models.Expedition).first()

    if not exp:
        try:
            deadline_date = datetime.strptime(schedule_res["departure_deadline"], "%Y-%m-%d").date()
        except Exception:
            deadline_date = datetime.now(timezone.utc).date() + timedelta(days=45)

        exp = models.Expedition(
            name=req.expedition_name or "Bharati 2026 Season Expedition",
            station_name=req.station_name or "Bharati",
            start_date=deadline_date - timedelta(days=60),
            end_date=deadline_date,
            status="Planning",
            target_team_size=25
        )
        db.add(exp)
        db.flush()

    exp.departure_deadline = schedule_res["departure_deadline"]
    exp.milestones_json = milestone_dicts
    exp.schedule_output = schedule_res
    exp.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(exp)

    prev_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = prev_log.hash if prev_log else "0" * 64
    ts = datetime.now(timezone.utc)

    audit_payload = {
        "event": "PLANNER_SCHEDULE_UPDATED",
        "expedition_id": exp.id,
        "expedition_name": exp.name,
        "departure_deadline": schedule_res["departure_deadline"],
        "total_buffer_days": schedule_res["total_buffer_days"],
        "at_risk_count": schedule_res["at_risk_count"],
        "milestones_count": len(req.milestones)
    }

    entry_hash = AuditLog.compute_hash(
        action="PLAN_UPDATE",
        performed_by=current_user.username,
        target_resource=f"Expedition:{exp.id}",
        payload=audit_payload,
        timestamp=ts,
        prev_hash=prev_hash
    )

    audit_log = AuditLog(
        action="PLAN_UPDATE",
        performed_by=current_user.username,
        target_resource=f"Expedition:{exp.id}",
        payload=AuditLog.serialize_payload(audit_payload),
        timestamp=ts,
        prev_hash=prev_hash,
        hash=entry_hash
    )
    db.add(audit_log)
    db.commit()

    res_body = {
        "expedition_id": exp.id,
        "expedition_name": exp.name,
        "station_name": exp.station_name,
        "schedule": schedule_res
    }
    save_idempotency(request, 200, res_body, db)
    return res_body

# --- Alerts Route ---

@app.get("/alerts")
def get_alerts(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).all()

# --- Real SOS Dispatch Route with 10-Min Location Freshness Filter ---
@app.post("/sos")
def trigger_sos(
    req: SOSRequest,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)
    skill_target = req.skill_needed.lower()
    cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=10)

    # Query all People who have updated location in the LAST 10 MINUTES
    fresh_people = db.query(models.Person).filter(
        (models.Person.last_location_update >= cutoff_time) |
        (models.Person.updated_at >= cutoff_time)
    ).all()

    # Filter for people matching skill_needed
    matching_people = []
    for p in fresh_people:
        skills_lower = [s.lower() for s in (p.skills or [])]
        if skill_target in skills_lower or skill_target in (p.role or "").lower():
            matching_people.append(p)

    if not matching_people:
        res = {
            "status": "No Responder Available",
            "message": f"No responder with '{req.skill_needed}' skill has updated location in the last 10 minutes."
        }
        save_idempotency(request, 200, res, db)
        return res

    nearest_person = None
    min_person_dist = float("inf")
    for p in matching_people:
        dist = haversine_km(req.latitude, req.longitude, p.latitude, p.longitude)
        if dist < min_person_dist:
            min_person_dist = dist
            nearest_person = p

    if nearest_person:
        nearest_person.status = "On-Mission"

    # Find nearest Available Vehicle
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

    # Create Alert
    responder_name = nearest_person.name if nearest_person else "Base Team"
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

    # Hash Chain Audit
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)

    resp_dist = round(min_person_dist, 2) if min_person_dist != float("inf") else 0.0
    veh_dist = round(min_vehicle_dist, 2) if min_vehicle_dist != float("inf") else 0.0

    payload_dict = {
        "alert_id": new_alert.id,
        "skill_requested": req.skill_needed,
        "responder": responder_name,
        "responder_distance_km": resp_dist,
        "vehicle": vehicle_name,
        "vehicle_distance_km": veh_dist,
        "client_timestamp": client_ts,
        "received_at": received_at
    }

    new_hash = AuditLog.compute_hash("SOS_DISPATCH", current_user.username, f"ALERT-{new_alert.id}", payload_dict, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="SOS_DISPATCH",
        performed_by=current_user.username,
        target_resource=f"ALERT-{new_alert.id}",
        payload=AuditLog.serialize_payload(payload_dict),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    res = {
        "status": "Dispatched",
        "responder_name": responder_name,
        "responder_role": nearest_person.role if nearest_person else "Responder",
        "responder_distance_km": resp_dist,
        "vehicle_name": vehicle_name,
        "vehicle_distance_km": veh_dist,
        "alert_id": new_alert.id,
        "audit_hash": audit_entry.hash
    }
    save_idempotency(request, 200, res, db)
    return res


# --- Strict DB-Computed Dashboard Summary Route ---
@app.get("/dashboard/summary")
async def get_dashboard_summary(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    active_exp = db.query(models.Expedition).filter(models.Expedition.status == "Active").first()
    
    survival_days = None
    weather_data = None
    exp_temp = -30.0  # Default Antarctic temperature fallback
    
    if active_exp:
        station_name = active_exp.station_name
        team_size = active_exp.target_team_size or 6

        exp_lat = getattr(active_exp, 'latitude', None) or (-70.7660 if station_name == "Maitri" else -69.4070)
        exp_lon = getattr(active_exp, 'longitude', None) or (11.7330 if station_name == "Maitri" else 76.1910)

        # 1. Fetch Real Live Weather from Open-Meteo
        weather_data = await fetch_real_weather(
            latitude=exp_lat,
            longitude=exp_lon,
            station_name=station_name
        )

        if weather_data and "temperature" in weather_data:
            exp_temp = weather_data["temperature"]

        # 2. Survival Days computed at REAL station weather temperature using cold_factor
        station_items = db.query(models.InventoryItem).filter(
            models.InventoryItem.location_station == station_name,
            models.InventoryItem.category.in_(["Fuel", "Ration"])
        ).all()

        days_list = []
        for item in station_items:
            cf = calculate_cold_factor(exp_temp, item.cold_factor_sensitivity)
            daily_burn = team_size * item.daily_use_per_person * cf
            if daily_burn > 0:
                days_list.append(item.quantity / daily_burn)

        if days_list:
            survival_days = round(min(days_list), 1)

    # 3. Personnel on Field: Count users/people with location update in the LAST 10 MINUTES
    cutoff_10m = datetime.now(timezone.utc) - timedelta(minutes=10)
    personnel_on_field_count = db.query(models.User).filter(
        models.User.last_location_update >= cutoff_10m
    ).count()

    # 4. Aggregated Counts
    active_expeditions_count = db.query(models.Expedition).filter(models.Expedition.status == "Active").count()
    cargo_in_transit_count = db.query(models.CargoShipment).filter(models.CargoShipment.status == "In-Transit").count()
    
    all_inventory = db.query(models.InventoryItem).all()
    low_stock_count = sum(1 for i in all_inventory if i.quantity <= i.min_required)

    # 5. Latest 5 Alerts
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

    return {
        "survival_days": survival_days,
        "temperature_used": exp_temp,
        "active_expeditions": active_expeditions_count,
        "cargo_in_transit": cargo_in_transit_count,
        "personnel_on_field": personnel_on_field_count,
        "low_stock_items": low_stock_count,
        "team_size": active_exp.target_team_size if active_exp else 0,
        "active_expedition_name": active_exp.name if active_exp else None,
        "active_station": active_exp.station_name if active_exp else None,
        "latest_alerts": latest_alerts,
        "weather": weather_data
    }

@app.get("/audit/verify")
def verify_audit_log_chain(db: Session = Depends(get_db)):
    return verify_chain(db)

# HEURISTIC CONFIGURATION NOTE:
# calculate_cold_factor is a configurable operational heuristic (percent increase in burn rate
# per degree C below freezing multiplied by item cold sensitivity), not an empirical physics measurement.
def calculate_cold_factor(temperature_c: float, sensitivity: float = 1.0) -> float:
    """
    Calculates cold factor burn multiplier for Antarctic extreme weather.
    For every 1°C temperature drop below 0°C, burn rate increases linearly by 1% * sensitivity factor.
    """
    degrees_below_zero = max(0.0, -temperature_c)
    sens = sensitivity if sensitivity is not None else 1.0
    return round(1.0 + (degrees_below_zero * 0.01 * sens), 3)

@app.get("/forecast")
async def get_supply_forecast(
    temperature: Optional[float] = None,
    days: Optional[int] = 30,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    active_exp = db.query(models.Expedition).filter(models.Expedition.status == "Active").first()
    station_name = active_exp.station_name if active_exp else "Maitri"
    team_size = active_exp.target_team_size if active_exp else 6
    days_count = max(1, days or 30)

    # If temperature is not provided, fetch live station weather from Open-Meteo
    actual_temp = temperature
    if actual_temp is None:
        if active_exp:
            exp_lat = getattr(active_exp, 'latitude', None) or (-70.7660 if station_name == "Maitri" else -69.4070)
            exp_lon = getattr(active_exp, 'longitude', None) or (11.7330 if station_name == "Maitri" else 76.1910)
            weather_res = await fetch_real_weather(exp_lat, exp_lon, station_name)
            if weather_res and "temperature" in weather_res:
                actual_temp = weather_res["temperature"]

        if actual_temp is None:
            actual_temp = -30.0  # Default Antarctic temperature fallback

    # Query inventory items for active station
    items = db.query(models.InventoryItem).filter(
        models.InventoryItem.location_station == station_name
    ).order_by(models.InventoryItem.id.asc()).all()

    forecast_items = []
    fuel_ration_days = []

    for item in items:
        cf = calculate_cold_factor(actual_temp, item.cold_factor_sensitivity)
        daily_burn = team_size * item.daily_use_per_person * cf
        required = round(team_size * days_count * item.daily_use_per_person * cf, 1)
        available = item.quantity
        shortfall = max(0.0, round(required - available, 1))

        # Status logic
        if available < required:
            item_status = "Short"
        elif available <= (required * 1.2) or available <= item.min_required:
            item_status = "Low"
        else:
            item_status = "OK"

        if item.category in ["Fuel", "Ration"] and daily_burn > 0:
            fuel_ration_days.append(item.quantity / daily_burn)

        forecast_items.append({
            "id": item.id,
            "name": item.name,
            "category": item.category,
            "available": item.quantity,
            "unit": item.unit,
            "min_required": item.min_required,
            "daily_use_per_person": item.daily_use_per_person,
            "cold_factor_sensitivity": item.cold_factor_sensitivity or 1.0,
            "cold_factor_used": cf,
            "required": required,
            "shortfall": shortfall,
            "status": item_status
        })

    survival_days = round(min(fuel_ration_days), 1) if fuel_ration_days else None

    return {
        "temperature_c": actual_temp,
        "days": days_count,
        "survival_days": survival_days,
        "station_name": station_name,
        "team_size": team_size,
        "items": forecast_items
    }

# --- Part 2: Cargo Loading Optimizer (Google OR-Tools CP-SAT) ---
from ortools.sat.python import cp_model

PRIORITY_WEIGHTS = {
    "Critical": 1000,
    "High": 50,
    "Medium": 5,
    "Low": 1
}

class OptimizeCargoRequest(BaseModel):
    capacity_weight_kg: float
    capacity_volume_m3: float

@app.post("/cargo/optimize")
def optimize_cargo_loading(
    req: OptimizeCargoRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cargo_items = db.query(models.CargoShipment).filter(
        models.CargoShipment.status.in_(["Pending", "Packed"])
    ).all()

    if not cargo_items:
        return {
            "status": "Optimal",
            "packed_items": [],
            "left_behind_items": [],
            "total_weight_kg": 0.0,
            "total_volume_m3": 0.0,
            "capacity_weight_kg": req.capacity_weight_kg,
            "capacity_volume_m3": req.capacity_volume_m3,
            "weight_utilization_percent": 0.0,
            "volume_utilization_percent": 0.0,
            "total_priority_value": 0
        }

    # Build OR-Tools CP-SAT Knapsack Model (2 Constraints: Weight + Volume)
    model = cp_model.CpModel()
    SCALE = 100
    weight_cap = int(round(req.capacity_weight_kg * SCALE))
    vol_cap = int(round(req.capacity_volume_m3 * SCALE))

    x = {}
    for i, item in enumerate(cargo_items):
        x[i] = model.NewBoolVar(f"x_{i}")

    # Constraint 1: Weight limit
    model.Add(sum(int(round(item.weight_kg * SCALE)) * x[i] for i, item in enumerate(cargo_items)) <= weight_cap)

    # Constraint 2: Volume limit
    model.Add(sum(int(round(item.volume_m3 * SCALE)) * x[i] for i, item in enumerate(cargo_items)) <= vol_cap)

    # Objective: Maximize total priority value
    model.Maximize(sum(PRIORITY_WEIGHTS.get(item.priority, 1) * x[i] for i, item in enumerate(cargo_items)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    sol_status = solver.Solve(model)

    packed_items = []
    left_behind_items = []
    total_weight = 0.0
    total_volume = 0.0
    total_priority = 0

    for i, item in enumerate(cargo_items):
        item_dict = {
            "id": item.id,
            "shipment_code": item.shipment_code,
            "title": item.title,
            "weight_kg": item.weight_kg,
            "volume_m3": item.volume_m3,
            "priority": item.priority,
            "priority_value": PRIORITY_WEIGHTS.get(item.priority, 1),
            "status": item.status
        }
        if sol_status in (cp_model.OPTIMAL, cp_model.FEASIBLE) and solver.Value(x[i]) == 1:
            packed_items.append(item_dict)
            total_weight += item.weight_kg
            total_volume += item.volume_m3
            total_priority += PRIORITY_WEIGHTS.get(item.priority, 1)
        else:
            left_behind_items.append(item_dict)

    weight_util = round((total_weight / req.capacity_weight_kg * 100.0), 1) if req.capacity_weight_kg > 0 else 0.0
    vol_util = round((total_volume / req.capacity_volume_m3 * 100.0), 1) if req.capacity_volume_m3 > 0 else 0.0

    # Log to Hash Chain
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload_dict = {
        "capacity_weight_kg": req.capacity_weight_kg,
        "capacity_volume_m3": req.capacity_volume_m3,
        "packed_count": len(packed_items),
        "left_behind_count": len(left_behind_items),
        "total_priority_value": total_priority
    }
    new_hash = AuditLog.compute_hash("CARGO_OPTIMIZED", current_user.username, "CARGO_OPTIMIZER", payload_dict, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="CARGO_OPTIMIZED",
        performed_by=current_user.username,
        target_resource="CARGO_OPTIMIZER",
        payload=AuditLog.serialize_payload(payload_dict),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    return {
        "status": "Optimal" if sol_status == cp_model.OPTIMAL else "Feasible",
        "packed_items": packed_items,
        "left_behind_items": left_behind_items,
        "total_weight_kg": round(total_weight, 1),
        "total_volume_m3": round(total_volume, 1),
        "capacity_weight_kg": req.capacity_weight_kg,
        "capacity_volume_m3": req.capacity_volume_m3,
        "weight_utilization_percent": min(100.0, weight_util),
        "volume_utilization_percent": min(100.0, vol_util),
        "total_priority_value": total_priority
    }

# --- Hash Chain Audit Ledger Routes ---
@app.get("/audit")
def get_audit_logs(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.id.asc()).all()
    return [
        {
            "id": entry.id,
            "action": entry.action,
            "performed_by": entry.performed_by,
            "target_resource": entry.target_resource,
            "payload": entry.payload,
            "timestamp": models.AuditLog.format_timestamp(entry.timestamp),
            "prev_hash": entry.prev_hash,
            "hash": entry.hash,
            "short_hash": entry.hash[:8] if entry.hash else ""
        }
        for entry in logs
    ]

@app.get("/audit/verify")
def verify_audit_chain(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return models.audit.verify_chain(db)

# --- What-If Simulator (NumPy Monte Carlo Stockout Engine) ---
class SimulateRequest(BaseModel):
    resupply_in_days: float
    delay_days: Optional[float] = 0.0
    blizzard_days: Optional[float] = 0.0
    fuel_loss_percent: Optional[float] = 0.0
    temperature: Optional[float] = None
    runs: Optional[int] = 1000

def run_monte_carlo_stockout_simulation(
    item_name: str,
    item_category: str,
    available_qty: float,
    unit: str,
    daily_use_per_person: float,
    cold_factor_sensitivity: float,
    team_size: int,
    temp_c: float,
    resupply_in_days: float,
    delay_days: float,
    blizzard_days: float,
    fuel_loss_percent: float,
    runs: int = 1000
) -> dict:
    """
    Single documented Monte Carlo simulation function calculating stockout probability
    and P10/P50/P90 days to stockout using NumPy.
    Daily consumption noise: Lognormal(sigma=0.10) (~10% daily variance).
    Resupply arrival day jitter: Normal(mean=0, sigma=1.0 day).
    Uses item-specific seed for reproducible random noise so identical item parameters
    yield identical baseline and scenario results.
    """
    cold_factor = calculate_cold_factor(temp_c, cold_factor_sensitivity)
    base_daily_burn = team_size * daily_use_per_person * cold_factor

    effective_initial_qty = available_qty
    if item_category.lower() == "fuel" and fuel_loss_percent > 0:
        effective_initial_qty = max(0.0, available_qty * (1.0 - (fuel_loss_percent / 100.0)))

    if base_daily_burn <= 0 or effective_initial_qty <= 0:
        return {
            "name": item_name,
            "category": item_category,
            "available_quantity": round(effective_initial_qty, 1),
            "unit": unit,
            "cold_factor_used": round(cold_factor, 3),
            "stockout_probability_percent": 100.0 if effective_initial_qty <= 0 else 0.0,
            "p10_days": 0.0 if effective_initial_qty <= 0 else 999.0,
            "p50_days": 0.0 if effective_initial_qty <= 0 else 999.0,
            "p90_days": 0.0 if effective_initial_qty <= 0 else 999.0,
            "risk_level": "Critical" if effective_initial_qty <= 0 else "Low"
        }

    # Deterministic item seed for reproducible daily noise per item
    item_seed = abs(hash(item_name)) % 1000000
    rng = np.random.RandomState(item_seed)

    target_arrival_base = resupply_in_days + delay_days + blizzard_days
    arrival_jitters = rng.normal(loc=0.0, scale=1.0, size=runs)
    arrival_days = np.maximum(1.0, target_arrival_base + arrival_jitters)

    # Compute simulation horizon max_days based on expected stockout days
    expected_days = effective_initial_qty / base_daily_burn
    max_days = int(np.ceil(max(target_arrival_base + 90.0, expected_days * 1.5)))

    # Generate daily consumption noise matrix (runs x max_days)
    daily_noise = rng.lognormal(mean=-0.005, sigma=0.10, size=(runs, max_days))
    daily_burn_matrix = base_daily_burn * daily_noise
    cum_burn = np.cumsum(daily_burn_matrix, axis=1)

    stockout_occurred_count = 0
    days_to_stockout_list = []

    for r in range(runs):
        target_arrival = arrival_days[r]
        stockout_indices = np.where(cum_burn[r, :] >= effective_initial_qty)[0]
        if len(stockout_indices) > 0:
            stockout_day = float(stockout_indices[0] + 1)
        else:
            stockout_day = float(max_days)

        days_to_stockout_list.append(stockout_day)

        if stockout_day < target_arrival:
            stockout_occurred_count += 1

    stockout_prob_pct = round((stockout_occurred_count / runs) * 100.0, 1)
    p10_days = round(float(np.percentile(days_to_stockout_list, 10)), 1)
    p50_days = round(float(np.percentile(days_to_stockout_list, 50)), 1)
    p90_days = round(float(np.percentile(days_to_stockout_list, 90)), 1)

    if stockout_prob_pct < 10.0:
        risk_level = "Low"
    elif stockout_prob_pct <= 50.0:
        risk_level = "Elevated"
    else:
        risk_level = "Critical"

    return {
        "name": item_name,
        "category": item_category,
        "available_quantity": round(effective_initial_qty, 1),
        "unit": unit,
        "cold_factor_used": round(cold_factor, 3),
        "stockout_probability_percent": stockout_prob_pct,
        "p10_days": p10_days,
        "p50_days": p50_days,
        "p90_days": p90_days,
        "risk_level": risk_level
    }

@app.post("/simulate")
def run_whatif_simulation(
    req: SimulateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    active_exp = db.query(models.Expedition).filter(models.Expedition.status == "Active").first()
    station_name = active_exp.station_name if active_exp else "Maitri"
    team_size = active_exp.target_team_size if (active_exp and active_exp.target_team_size) else 6

    actual_temp = req.temperature
    if actual_temp is None:
        if active_exp:
            exp_lat = getattr(active_exp, 'latitude', None) or (-70.7660 if station_name == "Maitri" else -69.4070)
            exp_lon = getattr(active_exp, 'longitude', None) or (11.7330 if station_name == "Maitri" else 76.1910)
            w_res = get_polar_weather(exp_lat, exp_lon, station_name)
            actual_temp = w_res.get("temperature", -30.0)
        else:
            actual_temp = -30.0

    items = db.query(models.InventoryItem).filter(
        models.InventoryItem.location_station == station_name,
        models.InventoryItem.category.in_(["Fuel", "Ration"])
    ).all()

    if not items:
        items = db.query(models.InventoryItem).filter(
            models.InventoryItem.category.in_(["Fuel", "Ration"])
        ).all()

    runs_cnt = req.runs or 1000

    baseline_results = []
    scenario_results = []

    for item in items:
        base_res = run_monte_carlo_stockout_simulation(
            item_name=item.name,
            item_category=item.category,
            available_qty=item.quantity,
            unit=item.unit,
            daily_use_per_person=item.daily_use_per_person,
            cold_factor_sensitivity=item.cold_factor_sensitivity or 1.0,
            team_size=team_size,
            temp_c=actual_temp,
            resupply_in_days=req.resupply_in_days,
            delay_days=0.0,
            blizzard_days=0.0,
            fuel_loss_percent=0.0,
            runs=runs_cnt
        )
        baseline_results.append(base_res)

        scen_res = run_monte_carlo_stockout_simulation(
            item_name=item.name,
            item_category=item.category,
            available_qty=item.quantity,
            unit=item.unit,
            daily_use_per_person=item.daily_use_per_person,
            cold_factor_sensitivity=item.cold_factor_sensitivity or 1.0,
            team_size=team_size,
            temp_c=actual_temp,
            resupply_in_days=req.resupply_in_days,
            delay_days=req.delay_days or 0.0,
            blizzard_days=req.blizzard_days or 0.0,
            fuel_loss_percent=req.fuel_loss_percent or 0.0,
            runs=runs_cnt
        )
        scenario_results.append(scen_res)

    assumptions_dict = {
        "monte_carlo_runs": runs_cnt,
        "daily_consumption_noise": "Lognormal(sigma=0.10, ~10% daily variation)",
        "resupply_delay_jitter": "Normal(mean=0, sigma=1.0 day)",
        "cold_factor_formula": "1 + (degrees_below_zero * 0.01 * sensitivity)"
    }

    # Log to Hash Chain Audit
    last_log = db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload_dict = {
        "resupply_in_days": req.resupply_in_days,
        "delay_days": req.delay_days,
        "blizzard_days": req.blizzard_days,
        "fuel_loss_percent": req.fuel_loss_percent,
        "temperature": actual_temp,
        "runs": runs_cnt
    }
    new_hash = models.AuditLog.compute_hash("SIMULATION_RUN", current_user.username, "WHATIF_SIMULATOR", payload_dict, now_dt, prev_hash)
    audit_entry = models.AuditLog(
        action="SIMULATION_RUN",
        performed_by=current_user.username,
        target_resource="WHATIF_SIMULATOR",
        payload=models.AuditLog.serialize_payload(payload_dict),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash
    )
    db.add(audit_entry)
    db.commit()

    return {
        "active_expedition": active_exp.name if active_exp else "Default Station Baseline",
        "station_name": station_name,
        "team_size": team_size,
        "temperature_c": round(actual_temp, 1),
        "resupply_in_days": req.resupply_in_days,
        "delay_days": req.delay_days or 0.0,
        "blizzard_days": req.blizzard_days or 0.0,
        "fuel_loss_percent": req.fuel_loss_percent or 0.0,
        "assumptions": assumptions_dict,
        "baseline_items": baseline_results,
        "scenario_items": scenario_results
    }
