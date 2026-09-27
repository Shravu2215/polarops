from fastapi import FastAPI, Depends, HTTPException, status, Request, Response, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
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
    require_logistics_officer,
    require_write_role,
    require_base_admin,
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

def inventory_status(quantity: float, min_required: float) -> str:
    if quantity <= 0:
        return "OUT OF STOCK"
    if min_required > 0 and quantity <= min_required * 0.25:
        return "CRITICAL"
    if quantity <= min_required:
        return "LOW STOCK"
    return "IN STOCK"

def _record_inventory_movement(
    db: Session,
    item: models.InventoryItem,
    movement_type: str,
    quantity_delta: float,
    current_user: models.User,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> models.InventoryMovement:
    new_quantity = float(item.quantity) + float(quantity_delta)
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.name}")

    item.quantity = new_quantity
    item.status = inventory_status(item.quantity, item.min_required)
    movement = models.InventoryMovement(
        inventory_item_id=item.id,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        quantity_after=item.quantity,
        station_name=item.location_station,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        performed_by_user_id=current_user.id,
    )
    db.add(movement)

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = last_log.hash if last_log else ("0" * 64)
    timestamp = datetime.now(timezone.utc)
    payload = {
        "inventory_item_id": item.id,
        "movement_type": movement_type,
        "quantity_delta": quantity_delta,
        "quantity_after": item.quantity,
        "station_name": item.location_station,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "notes": notes,
    }
    action = f"INVENTORY_{movement_type}"
    db.add(AuditLog(
        action=action,
        performed_by=current_user.username,
        target_resource=f"INVENTORY-{item.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=timestamp,
        prev_hash=previous_hash,
        hash=AuditLog.compute_hash(action, current_user.username, f"INVENTORY-{item.id}", payload, timestamp, previous_hash),
    ))
    db.flush()
    return movement

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    vehicle_columns = {column["name"] for column in inspect(engine).get_columns("vehicles")}
    vehicle_migrations = {
        "assigned_expedition_id": "INTEGER",
        "requested_expedition_id": "INTEGER",
        "requested_by_id": "INTEGER",
        "request_status": "VARCHAR(32)",
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
    }
    inventory_columns = {column["name"] for column in inspect(engine).get_columns("inventory_items")}
    inventory_migrations = {
        "opening_quantity": "FLOAT NOT NULL DEFAULT 0",
        "status": "VARCHAR(32) NOT NULL DEFAULT 'IN STOCK'",
    }
    cargo_columns = {column["name"] for column in inspect(engine).get_columns("cargo_shipments")}
    cargo_migrations = {
        "station_name": "VARCHAR",
        "direction": "VARCHAR(16) NOT NULL DEFAULT 'Inbound'",
        "items_json": "JSON NOT NULL DEFAULT '[]'",
    }
    cargo_manifest_columns = {column["name"] for column in inspect(engine).get_columns("cargo_manifests")}
    cargo_manifest_migrations = {
        "submitted_at": "DATETIME",
        "reviewed_by_user_id": "INTEGER",
        "reviewed_at": "DATETIME",
        "rejection_reason": "VARCHAR",
    }
    expedition_columns = {column["name"] for column in inspect(engine).get_columns("expeditions")}
    with engine.begin() as connection:
        for column_name, column_type in vehicle_migrations.items():
            if column_name not in vehicle_columns:
                connection.execute(text(f"ALTER TABLE vehicles ADD COLUMN {column_name} {column_type}"))
        for column_name, column_type in inventory_migrations.items():
            if column_name not in inventory_columns:
                connection.execute(text(f"ALTER TABLE inventory_items ADD COLUMN {column_name} {column_type}"))
                if column_name == "opening_quantity":
                    connection.execute(text("UPDATE inventory_items SET opening_quantity = quantity"))
        for column_name, column_type in cargo_migrations.items():
            if column_name not in cargo_columns:
                connection.execute(text(f"ALTER TABLE cargo_shipments ADD COLUMN {column_name} {column_type}"))
        for column_name, column_type in cargo_manifest_migrations.items():
            if column_name not in cargo_manifest_columns:
                connection.execute(text(f"ALTER TABLE cargo_manifests ADD COLUMN {column_name} {column_type}"))
        if "leader_user_id" not in expedition_columns:
            connection.execute(text("ALTER TABLE expeditions ADD COLUMN leader_user_id INTEGER"))
        connection.execute(text("""
            UPDATE inventory_items
            SET status = CASE
                WHEN quantity <= 0 THEN 'OUT OF STOCK'
                WHEN min_required > 0 AND quantity <= min_required * 0.25 THEN 'CRITICAL'
                WHEN quantity <= min_required THEN 'LOW STOCK'
                ELSE 'IN STOCK'
            END
        """))
        connection.execute(text("UPDATE vehicles SET status = 'In Use' WHERE status IN ('On-Mission', 'Dispatched')"))
    db_scope = get_db()
    db = next(db_scope)
    try:
        inventory_items = db.query(models.InventoryItem).all()
        for item in inventory_items:
            has_opening_movement = db.query(models.InventoryMovement.id).filter(
                models.InventoryMovement.inventory_item_id == item.id,
                models.InventoryMovement.reference_type == "OPENING_STOCK",
            ).first()
            if not has_opening_movement:
                db.add(models.InventoryMovement(
                    inventory_item_id=item.id,
                    movement_type="ADJUSTED",
                    quantity_delta=0,
                    quantity_after=item.quantity,
                    station_name=item.location_station,
                    reference_type="OPENING_STOCK",
                    reference_id=item.id,
                    notes="Opening balance migrated from existing station stock",
                ))
        db.commit()

        # Check if users exist, if not seed database
        user_count = db.query(models.User).count()
        if user_count == 0:
            print("[INFO] Database is empty. Seeding demo data...")
            try:
                import seed
                seed.seed_database(reset=False)
            except Exception as e:
                print(f"[ERROR] Auto-seeding failed: {e}")
    finally:
        db.close()
        db_scope.close()
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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    start_date: str  # YYYY-MM-DD
    end_date: str
    target_team_size: Optional[int] = None
    assigned_members: Optional[List[int]] = []  # User IDs
    status: Optional[str] = "Active"
    client_timestamp: Optional[str] = None

class CreateExpeditionRequirementRequest(BaseModel):
    expedition_id: int
    supply_name: str
    quantity: float

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
    station_name: Optional[str] = None
    items: Optional[List["CargoShipmentItemRequest"]] = None
    client_timestamp: Optional[str] = None

class CargoShipmentItemRequest(BaseModel):
    supply_name: str
    quantity: int

class ConsumeInventoryRequest(BaseModel):
    quantity: float
    notes: Optional[str] = None

class CargoManifestItemRequest(BaseModel):
    supply_name: str
    quantity: int
    selected_quantity: Optional[int] = None
    weight_per_unit: Optional[float] = None
    volume_per_unit: Optional[float] = None
    priority: Optional[str] = None
    priority_value: Optional[int] = None

class CreateCargoManifestRequest(BaseModel):
    expedition_id: int
    title: str
    shipment_code: str
    vehicle_capacity_weight_kg: float
    vehicle_capacity_volume_m3: float
    items: List[CargoManifestItemRequest]
    status: Optional[str] = "Draft"

class CargoManifestStatusRequest(BaseModel):
    status: str
    rejection_reason: Optional[str] = None

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

class UpdateVehicleRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    weather_limit: Optional[str] = None
    station_name: Optional[str] = None
    status: Optional[str] = None

class VehicleStatusRequest(BaseModel):
    status: str

class VehicleExpeditionRequest(BaseModel):
    expedition_id: int

class SOSRequest(BaseModel):
    skill_needed: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    client_timestamp: Optional[str] = None

class SOSStatusRequest(BaseModel):
    status: str

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
    start_date: Optional[str] = None
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
STATION_COORDINATES = {
    "Maitri": {"latitude": -70.7660, "longitude": 11.7330},
    "Bharati": {"latitude": -69.4070, "longitude": 76.1910},
}

@app.get("/stations")
def get_stations(current_user: models.User = Depends(get_current_user)):
    return [{"name": name, **coordinates} for name, coordinates in STATION_COORDINATES.items()]

