from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from contextlib import asynccontextmanager

from database import engine, get_db, Base
import models
import config

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown logic if any

app = FastAPI(
    title="PolarOps Backend API",
    description="Digital Twin API for Antarctic Research Expeditions (Maitri & Bharati)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware to allow mobile app connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

    return {
        "status": "ok",
        "service": "PolarOps Backend",
        "database": db_status,
        "mqtt": {
            "broker": config.MQTT_BROKER_HOST,
            "port": config.MQTT_BROKER_PORT
        }
    }