@app.post("/expeditions")
def create_expedition(
    req: CreateExpeditionRequest,
    request: Request,
    current_user: models.User = Depends(require_leader),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    start_d = datetime.strptime(req.start_date, "%Y-%m-%d").date()
    end_d = datetime.strptime(req.end_date, "%Y-%m-%d").date()

    # Automatically derive coordinates from station name if available
    coords = STATION_COORDINATES.get(req.station_name, {})
    final_lat = coords.get("latitude", req.latitude if req.latitude is not None else -70.7660)
    final_lon = coords.get("longitude", req.longitude if req.longitude is not None else 11.7330)

    # Calculate team size automatically from assigned_members if provided
    assigned = req.assigned_members or []
    calculated_team_size = len(assigned) if len(assigned) > 0 else (req.target_team_size or 0)

    exp = models.Expedition(
        name=req.name,
        station_name=req.station_name,
        latitude=final_lat,
        longitude=final_lon,
        start_date=start_d,
        end_date=end_d,
        leader_user_id=current_user.id,
        status=req.status or "Active",
        target_team_size=calculated_team_size,
        assigned_members=assigned
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
        "station_name": exp.station_name,
        "target_team_size": exp.target_team_size,
        "assigned_members": exp.assigned_members,
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
        "latitude": exp.latitude,
        "longitude": exp.longitude,
        "start_date": exp.start_date.isoformat(),
        "end_date": exp.end_date.isoformat(),
        "target_team_size": exp.target_team_size,
        "assigned_members": exp.assigned_members,
        "status": exp.status
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/expeditions")
def get_expeditions(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Expedition).order_by(models.Expedition.id.desc()).all()

@app.get("/expeditions/{expedition_id}")
def get_expedition_details(
    expedition_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expedition = db.query(models.Expedition).filter(models.Expedition.id == expedition_id).first()
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")

    assigned_ids = [
        user_id for user_id in (expedition.assigned_members or [])
        if isinstance(user_id, int)
    ]
    assigned_users = (
        db.query(models.User).filter(models.User.id.in_(assigned_ids)).order_by(models.User.id.asc()).all()
        if assigned_ids else []
    )
    cargo_items = db.query(models.CargoShipment).filter(
        models.CargoShipment.expedition_id == expedition.id
    ).order_by(models.CargoShipment.id.desc()).all()
    audit_entries = db.query(AuditLog).filter(
        AuditLog.target_resource.in_([f"EXPEDITION-{expedition.id}", f"Expedition:{expedition.id}"])
    ).order_by(AuditLog.id.asc()).all()

    activity = []
    for entry in audit_entries:
        try:
            payload = json.loads(entry.payload) if entry.payload else {}
        except (TypeError, ValueError):
            payload = {}

        if entry.action == "EXPEDITION_CREATED":
            summary = "Expedition record created"
        elif entry.action == "PLAN_UPDATE":
            summary = (
                f"Schedule updated with {payload.get('milestones_count', 0)} milestones; "
                f"departure deadline {payload.get('departure_deadline', 'not set')}"
            )
        else:
            summary = entry.action.replace("_", " ").title()

        activity.append({
            "id": entry.id,
            "action": entry.action,
            "performed_by": entry.performed_by,
            "timestamp": AuditLog.format_timestamp(entry.timestamp),
            "summary": summary
        })

    return {
        "id": expedition.id,
        "name": expedition.name,
        "station_name": expedition.station_name,
        "latitude": expedition.latitude,
        "longitude": expedition.longitude,
        "start_date": expedition.start_date.isoformat() if expedition.start_date else None,
        "end_date": expedition.end_date.isoformat() if expedition.end_date else None,
        "status": expedition.status,
        "target_team_size": expedition.target_team_size,
        "assigned_members": expedition.assigned_members or [],
        "assigned_member_details": [
            {"id": member.id, "username": member.username, "role": member.role}
            for member in assigned_users
        ],
        "departure_deadline": expedition.departure_deadline,
        "milestones": expedition.milestones_json or [],
        "schedule": expedition.schedule_output,
        "cargo": [
            {
                "id": cargo.id,
                "shipment_code": cargo.shipment_code,
                "title": cargo.title,
                "weight_kg": cargo.weight_kg,
                "volume_m3": cargo.volume_m3,
                "priority": cargo.priority,
                "status": cargo.status
            }
            for cargo in cargo_items
        ],
        "activity": activity,
        "created_at": expedition.created_at.isoformat() if expedition.created_at else None,
        "updated_at": expedition.updated_at.isoformat() if expedition.updated_at else None
    }

# --- Supply Catalog API ---
from supply_catalog import STANDARD_SUPPLY_CATALOG

@app.get("/supply-catalog")
def get_supply_catalog(current_user: models.User = Depends(get_current_user)):
    return STANDARD_SUPPLY_CATALOG

@app.post("/expedition-requirements")
def create_expedition_requirement(
    req: CreateExpeditionRequirementRequest,
    current_user: models.User = Depends(require_leader),
    db: Session = Depends(get_db)
):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Required quantity must be greater than zero")

    expedition = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")

    catalog_item = next(
        (item for item in STANDARD_SUPPLY_CATALOG if item["name"] == req.supply_name),
        None
    )
    if not catalog_item:
        raise HTTPException(status_code=400, detail="Supply must be selected from the catalog")

    requirement = models.ExpeditionRequirement(
        expedition_id=expedition.id,
        requested_by_id=current_user.id,
        supply_name=catalog_item["name"],
        category=catalog_item["category"],
        quantity=req.quantity,
        unit=catalog_item["unit"],
        status="Requested"
    )
    db.add(requirement)
    db.commit()
    db.refresh(requirement)

    return {
        "id": requirement.id,
        "expedition_id": requirement.expedition_id,
        "requested_by_id": requirement.requested_by_id,
        "supply_name": requirement.supply_name,
        "category": requirement.category,
        "quantity": requirement.quantity,
        "unit": requirement.unit,
        "status": requirement.status,
        "created_at": requirement.created_at.isoformat()
    }

@app.get("/expedition-requirements")
def get_expedition_requirements(
    expedition_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.ExpeditionRequirement)
    if current_user.role in ("Logistics Officer", "Base Admin", "Team Member"):
        query = query.join(
            models.Expedition,
            models.Expedition.id == models.ExpeditionRequirement.expedition_id
        ).filter(models.Expedition.station_name == current_user.station_name)
    elif current_user.role != "Expedition Leader":
        raise HTTPException(status_code=403, detail="Forbidden: Supply requirements are not available to this role")

    if expedition_id is not None:
        query = query.filter(models.ExpeditionRequirement.expedition_id == expedition_id)

    requirements = query.order_by(models.ExpeditionRequirement.id.desc()).all()
    cargo_rows = {item["id"]: item for item in _requirement_cargo_rows(db, expedition_id)}
    results = []
    for requirement in requirements:
        cargo = cargo_rows[requirement.id]
        results.append({
            "id": requirement.id,
            "expedition_id": requirement.expedition_id,
            "requested_by_id": requirement.requested_by_id,
            "supply_name": requirement.supply_name,
            "category": requirement.category,
            "quantity": requirement.quantity,
            "unit": requirement.unit,
            "status": requirement.status,
            "created_at": requirement.created_at.isoformat(),
            "weight_per_unit": cargo["weight_per_unit"],
            "volume_per_unit": cargo["volume_per_unit"],
            "priority": cargo["priority"],
            "priority_value": cargo["priority_value"],
            "available_quantity": cargo["available_quantity"],
            "max_selectable_quantity": cargo["quantity"]
        })
    return results

# --- Inventory CRUD ---
@app.post("/inventory")
def create_inventory_item(
    req: CreateInventoryItemRequest,
    request: Request,
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    # Check for duplicate supply name in the same station inventory
    existing = db.query(models.InventoryItem).filter(
        models.InventoryItem.name.ilike(req.name.strip()),
        models.InventoryItem.location_station == req.location_station
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Supply '{req.name}' already exists in {req.location_station} station inventory. Please update the existing stock level instead."
        )
    if req.quantity < 0 or req.min_required < 0:
        raise HTTPException(status_code=400, detail="Opening stock and minimum quantity cannot be negative")

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    item = models.InventoryItem(
        name=req.name.strip(),
        category=req.category,
        quantity=req.quantity,
        opening_quantity=req.quantity,
        status=inventory_status(0, req.min_required),
        unit=req.unit,
        min_required=req.min_required,
        daily_use_per_person=req.daily_use_per_person,
        location_station=req.location_station,
        cold_factor_sensitivity=req.cold_factor_sensitivity or 1.0,
        last_client_timestamp=client_ts
    )
    db.add(item)
    db.flush()
    _record_inventory_movement(
        db,
        item,
        "ADJUSTED",
        0,
        current_user,
        reference_type="OPENING_STOCK",
        notes="Opening stock balance",
    )
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
        "opening_quantity": item.opening_quantity,
        "status": item.status,
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
        "opening_quantity": item.opening_quantity,
        "status": item.status,
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
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    if item.location_station != current_user.station_name:
        raise HTTPException(status_code=403, detail="Inventory item is outside your assigned station")
    if req.quantity is not None and req.quantity < 0:
        raise HTTPException(status_code=400, detail="Inventory quantity cannot be negative")
    if req.min_required is not None and req.min_required < 0:
        raise HTTPException(status_code=400, detail="Minimum stock threshold cannot be negative")
    if req.location_station is not None and req.location_station != current_user.station_name:
        raise HTTPException(status_code=403, detail="Inventory item cannot be moved outside your assigned station")

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
    if req.quantity is not None:
        adjustment = float(req.quantity) - float(item.quantity)
        if adjustment:
            _record_inventory_movement(
                db,
                item,
                "ADJUSTED",
                adjustment,
                current_user,
                reference_type="INVENTORY_ADJUSTMENT",
                reference_id=item.id,
                notes="Base Admin stock adjustment",
            )
    else:
        item.status = inventory_status(item.quantity, item.min_required)
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
        "opening_quantity": item.opening_quantity,
        "status": item.status,
        "unit": item.unit,
        "min_required": item.min_required,
        "daily_use_per_person": item.daily_use_per_person,
        "location_station": item.location_station
    }
    save_idempotency(request, 200, res, db)
    return res

@app.post("/inventory/{item_id}/consume")
def consume_inventory_item(
    item_id: int,
    req: ConsumeInventoryRequest,
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db),
):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Consumption quantity must be greater than zero")
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if item.location_station != current_user.station_name:
        raise HTTPException(status_code=403, detail="Inventory item is outside your assigned station")
    movement = _record_inventory_movement(
        db,
        item,
        "CONSUMED",
        -float(req.quantity),
        current_user,
        reference_type="CONSUMPTION",
        reference_id=item.id,
        notes=req.notes,
    )
    db.commit()
    db.refresh(item)
    return {
        "item_id": item.id,
        "quantity": item.quantity,
        "status": item.status,
        "movement_id": movement.id,
    }

@app.get("/inventory")
def get_inventory(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.InventoryItem).order_by(models.InventoryItem.id.asc()).all()

@app.get("/inventory/{item_id}/movements")
def get_inventory_movements(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if current_user.role not in {"Base Admin", "Logistics Officer", "Expedition Leader", "Team Member"}:
        raise HTTPException(status_code=403, detail="Role cannot view inventory movement history")
    if item.location_station != current_user.station_name:
        raise HTTPException(status_code=403, detail="Inventory item is outside your assigned station")
    movements = db.query(models.InventoryMovement).filter(
        models.InventoryMovement.inventory_item_id == item_id
    ).order_by(models.InventoryMovement.id.desc()).all()
    return [{
        "id": movement.id,
        "inventory_item_id": movement.inventory_item_id,
        "movement_type": movement.movement_type,
        "quantity_delta": movement.quantity_delta,
        "quantity_after": movement.quantity_after,
        "station_name": movement.station_name,
        "reference_type": movement.reference_type,
        "reference_id": movement.reference_id,
        "notes": movement.notes,
        "performed_by_user_id": movement.performed_by_user_id,
        "created_at": movement.created_at.isoformat() if movement.created_at else None,
    } for movement in movements]

# --- Cargo CRUD ---
@app.post("/cargo")
def create_cargo(
    req: CreateCargoRequest,
    request: Request,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    if not req.shipment_code.strip() or not req.title.strip():
        raise HTTPException(status_code=400, detail="Shipment code and title are required")
    if db.query(models.CargoShipment).filter(models.CargoShipment.shipment_code == req.shipment_code.strip()).first():
        raise HTTPException(status_code=409, detail="Shipment code already exists")
    if not req.items:
        raise HTTPException(status_code=400, detail="Shipment requires catalog-backed supply items")

    expedition = None
    if req.expedition_id is not None:
        expedition = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
        if not expedition:
            raise HTTPException(status_code=404, detail="Expedition not found")
        if expedition.station_name != current_user.station_name:
            raise HTTPException(status_code=403, detail="Shipment expedition is outside your assigned station")
    station_name = req.station_name or (expedition.station_name if expedition else current_user.station_name)
    if station_name != current_user.station_name:
        raise HTTPException(status_code=403, detail="Shipment station is outside your assigned station")

    items = []
    total_weight = 0.0
    total_volume = 0.0
    for request_item in req.items:
        quantity = int(request_item.quantity)
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Shipment item quantities must be greater than zero")
        metadata = _supply_metadata_for(request_item.supply_name)
        items.append({
            "supply_name": request_item.supply_name,
            "quantity": quantity,
            "weight_per_unit": metadata["weight_per_unit"],
            "volume_per_unit": metadata["volume_per_unit"],
            "priority": metadata["priority"],
            "priority_value": metadata["priority_value"],
        })
        total_weight += quantity * metadata["weight_per_unit"]
        total_volume += quantity * metadata["volume_per_unit"]

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    cargo = models.CargoShipment(
        shipment_code=req.shipment_code.strip(),
        title=req.title.strip(),
        weight_kg=round(total_weight, 2),
        volume_m3=round(total_volume, 3),
        priority=max((item["priority"] for item in items), key=lambda value: PRIORITY_WEIGHTS[value]),
        status="Pending",
        expedition_id=req.expedition_id,
        station_name=station_name,
        direction="Inbound",
        items_json=items,
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
        "status": cargo.status,
        "station_name": cargo.station_name,
        "direction": cargo.direction,
        "items": cargo.items_json,
    }
    save_idempotency(request, 200, res, db)
    return res

@app.patch("/cargo/{cargo_id}/status")
@app.put("/cargo/{cargo_id}")
def update_cargo_status(
    cargo_id: int,
    req: UpdateCargoStatusRequest,
    request: Request,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)
    cargo = db.query(models.CargoShipment).filter(models.CargoShipment.id == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo shipment not found")
    if cargo.station_name != current_user.station_name:
        raise HTTPException(status_code=403, detail="Shipment is outside your assigned station")

    old_status = cargo.status
    if (old_status, req.status) not in {("Pending", "In-Transit"), ("In-Transit", "Delivered")}:
        raise HTTPException(status_code=409, detail=f"Invalid shipment transition from {old_status} to {req.status}")
    if req.status == "Delivered" and cargo.direction == "Inbound":
        if not cargo.items_json:
            raise HTTPException(status_code=400, detail="Cannot receive a shipment without catalog item quantities")
        for item in cargo.items_json:
            _apply_catalog_stock_movement(
                db,
                item["supply_name"],
                cargo.station_name,
                float(item["quantity"]),
                "RECEIVED",
                current_user,
                reference_type="CARGO_SHIPMENT",
                reference_id=cargo.id,
                notes=f"Received shipment {cargo.shipment_code}",
            )
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
        "direction": cargo.direction,
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
        "status": cargo.status,
        "station_name": cargo.station_name,
        "direction": cargo.direction,
        "items": cargo.items_json,
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/cargo")
def get_cargo(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.CargoShipment)
    if current_user.role in {"Logistics Officer", "Base Admin", "Expedition Leader"}:
        query = query.filter(models.CargoShipment.station_name == current_user.station_name)
    elif current_user.role == "Team Member":
        assigned_expedition_ids = [
            expedition.id
            for expedition in db.query(models.Expedition).all()
            if current_user.id in (expedition.assigned_members or [])
            or current_user.username in (expedition.assigned_members or [])
        ]
        finalized_manifests = db.query(models.CargoManifest).filter(
            models.CargoManifest.expedition_id.in_(assigned_expedition_ids or [-1]),
            models.CargoManifest.status.in_(["Approved", "Packed", "Shipped"]),
        ).all()
        finalized_codes = [
            manifest.shipment_code for manifest in finalized_manifests
            if _manifest_has_valid_contents(manifest)
        ]
        query = query.filter(models.CargoShipment.shipment_code.in_(finalized_codes or [""]))
    else:
        raise HTTPException(status_code=403, detail="Role cannot view cargo shipments")
    shipments = query.order_by(models.CargoShipment.id.desc()).all()
    return [shipment for shipment in shipments if _cargo_shipment_has_valid_items(shipment)]

# --- Vehicles CRUD ---
@app.post("/vehicles")
def create_vehicle(
    req: CreateVehicleRequest,
    request: Request,
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    client_ts, received_at = extract_timestamps(request, req.client_timestamp)

    if req.status not in (None, "Available", "In Use", "Maintenance", "Unavailable"):
        raise HTTPException(status_code=400, detail="Invalid vehicle status")

    v = models.Vehicle(
        name=req.name,
        type=req.type,
        latitude=req.latitude,
        longitude=req.longitude,
        weather_limit=req.weather_limit,
        station_name=req.station_name,
        status=req.status or "Available",
        is_active=True,
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
        "station_name": v.station_name,
        "assigned_expedition_id": v.assigned_expedition_id,
        "requested_expedition_id": v.requested_expedition_id,
        "request_status": v.request_status,
        "is_active": v.is_active,
    }
    save_idempotency(request, 200, res, db)
    return res

@app.get("/vehicles")
def get_vehicles(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.Vehicle)
    if current_user.role == "Team Member":
        assigned_expedition_ids = [
            expedition.id for expedition in db.query(models.Expedition).all()
            if any(
                member_id == current_user.id
                or (isinstance(member_id, str) and member_id.lower() == current_user.username.lower())
                for member_id in (expedition.assigned_members or [])
            )
        ]
        if not assigned_expedition_ids:
            return []
        query = query.filter(
            models.Vehicle.assigned_expedition_id.in_(assigned_expedition_ids),
            models.Vehicle.is_active.is_(True),
        )
    elif current_user.role in ("Base Admin", "Logistics Officer", "Expedition Leader"):
        query = query.filter(models.Vehicle.station_name == (current_user.station_name or "Maitri"))
        if current_user.role != "Base Admin":
            query = query.filter(models.Vehicle.is_active.is_(True))
        if current_user.role == "Expedition Leader":
            query = query.filter(
                (models.Vehicle.status == "Available")
                | (models.Vehicle.requested_by_id == current_user.id)
                | (models.Vehicle.assigned_expedition_id.is_not(None))
            )
    else:
        raise HTTPException(status_code=403, detail="Forbidden: fleet is not available to this role")

    return [
        {
            "id": vehicle.id,
            "name": vehicle.name,
            "type": vehicle.type,
            "latitude": vehicle.latitude,
            "longitude": vehicle.longitude,
            "status": vehicle.status,
            "weather_limit": vehicle.weather_limit,
            "station_name": vehicle.station_name,
            "assigned_expedition_id": vehicle.assigned_expedition_id,
            "assigned_expedition_name": (
                db.query(models.Expedition.name).filter(models.Expedition.id == vehicle.assigned_expedition_id).scalar()
                if vehicle.assigned_expedition_id is not None else None
            ),
            "requested_expedition_id": vehicle.requested_expedition_id,
            "requested_expedition_name": (
                db.query(models.Expedition.name).filter(models.Expedition.id == vehicle.requested_expedition_id).scalar()
                if vehicle.requested_expedition_id is not None else None
            ),
            "request_status": vehicle.request_status,
            "is_active": vehicle.is_active,
        }
        for vehicle in query.order_by(models.Vehicle.id.desc()).all()
    ]


@app.patch("/vehicles/{vehicle_id}")
def update_vehicle(
    vehicle_id: int,
    req: UpdateVehicleRequest,
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not vehicle.is_active:
        raise HTTPException(status_code=409, detail="Deactivated vehicles cannot be edited")
    if req.status is not None and req.status not in ("Available", "In Use", "Maintenance", "Unavailable"):
        raise HTTPException(status_code=400, detail="Invalid vehicle status")

    for field_name in ("name", "type", "latitude", "longitude", "weather_limit", "station_name", "status"):
        value = getattr(req, field_name)
        if value is not None:
            setattr(vehicle, field_name, value)
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vehicle)
    return {"id": vehicle.id, "status": vehicle.status, "is_active": vehicle.is_active}


@app.patch("/vehicles/{vehicle_id}/status")
def update_vehicle_status(
    vehicle_id: int,
    req: VehicleStatusRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("Base Admin", "Logistics Officer"):
        raise HTTPException(status_code=403, detail="Only Base Admin or Logistics Officer can update fleet status")
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        raise HTTPException(status_code=404, detail="Active vehicle not found")
    if vehicle.station_name != (current_user.station_name or "Maitri"):
        raise HTTPException(status_code=403, detail="Vehicle is outside your station")
    if req.status not in ("Available", "In Use", "Maintenance", "Unavailable"):
        raise HTTPException(status_code=400, detail="Status must be Available, In Use, Maintenance, or Unavailable")

    vehicle.status = req.status
    vehicle.updated_at = datetime.now(timezone.utc)
    if req.status == "Available":
        vehicle.assigned_expedition_id = None
    db.commit()
    db.refresh(vehicle)
    return {"id": vehicle.id, "status": vehicle.status}


@app.post("/vehicles/{vehicle_id}/request")
def request_vehicle_for_expedition(
    vehicle_id: int,
    req: VehicleExpeditionRequest,
    current_user: models.User = Depends(require_leader),
    db: Session = Depends(get_db),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        raise HTTPException(status_code=404, detail="Active vehicle not found")
    expedition = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
    if not expedition or expedition.station_name != (current_user.station_name or "Maitri"):
        raise HTTPException(status_code=404, detail="Expedition not found at your station")
    if vehicle.station_name != expedition.station_name:
        raise HTTPException(status_code=400, detail="Vehicle and expedition must be at the same station")
    if vehicle.status != "Available" or vehicle.request_status == "Requested":
        raise HTTPException(status_code=409, detail="Vehicle is not available for a new request")

    vehicle.requested_expedition_id = expedition.id
    vehicle.requested_by_id = current_user.id
    vehicle.request_status = "Requested"
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": vehicle.id, "request_status": vehicle.request_status, "requested_expedition_id": expedition.id}


@app.post("/vehicles/{vehicle_id}/assign")
def assign_vehicle_to_expedition(
    vehicle_id: int,
    req: VehicleExpeditionRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("Base Admin", "Logistics Officer"):
        raise HTTPException(status_code=403, detail="Only Base Admin or Logistics Officer can assign vehicles")
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        raise HTTPException(status_code=404, detail="Active vehicle not found")
    if vehicle.station_name != (current_user.station_name or "Maitri"):
        raise HTTPException(status_code=403, detail="Vehicle is outside your station")
    expedition = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
    if not expedition or expedition.station_name != vehicle.station_name:
        raise HTTPException(status_code=404, detail="Expedition not found at this station")
    if vehicle.status not in ("Available", "In Use"):
        raise HTTPException(status_code=409, detail=f"Vehicle cannot be assigned while {vehicle.status}")

    vehicle.assigned_expedition_id = expedition.id
    vehicle.status = "In Use"
    if vehicle.requested_expedition_id == expedition.id:
        vehicle.request_status = "Approved"
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": vehicle.id, "status": vehicle.status, "assigned_expedition_id": expedition.id}


@app.patch("/vehicles/{vehicle_id}/deactivate")
def deactivate_vehicle(
    vehicle_id: int,
    current_user: models.User = Depends(require_base_admin),
    db: Session = Depends(get_db),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    vehicle.is_active = False
    vehicle.status = "Unavailable"
    if vehicle.request_status == "Requested":
        vehicle.request_status = "Closed"
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": vehicle.id, "is_active": vehicle.is_active, "status": vehicle.status}


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

    default_deadline = (datetime.now(timezone.utc) + timedelta(days=90)).strftime("%Y-%m-%d")
    default_milestones = [
        {"name": "Equipment Maintenance & Testing", "duration_days": 15},
        {"name": "Medical Clearances & Training", "duration_days": 10},
        {"name": "Cargo Packing & Weight Verification", "duration_days": 14},
        {"name": "Vessel Loading & Departure", "duration_days": 7},
        {"name": "Southern Ocean Transit", "duration_days": 20},
        {"name": "Ice Shelf Offloading & Base Setup", "duration_days": 10}
    ]
    calc = calculate_backward_schedule(default_deadline, default_milestones)

    return {
        "expedition_id": exp.id if exp else None,
        "expedition_name": exp.name if exp else "Maitri Season Expedition",
        "station_name": exp.station_name if exp else "Maitri",
        "schedule": calc
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
    try:
        start_date = datetime.strptime(req.start_date, "%Y-%m-%d").date() if req.start_date else None
        end_date = datetime.strptime(req.departure_deadline, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Start and end dates must use YYYY-MM-DD format")
    if start_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date")
    schedule_res = calculate_backward_schedule(req.departure_deadline, milestone_dicts)

    exp = None
    if req.expedition_id is not None:
        exp = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
        if not exp:
            raise HTTPException(status_code=404, detail="Selected expedition not found")
    else:
        exp = db.query(models.Expedition).first()

    is_duplicate = False
    if exp and exp.id:
        if (
            exp.departure_deadline == schedule_res["departure_deadline"]
            and exp.milestones_json == milestone_dicts
            and (not req.expedition_name or exp.name == req.expedition_name)
            and (not req.station_name or exp.station_name == req.station_name)
            and (not start_date or exp.start_date == start_date)
        ):
            is_duplicate = True

    if is_duplicate:
        res_body = {
            "expedition_id": exp.id,
            "expedition_name": exp.name,
            "station_name": exp.station_name,
            "schedule": schedule_res
        }
        save_idempotency(request, 200, res_body, db)
        return res_body

    if not exp:
        try:
            deadline_date = datetime.strptime(schedule_res["departure_deadline"], "%Y-%m-%d").date()
        except Exception:
            deadline_date = datetime.now(timezone.utc).date() + timedelta(days=45)

        exp = models.Expedition(
            name=req.expedition_name or "Bharati 2026 Season Expedition",
            station_name=req.station_name or "Bharati",
            leader_user_id=current_user.id if current_user.role == "Expedition Leader" else None,
            start_date=start_date or deadline_date - timedelta(days=60),
            end_date=deadline_date,
            status="Planning",
            target_team_size=25
        )
        db.add(exp)
        db.flush()

    exp.name = req.expedition_name or exp.name
    exp.station_name = req.station_name or exp.station_name
    station_coordinates = STATION_COORDINATES.get(exp.station_name)
    if station_coordinates:
        exp.latitude = station_coordinates["latitude"]
        exp.longitude = station_coordinates["longitude"]
    exp.departure_deadline = schedule_res["departure_deadline"]
    exp.milestones_json = milestone_dicts
    exp.schedule_output = schedule_res
    if start_date:
        exp.start_date = start_date
    exp.end_date = end_date
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

# --- Shared, persisted SOS workflow ---
SOS_ASSISTANCE_TYPES = {
    "doctor": "Medical",
    "medical": "Medical",
    "mechanic": "Vehicle Mechanic",
    "vehicle mechanic": "Vehicle Mechanic",
    "pilot": "SAR Helicopter Pilot",
    "sar helicopter pilot": "SAR Helicopter Pilot",
}
SOS_STATUSES = ("ACTIVE", "ACKNOWLEDGED", "RESPONDING", "RESOLVED")
SOS_VEHICLE_ASSISTANCE = {"Vehicle Mechanic", "SAR Helicopter Pilot"}


def _sos_assigned_expeditions(db: Session, user: models.User):
    station_expeditions = db.query(models.Expedition).filter(
        models.Expedition.station_name == (user.station_name or "Maitri")
    ).order_by(models.Expedition.id.desc()).all()
    return [
        expedition for expedition in station_expeditions
        if user.id in (expedition.assigned_members or [])
    ]


def _sos_can_view_or_manage(db: Session, current_user: models.User, sos: models.EmergencySOS) -> bool:
    if sos.user_id == current_user.id:
        return True

    if current_user.role == "Expedition Leader":
        if sos.station_name != (current_user.station_name or "Maitri") or sos.expedition_id is None:
            return False
        expedition = db.query(models.Expedition).filter(
            models.Expedition.id == sos.expedition_id
        ).first()
        return bool(
            expedition
            and expedition.station_name == sos.station_name
            and sos.user_id in (expedition.assigned_members or [])
        )

    if current_user.role == "Base Admin":
        return sos.station_name == (current_user.station_name or "Maitri")

    if current_user.role == "Logistics Officer":
        return (
            sos.station_name == (current_user.station_name or "Maitri")
            and sos.assistance_required in SOS_VEHICLE_ASSISTANCE
        )

    return sos.user_id == current_user.id


def _serialize_sos(db: Session, sos: models.EmergencySOS):
    sender = db.query(models.User).filter(models.User.id == sos.user_id).first()
    expedition = (
        db.query(models.Expedition).filter(models.Expedition.id == sos.expedition_id).first()
        if sos.expedition_id is not None else None
    )
    return {
        "id": sos.id,
        "user_id": sos.user_id,
        "person_name": sender.username if sender else "Unknown user",
        "person_role": sender.role if sender else "Unknown role",
        "expedition_id": sos.expedition_id,
        "expedition_name": expedition.name if expedition else None,
        "station_name": sos.station_name,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "assistance_required": sos.assistance_required,
        "description": sos.description,
        "status": sos.status,
        "created_at": AuditLog.format_timestamp(sos.created_at),
        "updated_at": AuditLog.format_timestamp(sos.updated_at),
    }


@app.get("/sos/context")
def get_sos_context(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    assigned_expeditions = _sos_assigned_expeditions(db, current_user)
    expedition = next(
        (item for item in assigned_expeditions if item.status == "Active"),
        None
    )
    if expedition is None:
        expedition = db.query(models.Expedition).filter(
            models.Expedition.station_name == (current_user.station_name or "Maitri"),
            models.Expedition.status == "Active"
        ).order_by(models.Expedition.id.desc()).first()

    return {
        "user_id": current_user.id,
        "person_name": current_user.username,
        "role": current_user.role,
        "station_name": current_user.station_name or "Maitri",
        "latitude": current_user.latitude,
        "longitude": current_user.longitude,
        "expedition_id": expedition.id if expedition else None,
        "expedition_name": expedition.name if expedition else None,
        "expedition_latitude": expedition.latitude if expedition else None,
        "expedition_longitude": expedition.longitude if expedition else None,
    }


@app.post("/sos")
def create_sos(
    req: SOSRequest,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    assistance_required = SOS_ASSISTANCE_TYPES.get(req.skill_needed.strip().lower())
    if not assistance_required:
        raise HTTPException(status_code=400, detail="Select Medical, Vehicle Mechanic, or SAR Helicopter Pilot")
    if (req.latitude is None) != (req.longitude is None):
        raise HTTPException(status_code=400, detail="Both GPS coordinates must be provided together")

    assigned_expeditions = _sos_assigned_expeditions(db, current_user)
    expedition = next((item for item in assigned_expeditions if item.status == "Active"), None)
    if expedition is None:
        expedition = db.query(models.Expedition).filter(
            models.Expedition.station_name == (current_user.station_name or "Maitri"),
            models.Expedition.status == "Active"
        ).order_by(models.Expedition.id.desc()).first()

    latitude = req.latitude if req.latitude is not None else current_user.latitude
    longitude = req.longitude if req.longitude is not None else current_user.longitude
    if latitude is None or longitude is None:
        latitude = expedition.latitude if expedition else None
        longitude = expedition.longitude if expedition else None
    if latitude is None or longitude is None:
        raise HTTPException(status_code=422, detail="Current GPS location is unavailable")

    now_dt = datetime.now(timezone.utc)
    current_user.latitude = latitude
    current_user.longitude = longitude
    current_user.last_location_update = now_dt
    linked_person = db.query(models.Person).filter(models.Person.user_id == current_user.id).first()
    if linked_person:
        linked_person.latitude = latitude
        linked_person.longitude = longitude
        linked_person.last_location_update = now_dt

    emergency = models.EmergencySOS(
        user_id=current_user.id,
        expedition_id=expedition.id if expedition else None,
        station_name=current_user.station_name or (expedition.station_name if expedition else "Maitri"),
        latitude=latitude,
        longitude=longitude,
        assistance_required=assistance_required,
        description=(req.description or "").strip() or None,
        status="ACTIVE",
        created_at=now_dt,
        updated_at=now_dt,
    )
    db.add(emergency)
    db.commit()
    db.refresh(emergency)

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    payload = {
        "sos_id": emergency.id,
        "user_id": current_user.id,
        "expedition_id": emergency.expedition_id,
        "station_name": emergency.station_name,
        "assistance_required": emergency.assistance_required,
        "latitude": emergency.latitude,
        "longitude": emergency.longitude,
        "description": emergency.description,
    }
    entry_hash = AuditLog.compute_hash(
        "SOS_CREATED", current_user.username, f"SOS-{emergency.id}", payload, now_dt, prev_hash
    )
    db.add(AuditLog(
        action="SOS_CREATED",
        performed_by=current_user.username,
        target_resource=f"SOS-{emergency.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=entry_hash,
    ))
    db.commit()

    result = _serialize_sos(db, emergency)
    save_idempotency(request, 200, result, db)
    return result


@app.get("/sos")
def get_sos_records(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ("Team Member", "Expedition Leader", "Base Admin", "Logistics Officer"):
        raise HTTPException(status_code=403, detail="Forbidden: SOS records are not available to this role")

    records = db.query(models.EmergencySOS).order_by(models.EmergencySOS.created_at.desc()).all()
    return [
        _serialize_sos(db, emergency)
        for emergency in records
        if _sos_can_view_or_manage(db, current_user, emergency)
    ]


@app.patch("/sos/{sos_id}/status")
def update_sos_status(
    sos_id: int,
    req: SOSStatusRequest,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cached = check_idempotency(request, db)
    if cached:
        return cached

    emergency = db.query(models.EmergencySOS).filter(models.EmergencySOS.id == sos_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail="SOS record not found")
    if current_user.role not in ("Expedition Leader", "Base Admin", "Logistics Officer"):
        raise HTTPException(status_code=403, detail="Forbidden: only station responders can update SOS status")
    if not _sos_can_view_or_manage(db, current_user, emergency):
        raise HTTPException(status_code=403, detail="Forbidden: this SOS is outside your response scope")

    next_status = req.status.strip().upper()
    if next_status not in SOS_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(SOS_STATUSES)}")
    current_index = SOS_STATUSES.index(emergency.status)
    next_index = SOS_STATUSES.index(next_status)
    if next_index != current_index + 1:
        raise HTTPException(status_code=409, detail=f"SOS status can only advance from {emergency.status} to the next stage")

    previous_status = emergency.status
    emergency.status = next_status
    emergency.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(emergency)

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    payload = {
        "sos_id": emergency.id,
        "previous_status": previous_status,
        "status": emergency.status,
    }
    entry_hash = AuditLog.compute_hash(
        "SOS_STATUS_UPDATED", current_user.username, f"SOS-{emergency.id}",
        payload, emergency.updated_at, prev_hash
    )
    db.add(AuditLog(
        action="SOS_STATUS_UPDATED",
        performed_by=current_user.username,
        target_resource=f"SOS-{emergency.id}",
        payload=AuditLog.serialize_payload(payload),
        timestamp=emergency.updated_at,
        prev_hash=prev_hash,
        hash=entry_hash,
    ))
    db.commit()

    result = _serialize_sos(db, emergency)
    save_idempotency(request, 200, result, db)
    return result


# --- Strict DB-Computed Dashboard Summary Route ---
@app.get("/dashboard/summary")
async def get_dashboard_summary(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Determine User's Relevant Active Expedition & Station
    user_station = current_user.station_name or "Maitri"

    # Find active expedition (user's assigned expedition if team member/assigned, or station active expedition)
    active_exp = db.query(models.Expedition).filter(models.Expedition.status == "Active").order_by(models.Expedition.id.desc()).first()

    # If team member is assigned to a specific active expedition, prefer that
    user_assigned_exp = None
    all_active_exps = db.query(models.Expedition).filter(models.Expedition.status == "Active").all()
    for exp in all_active_exps:
        if exp.assigned_members and current_user.id in exp.assigned_members:
            user_assigned_exp = exp
            break

    effective_exp = user_assigned_exp or active_exp

    survival_days = None
    weather_data = None
    exp_temp = None
    is_weather_estimated = False
    expedition_info = None

    if effective_exp:
        station_name = effective_exp.station_name
        team_size = effective_exp.target_team_size or 6

        exp_lat = getattr(effective_exp, 'latitude', None)
        exp_lon = getattr(effective_exp, 'longitude', None)

        # Fetch Real Live Weather from Open-Meteo using real stored coordinates
        if exp_lat is not None and exp_lon is not None:
            weather_data = await fetch_real_weather(
                latitude=exp_lat,
                longitude=exp_lon,
                station_name=station_name
            )

        if weather_data and "temperature" in weather_data and weather_data["temperature"] is not None:
            exp_temp = weather_data["temperature"]
            is_weather_estimated = False
        else:
            exp_temp = -30.0  # Fallback temperature for survival calculation
            is_weather_estimated = True

        # Survival Days computed at station weather temperature using cold_factor
        station_items = db.query(models.InventoryItem).filter(
            models.InventoryItem.location_station == station_name,
            models.InventoryItem.category.in_(["Fuel", "Ration", "Food & Water", "Fuel & Energy"])
        ).all()

        days_list = []
        for item in station_items:
            cf = calculate_cold_factor(exp_temp, item.cold_factor_sensitivity)
            daily_burn = team_size * item.daily_use_per_person * cf
            if daily_burn > 0:
                days_list.append(item.quantity / daily_burn)

        if days_list:
            survival_days = round(min(days_list), 1)

        # Calculate days remaining until end_date
        days_remaining = None
        if effective_exp.end_date:
            today_d = datetime.now(timezone.utc).date()
            diff_d = (effective_exp.end_date - today_d).days
            days_remaining = max(0, diff_d)

        # Fetch assigned members details
        assigned_user_ids = effective_exp.assigned_members or []
        assigned_members_list = []
        if assigned_user_ids:
            assigned_users = db.query(models.User).filter(models.User.id.in_(assigned_user_ids)).all()
            cutoff_10m = datetime.utcnow() - timedelta(minutes=10)  # naive UTC to match SQLite stored datetimes
            for u in assigned_users:
                is_active_now = u.last_location_update and u.last_location_update >= cutoff_10m
                assigned_members_list.append({
                    "id": u.id,
                    "username": u.username,
                    "role": u.role,
                    "status": "Online / Active" if is_active_now else "Offline / Standby",
                    "last_seen": u.last_location_update.isoformat() if u.last_location_update else None
                })

        expedition_info = {
            "id": effective_exp.id,
            "name": effective_exp.name,
            "station_name": effective_exp.station_name,
            "latitude": effective_exp.latitude,
            "longitude": effective_exp.longitude,
            "start_date": effective_exp.start_date.isoformat() if effective_exp.start_date else None,
            "end_date": effective_exp.end_date.isoformat() if effective_exp.end_date else None,
            "days_remaining": days_remaining,
            "target_team_size": effective_exp.target_team_size,
            "assigned_members_count": len(assigned_user_ids),
            "assigned_members": assigned_members_list,
            "status": effective_exp.status
        }
    else:
        # Fallback station weather if no active expedition exists
        weather_data = await fetch_real_weather(latitude=-70.7660, longitude=11.7330, station_name=user_station)

    # 2. Team Roster & Personnel on Field (All Users registered in backend)
    cutoff_10m = datetime.utcnow() - timedelta(minutes=10)  # naive UTC to match SQLite stored datetimes
    all_users = db.query(models.User).order_by(models.User.id.desc()).all()
    team_roster = []
    personnel_active_count = 0

    for u in all_users:
        is_active = u.last_location_update and u.last_location_update >= cutoff_10m
        if is_active:
            personnel_active_count += 1
        team_roster.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "station_name": u.station_name or "Maitri",
            "status": "Online / Active" if is_active else "Offline / Standby",
            "last_location_update": u.last_location_update.isoformat() if u.last_location_update else None
        })

    # 3. Cargo Shipments Summary
    cargo_query = db.query(models.CargoShipment)
    if current_user.role == "Team Member":
        assigned_expedition_ids = [
            expedition.id
            for expedition in db.query(models.Expedition).all()
            if current_user.id in (expedition.assigned_members or [])
            or current_user.username in (expedition.assigned_members or [])
        ]
        finalized_manifests = db.query(models.CargoManifest).filter(
            models.CargoManifest.expedition_id.in_(assigned_expedition_ids or [-1]),
            models.CargoManifest.status.in_(["Approved", "Packed", "Shipped"]),
        ).all()
        finalized_codes = [
            manifest.shipment_code for manifest in finalized_manifests
            if _manifest_has_valid_contents(manifest)
        ]
        cargo_query = cargo_query.filter(models.CargoShipment.shipment_code.in_(finalized_codes or [""]))
    else:
        cargo_query = cargo_query.filter(models.CargoShipment.station_name == user_station)
    all_cargo = [
        shipment for shipment in cargo_query.order_by(models.CargoShipment.id.desc()).all()
        if _cargo_shipment_has_valid_items(shipment)
    ]
    cargo_in_transit_count = sum(1 for c in all_cargo if c.status == "In-Transit")
    cargo_delivered_count = sum(1 for c in all_cargo if c.status == "Delivered")
    cargo_pending_count = sum(1 for c in all_cargo if c.status == "Pending")
    cargo_summary_list = [
        {
            "id": c.id,
            "shipment_code": c.shipment_code,
            "title": c.title,
            "weight_kg": c.weight_kg,
            "volume_m3": c.volume_m3,
            "priority": c.priority,
            "status": c.status
        }
        for c in all_cargo[:5]
    ]

    # 4. Inventory Stock & Low Stock Items
    all_inventory = db.query(models.InventoryItem).filter(
        models.InventoryItem.location_station == user_station
    ).order_by(models.InventoryItem.id.asc()).all()
    low_stock_items = [
        {
            "id": i.id,
            "name": i.name,
            "category": i.category,
            "quantity": i.quantity,
            "opening_quantity": i.opening_quantity,
            "unit": i.unit,
            "min_required": i.min_required,
            "location_station": i.location_station,
            "status": i.status,
        }
        for i in all_inventory if i.status != "IN STOCK"
    ]

    # 5. Active SOS & Emergency Alerts
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
    active_sos_alerts = [a for a in latest_alerts if a["alert_type"] == "SOS" or a["severity"] in ("CRITICAL", "High", "HIGH")]

    # 6. Overall Aggregated Counts
    active_expeditions_count = db.query(models.Expedition).filter(models.Expedition.status == "Active").count()

    return {
        "user_role": current_user.role,
        "user_station": user_station,
        "survival_days": survival_days,
        "temperature_used": exp_temp if not is_weather_estimated else None,
        "is_weather_estimated": is_weather_estimated,
        "expedition": expedition_info,
        "active_expedition_name": effective_exp.name if effective_exp else None,
        "active_station": effective_exp.station_name if effective_exp else user_station,
        "team_size": effective_exp.target_team_size if effective_exp else len(all_users),
        "active_expeditions": active_expeditions_count,
        "cargo_in_transit": cargo_in_transit_count,
        "cargo_delivered": cargo_delivered_count,
        "cargo_pending": cargo_pending_count,
        "cargo_summary": cargo_summary_list,
        "personnel_on_field": personnel_active_count,
        "team_roster": team_roster[:6],
        "low_stock_items": low_stock_items,
        "low_stock_count": len(low_stock_items),
        "inventory_total_items": len(all_inventory),
        "latest_alerts": latest_alerts,
        "active_sos_alerts": active_sos_alerts,
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


def _supply_metadata_for(name: str) -> dict:
    catalog_item = next((item for item in STANDARD_SUPPLY_CATALOG if item.get("name") == name), None)
    if not catalog_item:
        raise HTTPException(status_code=400, detail=f"Supply '{name}' is missing from the standard catalog")
    if not all(key in catalog_item for key in ("weight_kg_per_unit", "volume_m3_per_unit", "priority", "priority_value")):
        raise HTTPException(status_code=500, detail=f"Supply '{name}' is missing cargo metadata in the catalog")

    return {
        "supply_name": name,
        "category": catalog_item["category"],
        "unit": catalog_item["unit"],
        "weight_per_unit": float(catalog_item["weight_kg_per_unit"]),
        "volume_per_unit": float(catalog_item["volume_m3_per_unit"]),
        "priority": catalog_item["priority"],
        "priority_value": int(catalog_item["priority_value"]),
        "inventory_name": catalog_item.get("inventory_name", name),
        "inventory_unit": catalog_item.get("inventory_unit", catalog_item["unit"]),
        "inventory_units_per_cargo_unit": float(catalog_item.get("inventory_units_per_cargo_unit", 1)),
        "daily_use_per_person": float(catalog_item.get("default_daily_use", 1.0)),
        "cold_factor_sensitivity": float(catalog_item.get("cold_sensitivity", 1.0)),
    }


def _cargo_shipment_has_valid_items(shipment: models.CargoShipment) -> bool:
    if not shipment.items_json:
        return False
    total_weight = 0.0
    total_volume = 0.0
    try:
        for item in shipment.items_json:
            quantity = int(item["quantity"])
            metadata = _supply_metadata_for(item["supply_name"])
            if quantity <= 0:
                return False
            total_weight += quantity * metadata["weight_per_unit"]
            total_volume += quantity * metadata["volume_per_unit"]
    except (KeyError, TypeError, ValueError, HTTPException):
        return False
    return (
        math.isclose(total_weight, shipment.weight_kg, rel_tol=0.01, abs_tol=0.02)
        and math.isclose(total_volume, shipment.volume_m3, rel_tol=0.01, abs_tol=0.02)
    )


def _apply_catalog_stock_movement(
    db: Session,
    supply_name: str,
    station_name: str,
    cargo_quantity: float,
    movement_type: str,
    current_user: models.User,
    reference_type: str,
    reference_id: int,
    notes: Optional[str] = None,
) -> models.InventoryMovement:
    metadata = _supply_metadata_for(supply_name)
    item = db.query(models.InventoryItem).filter(
        models.InventoryItem.name.ilike(metadata["inventory_name"]),
        models.InventoryItem.location_station == station_name,
    ).first()
    if item is None:
        if cargo_quantity < 0:
            raise HTTPException(status_code=400, detail=f"No station stock recorded for {supply_name}")
        item = models.InventoryItem(
            name=metadata["inventory_name"],
            category=metadata["category"],
            quantity=0,
            opening_quantity=0,
            status="OUT OF STOCK",
            unit=metadata["inventory_unit"],
            min_required=0,
            daily_use_per_person=metadata["daily_use_per_person"],
            location_station=station_name,
            cold_factor_sensitivity=metadata["cold_factor_sensitivity"],
        )
        db.add(item)
        db.flush()
    elif item.unit != metadata["inventory_unit"]:
        raise HTTPException(status_code=409, detail=f"Station stock unit for {supply_name} does not match its catalog unit")

    stock_delta = float(cargo_quantity) * metadata["inventory_units_per_cargo_unit"]
    return _record_inventory_movement(
        db,
        item,
        movement_type,
        stock_delta,
        current_user,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
    )


def _requirement_cargo_rows(db: Session, expedition_id: Optional[int] = None):
    query = db.query(models.ExpeditionRequirement)
    if expedition_id is not None:
        query = query.filter(models.ExpeditionRequirement.expedition_id == expedition_id)
    rows = query.order_by(models.ExpeditionRequirement.id.asc()).all()

    expedition_cache = {}
    cargo_items = []
    for row in rows:
        meta = _supply_metadata_for(row.supply_name)
        expedition = expedition_cache.get(row.expedition_id)
        if expedition is None:
            expedition = db.query(models.Expedition).filter(models.Expedition.id == row.expedition_id).first()
            expedition_cache[row.expedition_id] = expedition
        stock = None
        if expedition:
            stock = db.query(models.InventoryItem).filter(
                models.InventoryItem.name.ilike(meta["inventory_name"]),
                models.InventoryItem.location_station == expedition.station_name,
            ).first()
        available_quantity = (
            max(0, int(float(stock.quantity) / meta["inventory_units_per_cargo_unit"]))
            if stock else 0
        )
        selected_quantity = min(max(0, int(row.quantity)), available_quantity)
        cargo_items.append({
            "id": row.id,
            "expedition_id": row.expedition_id,
            "supply_name": row.supply_name,
            "quantity": selected_quantity,
            "required_quantity": max(0, int(row.quantity)),
            "available_quantity": available_quantity,
            "unit": row.unit,
            "weight_per_unit": meta["weight_per_unit"],
            "volume_per_unit": meta["volume_per_unit"],
            "priority": meta["priority"],
            "priority_value": meta["priority_value"],
            "category": meta["category"],
        })
    return cargo_items


class OptimizeCargoRequest(BaseModel):
    expedition_id: Optional[int] = None
    capacity_weight_kg: float
    capacity_volume_m3: float


@app.post("/cargo/optimize")
def optimize_cargo_loading(
    req: OptimizeCargoRequest,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db)
):
    cargo_items = _requirement_cargo_rows(db, req.expedition_id)
    if not cargo_items and req.expedition_id is None:
        cargo_items = db.query(models.CargoShipment).filter(
            models.CargoShipment.status.in_(["Pending", "Packed"])
        ).all()
        cargo_items = [{
            "id": item.id,
            "expedition_id": item.expedition_id,
            "supply_name": item.title,
            "quantity": 1,
            "unit": "Units",
            "weight_per_unit": float(item.weight_kg),
            "volume_per_unit": float(item.volume_m3),
            "priority": item.priority,
            "priority_value": PRIORITY_WEIGHTS.get(item.priority, 1),
            "category": "Cargo",
        } for item in cargo_items]

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
            "total_priority_value": 0,
            "selected_item_count": 0,
            "remaining_weight_kg": float(req.capacity_weight_kg),
            "remaining_volume_m3": float(req.capacity_volume_m3),
        }

    model = cp_model.CpModel()
    SCALE = 100
    weight_cap = int(round(req.capacity_weight_kg * SCALE))
    vol_cap = int(round(req.capacity_volume_m3 * SCALE))

    x = {}
    for i, item in enumerate(cargo_items):
        x[i] = model.NewIntVar(0, int(item["quantity"]), f"x_{i}")

    model.Add(sum(int(round(item["weight_per_unit"] * SCALE)) * x[i] for i, item in enumerate(cargo_items)) <= weight_cap)
    model.Add(sum(int(round(item["volume_per_unit"] * SCALE)) * x[i] for i, item in enumerate(cargo_items)) <= vol_cap)
    model.Maximize(sum(item["priority_value"] * x[i] for i, item in enumerate(cargo_items)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    sol_status = solver.Solve(model)

    packed_items = []
    left_behind_items = []
    total_weight = 0.0
    total_volume = 0.0
    total_priority = 0
    selected_item_count = 0

    for i, item in enumerate(cargo_items):
        selected_qty = int(solver.Value(x[i])) if sol_status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0
        item_dict = {
            "id": item["id"],
            "expedition_id": item["expedition_id"],
            "supply_name": item["supply_name"],
            "quantity": item["quantity"],
            "selected_quantity": selected_qty,
            "unit": item["unit"],
            "weight_per_unit": item["weight_per_unit"],
            "volume_per_unit": item["volume_per_unit"],
            "priority": item["priority"],
            "priority_value": item["priority_value"],
            "category": item["category"],
            "total_weight_kg": round(selected_qty * item["weight_per_unit"], 2),
            "total_volume_m3": round(selected_qty * item["volume_per_unit"], 2),
        }
        if selected_qty > 0:
            packed_items.append(item_dict)
            total_weight += selected_qty * item["weight_per_unit"]
            total_volume += selected_qty * item["volume_per_unit"]
            total_priority += selected_qty * item["priority_value"]
            selected_item_count += selected_qty
        else:
            left_behind_items.append(item_dict)

    weight_util = round((total_weight / req.capacity_weight_kg * 100.0), 1) if req.capacity_weight_kg > 0 else 0.0
    vol_util = round((total_volume / req.capacity_volume_m3 * 100.0), 1) if req.capacity_volume_m3 > 0 else 0.0

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.hash if last_log else ("0" * 64)
    now_dt = datetime.now(timezone.utc)
    payload_dict = {
        "expedition_id": req.expedition_id,
        "capacity_weight_kg": req.capacity_weight_kg,
        "capacity_volume_m3": req.capacity_volume_m3,
        "packed_count": len(packed_items),
        "left_behind_count": len(left_behind_items),
        "selected_item_count": selected_item_count,
        "total_priority_value": total_priority,
    }
    new_hash = AuditLog.compute_hash("CARGO_OPTIMIZED", current_user.username, "CARGO_OPTIMIZER", payload_dict, now_dt, prev_hash)
    audit_entry = AuditLog(
        action="CARGO_OPTIMIZED",
        performed_by=current_user.username,
        target_resource="CARGO_OPTIMIZER",
        payload=AuditLog.serialize_payload(payload_dict),
        timestamp=now_dt,
        prev_hash=prev_hash,
        hash=new_hash,
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
        "total_priority_value": total_priority,
        "selected_item_count": selected_item_count,
        "remaining_weight_kg": round(max(0.0, req.capacity_weight_kg - total_weight), 2),
        "remaining_volume_m3": round(max(0.0, req.capacity_volume_m3 - total_volume), 2),
    }


def _validated_manifest_contents(db: Session, req: CreateCargoManifestRequest) -> dict:
    if req.vehicle_capacity_weight_kg <= 0 or req.vehicle_capacity_volume_m3 <= 0:
        raise HTTPException(status_code=400, detail="Vehicle weight and volume capacities must be greater than zero")

    requested_rows = _requirement_cargo_rows(db, req.expedition_id)
    available_by_name = {}
    required_by_name = {}
    for item in requested_rows:
        available_by_name[item["supply_name"]] = item["available_quantity"]
        required_by_name[item["supply_name"]] = required_by_name.get(item["supply_name"], 0) + item["required_quantity"]

    raw_items = [item.model_dump() if hasattr(item, "model_dump") else item.dict() for item in req.items]
    if not raw_items:
        raise HTTPException(status_code=400, detail="Manifest requires at least one cargo item")

    selected_by_name = {}
    items = []
    for item in raw_items:
        name = item["supply_name"]
        quantity = item.get("selected_quantity")
        if quantity is None:
            quantity = item["quantity"]
        quantity = int(quantity)
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Manifest item quantities must be greater than zero")
        metadata = _supply_metadata_for(name)
        if name not in required_by_name:
            raise HTTPException(status_code=400, detail=f"{name} is not required by this expedition")
        selected_by_name[name] = selected_by_name.get(name, 0) + quantity
        items.append({
            "supply_name": name,
            "quantity": quantity,
            "weight_per_unit": metadata["weight_per_unit"],
            "volume_per_unit": metadata["volume_per_unit"],
            "priority": metadata["priority"],
            "priority_value": metadata["priority_value"],
        })

    for name, quantity in selected_by_name.items():
        max_quantity = min(required_by_name[name], available_by_name[name])
        if quantity > max_quantity:
            raise HTTPException(status_code=400, detail=f"Selected quantity for {name} exceeds required or available stock")

    total_weight = round(sum(item["quantity"] * item["weight_per_unit"] for item in items), 2)
    total_volume = round(sum(item["quantity"] * item["volume_per_unit"] for item in items), 2)
    selected_item_count = sum(item["quantity"] for item in items)
    total_priority_value = sum(item["priority_value"] * item["quantity"] for item in items)
    if total_weight > req.vehicle_capacity_weight_kg or total_volume > req.vehicle_capacity_volume_m3:
        raise HTTPException(status_code=400, detail="Selected cargo exceeds vehicle weight or volume capacity")

    return {
        "items": items,
        "total_weight": total_weight,
        "total_volume": total_volume,
        "selected_item_count": selected_item_count,
        "total_priority_value": total_priority_value,
    }


@app.post("/cargo-manifests")
def create_cargo_manifest(
    req: CreateCargoManifestRequest,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db),
):
    expedition = db.query(models.Expedition).filter(models.Expedition.id == req.expedition_id).first()
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    if expedition.station_name != current_user.station_name:
        raise HTTPException(status_code=403, detail="Manifest expedition is outside your assigned station")
    if not req.title.strip() or not req.shipment_code.strip():
        raise HTTPException(status_code=400, detail="Manifest title and shipment code are required")
    if db.query(models.CargoManifest).filter(models.CargoManifest.shipment_code == req.shipment_code).first():
        raise HTTPException(status_code=409, detail="Shipment code already exists; generate a new code")
    if db.query(models.CargoShipment).filter(models.CargoShipment.shipment_code == req.shipment_code).first():
        raise HTTPException(status_code=409, detail="Shipment code already exists; generate a new code")

    contents = _validated_manifest_contents(db, req)

    manifest = models.CargoManifest(
        expedition_id=req.expedition_id,
        shipment_code=req.shipment_code.strip(),
        title=req.title.strip(),
        status="Draft",
        vehicle_capacity_weight_kg=req.vehicle_capacity_weight_kg,
        vehicle_capacity_volume_m3=req.vehicle_capacity_volume_m3,
        total_weight_kg=contents["total_weight"],
        total_volume_m3=contents["total_volume"],
        selected_item_count=contents["selected_item_count"],
        total_priority_value=contents["total_priority_value"],
        items_json=contents["items"],
        created_by_user_id=current_user.id,
    )
    db.add(manifest)
    db.commit()
    db.refresh(manifest)

    return {
        "id": manifest.id,
        "expedition_id": manifest.expedition_id,
        "shipment_code": manifest.shipment_code,
        "title": manifest.title,
        "status": manifest.status,
        "vehicle_capacity_weight_kg": manifest.vehicle_capacity_weight_kg,
        "vehicle_capacity_volume_m3": manifest.vehicle_capacity_volume_m3,
        "total_weight_kg": manifest.total_weight_kg,
        "total_volume_m3": manifest.total_volume_m3,
        "selected_item_count": manifest.selected_item_count,
        "total_priority_value": manifest.total_priority_value,
        "items": manifest.items_json,
        "submitted_at": manifest.submitted_at.isoformat() if manifest.submitted_at else None,
        "reviewed_by_user_id": manifest.reviewed_by_user_id,
        "reviewed_at": manifest.reviewed_at.isoformat() if manifest.reviewed_at else None,
        "rejection_reason": manifest.rejection_reason,
        "created_by": current_user.username,
        "created_at": manifest.created_at.isoformat(),
    }


@app.put("/cargo-manifests/{manifest_id}")
def update_cargo_manifest(
    manifest_id: int,
    req: CreateCargoManifestRequest,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db),
):
    manifest = db.query(models.CargoManifest).filter(models.CargoManifest.id == manifest_id).first()
    if not manifest:
        raise HTTPException(status_code=404, detail="Cargo manifest not found")
    if manifest.status not in {"Draft", "Rejected"}:
        raise HTTPException(status_code=409, detail="Only Draft or Rejected manifests can be edited")
    expedition = db.query(models.Expedition).filter(models.Expedition.id == manifest.expedition_id).first()
    if not expedition or expedition.station_name != current_user.station_name:
        raise HTTPException(status_code=403, detail="Manifest expedition is outside your assigned station")
    if req.expedition_id != manifest.expedition_id or req.shipment_code != manifest.shipment_code:
        raise HTTPException(status_code=400, detail="An existing manifest's expedition and shipment code cannot be changed")

    contents = _validated_manifest_contents(db, req)
    manifest.title = req.title.strip()
    manifest.vehicle_capacity_weight_kg = req.vehicle_capacity_weight_kg
    manifest.vehicle_capacity_volume_m3 = req.vehicle_capacity_volume_m3
    manifest.total_weight_kg = contents["total_weight"]
    manifest.total_volume_m3 = contents["total_volume"]
    manifest.selected_item_count = contents["selected_item_count"]
    manifest.total_priority_value = contents["total_priority_value"]
    manifest.items_json = contents["items"]
    manifest.status = "Draft"
    manifest.submitted_at = None
    manifest.reviewed_by_user_id = None
    manifest.reviewed_at = None
    manifest.rejection_reason = None
    db.commit()
    db.refresh(manifest)
    return {
        "id": manifest.id,
        "expedition_id": manifest.expedition_id,
        "shipment_code": manifest.shipment_code,
        "title": manifest.title,
        "status": manifest.status,
        "total_weight_kg": manifest.total_weight_kg,
        "total_volume_m3": manifest.total_volume_m3,
        "selected_item_count": manifest.selected_item_count,
        "total_priority_value": manifest.total_priority_value,
        "items": manifest.items_json,
    }


def _manifest_has_valid_contents(manifest: models.CargoManifest) -> bool:
    if not manifest.shipment_code or not manifest.shipment_code.strip():
        return False
    if not manifest.items_json or manifest.selected_item_count <= 0:
        return False

    try:
        total_weight = 0.0
        total_volume = 0.0
        item_count = 0
        for item in manifest.items_json:
            quantity = int(item["quantity"])
            weight = float(item["weight_per_unit"])
            volume = float(item["volume_per_unit"])
            priority_value = int(item["priority_value"])
            if quantity <= 0 or weight <= 0 or volume <= 0 or priority_value <= 0:
                return False
            total_weight += quantity * weight
            total_volume += quantity * volume
            item_count += quantity
    except (KeyError, TypeError, ValueError):
        return False

    return (
        item_count == manifest.selected_item_count
        and math.isclose(total_weight, manifest.total_weight_kg, rel_tol=0.01, abs_tol=0.02)
        and math.isclose(total_volume, manifest.total_volume_m3, rel_tol=0.01, abs_tol=0.02)
    )


@app.get("/cargo-manifests")
def get_cargo_manifests(
    expedition_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.CargoManifest)
    if current_user.role in ("Logistics Officer", "Base Admin", "Expedition Leader"):
        query = query.join(
            models.Expedition,
            models.Expedition.id == models.CargoManifest.expedition_id,
        ).filter(models.Expedition.station_name == current_user.station_name)
        if current_user.role == "Expedition Leader":
            query = query.filter(
                (models.Expedition.leader_user_id == current_user.id)
                | models.Expedition.leader_user_id.is_(None)
            )
    elif current_user.role == "Team Member":
        assigned_expedition_ids = [
            expedition.id
            for expedition in db.query(models.Expedition).all()
            if current_user.id in (expedition.assigned_members or [])
            or current_user.username in (expedition.assigned_members or [])
        ]
        query = query.filter(
            models.CargoManifest.expedition_id.in_(assigned_expedition_ids or [-1]),
            models.CargoManifest.status.in_(["Approved", "Packed", "Shipped"]),
        )
    else:
        raise HTTPException(status_code=403, detail="Role cannot view cargo manifests")
    if expedition_id is not None:
        query = query.filter(models.CargoManifest.expedition_id == expedition_id)
    manifests = []
    seen_shipment_codes = set()
    for manifest in query.order_by(models.CargoManifest.id.desc()).all():
        if manifest.shipment_code in seen_shipment_codes or not _manifest_has_valid_contents(manifest):
            continue
        seen_shipment_codes.add(manifest.shipment_code)
        manifests.append({
        "id": manifest.id,
        "expedition_id": manifest.expedition_id,
        "shipment_code": manifest.shipment_code,
        "title": manifest.title,
        "status": manifest.status,
        "vehicle_capacity_weight_kg": manifest.vehicle_capacity_weight_kg,
        "vehicle_capacity_volume_m3": manifest.vehicle_capacity_volume_m3,
        "total_weight_kg": manifest.total_weight_kg,
        "total_volume_m3": manifest.total_volume_m3,
        "selected_item_count": manifest.selected_item_count,
        "total_priority_value": manifest.total_priority_value,
        "items": manifest.items_json,
        "created_by_user_id": manifest.created_by_user_id,
        "submitted_at": manifest.submitted_at.isoformat() if manifest.submitted_at else None,
        "reviewed_by_user_id": manifest.reviewed_by_user_id,
        "reviewed_at": manifest.reviewed_at.isoformat() if manifest.reviewed_at else None,
        "rejection_reason": manifest.rejection_reason,
        "created_at": manifest.created_at.isoformat(),
        })
    return manifests


@app.patch("/cargo-manifests/{manifest_id}/status")
def update_cargo_manifest_status(
    manifest_id: int,
    payload: CargoManifestStatusRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    manifest = db.query(models.CargoManifest).filter(models.CargoManifest.id == manifest_id).first()
    if not manifest:
        raise HTTPException(status_code=404, detail="Cargo manifest not found")

    expedition = db.query(models.Expedition).filter(models.Expedition.id == manifest.expedition_id).first()
    if not expedition:
        raise HTTPException(status_code=404, detail="Manifest expedition not found")

    previous_status = manifest.status
    new_status = payload.status.strip()
    now = datetime.now(timezone.utc)

    if current_user.role == "Logistics Officer":
        if expedition.station_name != current_user.station_name:
            raise HTTPException(status_code=403, detail="Manifest expedition is outside your assigned station")
        if new_status == "Submitted" and previous_status in {"Draft", "Rejected"}:
            manifest.status = "Submitted"
            manifest.submitted_at = now
            manifest.reviewed_by_user_id = None
            manifest.reviewed_at = None
            manifest.rejection_reason = None
        elif new_status == "Packed" and previous_status == "Approved":
            for item in manifest.items_json or []:
                _apply_catalog_stock_movement(
                    db,
                    item["supply_name"],
                    expedition.station_name,
                    -float(item["quantity"]),
                    "ISSUED",
                    current_user,
                    reference_type="CARGO_MANIFEST",
                    reference_id=manifest.id,
                    notes=f"Issued from manifest {manifest.shipment_code}",
                )
            manifest.status = "Packed"
        elif new_status == "Shipped" and previous_status == "Packed":
            manifest.status = "Shipped"
        else:
            raise HTTPException(status_code=409, detail=f"Logistics cannot change manifest from {previous_status} to {new_status}")
    elif current_user.role == "Expedition Leader":
        if new_status not in {"Approved", "Rejected"}:
            raise HTTPException(status_code=403, detail="Expedition Leaders can only approve or reject submitted manifests")
        if expedition.station_name != current_user.station_name:
            raise HTTPException(status_code=403, detail="Manifest is outside your assigned station")
        if expedition.leader_user_id is not None and expedition.leader_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Manifest belongs to another Expedition Leader's expedition")
        if previous_status != "Submitted":
            raise HTTPException(status_code=409, detail="Only submitted manifests can be reviewed")
        if manifest.created_by_user_id == current_user.id:
            raise HTTPException(status_code=403, detail="You cannot approve or reject your own manifest")
        if new_status == "Rejected" and not (payload.rejection_reason or "").strip():
            raise HTTPException(status_code=400, detail="A rejection reason is required")
        manifest.status = new_status
        manifest.reviewed_by_user_id = current_user.id
        manifest.reviewed_at = now
        manifest.rejection_reason = (payload.rejection_reason or "").strip() if new_status == "Rejected" else None
    else:
        raise HTTPException(status_code=403, detail="This role cannot change cargo manifest status")

    if manifest.status in {"Packed", "Shipped"}:
        cargo_row = db.query(models.CargoShipment).filter(
            models.CargoShipment.shipment_code == manifest.shipment_code
        ).first()
        shipment_status = "Packed" if manifest.status == "Packed" else "In-Transit"
        if cargo_row is None:
            cargo_row = models.CargoShipment(
                shipment_code=manifest.shipment_code,
                title=manifest.title,
                weight_kg=manifest.total_weight_kg,
                volume_m3=manifest.total_volume_m3,
                priority="High" if manifest.total_priority_value >= 100 else "Medium",
                status=shipment_status,
                expedition_id=manifest.expedition_id,
                station_name=expedition.station_name,
                direction="Outbound",
                items_json=manifest.items_json,
            )
            db.add(cargo_row)
        else:
            cargo_row.title = manifest.title
            cargo_row.weight_kg = manifest.total_weight_kg
            cargo_row.volume_m3 = manifest.total_volume_m3
            cargo_row.status = shipment_status
            cargo_row.station_name = expedition.station_name
            cargo_row.direction = "Outbound"
            cargo_row.items_json = manifest.items_json

    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = last_log.hash if last_log else ("0" * 64)
    audit_payload = {
        "manifest_id": manifest.id,
        "expedition_id": manifest.expedition_id,
        "shipment_code": manifest.shipment_code,
        "from_status": previous_status,
        "to_status": manifest.status,
        "rejection_reason": manifest.rejection_reason,
    }
    audit_hash = AuditLog.compute_hash(
        "CARGO_MANIFEST_STATUS_CHANGED",
        current_user.username,
        f"CARGO-MANIFEST-{manifest.id}",
        audit_payload,
        now,
        previous_hash,
    )
    db.add(AuditLog(
        action="CARGO_MANIFEST_STATUS_CHANGED",
        performed_by=current_user.username,
        target_resource=f"CARGO-MANIFEST-{manifest.id}",
        payload=AuditLog.serialize_payload(audit_payload),
        timestamp=now,
        prev_hash=previous_hash,
        hash=audit_hash,
    ))
    db.commit()
    return {
        "id": manifest.id,
        "status": manifest.status,
        "reviewed_by_user_id": manifest.reviewed_by_user_id,
        "reviewed_at": manifest.reviewed_at.isoformat() if manifest.reviewed_at else None,
        "rejection_reason": manifest.rejection_reason,
    }


@app.delete("/cargo-manifests/{manifest_id}")
def delete_cargo_manifest(
    manifest_id: int,
    current_user: models.User = Depends(require_logistics_officer),
    db: Session = Depends(get_db),
):
    manifest = db.query(models.CargoManifest).filter(models.CargoManifest.id == manifest_id).first()
    if not manifest:
        raise HTTPException(status_code=404, detail="Cargo manifest not found")

    expedition = db.query(models.Expedition).filter(models.Expedition.id == manifest.expedition_id).first()
    if not expedition or expedition.station_name != current_user.station_name:
        raise HTTPException(status_code=403, detail="Manifest is outside your assigned station")

    if manifest.status not in {"Draft", "Cancelled"}:
        raise HTTPException(status_code=400, detail="Only draft or cancelled cargo manifests can be deleted")

    db.delete(manifest)
    db.commit()
    return {"deleted": True, "manifest_id": manifest_id}

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
