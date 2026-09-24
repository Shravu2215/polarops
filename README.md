# PolarOps — Antarctic Expedition Digital Twin & Operations Platform (SIH26062)

[![License: MIT](https.img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https.img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React Native](https.img.shields.io/badge/Mobile-React%20Native%20%2F%20Expo-61DAFB.svg)](https://expo.dev/)
[![Python](https.img.shields.io/badge/Python-3.11%2B-3776AB.svg)](https://www.python.org/)

PolarOps is an extreme-environment operational digital twin and emergency management system designed for Indian Antarctic Research Stations (Maitri and Bharati).

---

## System Overview & Media

Demo video: to be added

Screenshots: to be added from the running app.

---

## Implemented Architecture & Features

### 1. Real-Time Digital Twin Dashboard
- Dynamic calculations for survival days, reserve depletion rates, and active station weather.
- Direct Open-Meteo Antarctic weather integration for Maitri (-70.766, 11.733) and Bharati (-69.407, 76.191).

### 2. Cold-Factor Consumption Forecast Engine
- Endpoint: `GET /forecast`
- Applies cold-sensitivity adjustments (1.0x to 2.5x) based on sub-zero temperatures and blizzard warnings.
- Computes reserve depletion timelines and projects stockout dates per inventory item category.

### 3. Google OR-Tools BIP Cargo Knapsack Optimizer
- Endpoint: `POST /cargo/optimize`
- Multi-constraint Binary Integer Programming (BIP) solver optimizing weight, volume, and priority values.
- Enforces Critical Priority Dominance (1,000 pt weight boost) to guarantee emergency medical and fuel supplies are prioritized.

### 4. NumPy Monte Carlo What-If Risk Simulator
- Endpoint: `POST /simulate`
- Performs 1,000-iteration Monte Carlo stochastic simulations over configurable time horizons.
- Models cargo loss, delay probability, extreme weather severity, and calculates P10, P50, P90 confidence intervals.

### 5. Personnel Roster & Fleet Tracking
- Endpoints: `GET /people`, `GET /users`, `GET /vehicles`
- Dynamic roster with skill tags (doctor, pilot, mechanic, engineer, radio) and station location indicators.
- 10-Minute Location Freshness verification filter marking active personnel location telemetry as Fresh (<=10m) or Stale (>10m).

### 6. Backward CPM Expedition Timeline Planner
- Endpoints: `GET /planner`, `POST /planner/schedule`
- Computes backward schedule starting from target departure deadlines.
- Calculates latest start dates per milestone, total project buffer days, and flags milestones starting in the past as At Risk.
- Automatically records every plan revision into the cryptographic Audit Log.

### 7. Offline Queue, Idempotency & Priority Sync
- Full offline-first support using `AsyncStorage` local queueing.
- HTTP `Idempotency-Key` headers prevent duplicate backend operations during intermittent connectivity.
- Priority-ordered synchronization queue (Emergency SOS > Inventory/Cargo edits > Routine updates).

### 8. Immutable SHA-256 Hash-Chained Audit Ledger
- Endpoints: `GET /audit`, `GET /audit/verify`
- Cryptographic ledger where each block hash is computed as `SHA256(action + user + payload + prev_hash)`.
- Live tamper detection endpoint (`GET /audit/verify`) validates chain integrity across all historical blocks.

### 9. SOS Emergency Dispatcher
- Endpoint: `POST /sos`
- Uses Haversine spherical distance calculations to locate and dispatch the nearest available responder matching required skills and vehicle capabilities.
- Enforces strict 10-minute location freshness filter to exclude stale positions.

---

## Technology Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, Google OR-Tools, NumPy, PyJWT, Passlib (bcrypt), Uvicorn
- **Mobile**: React Native, Expo (SDK 57), TypeScript, `AsyncStorage`, `SecureStore`
- **Database**: SQLite (Development) / PostgreSQL (Production)
- **Documentation**: Architectural Guides & Runbook in `docs/`

---

## Quickstart & Setup

For full step-by-step setup instructions from a clean checkout, please refer to the [RUNBOOK](docs/RUNBOOK.md).

### Quick Commands

```bash
# 1. Backend Setup
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
python seed.py
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Run Test Suite
python -m pytest tests

# 3. Mobile Setup
cd ../mobile
npm install
npx expo start -c
```

---

## Security & Verification

- Secrets (`ADMIN_PASSWORD`, `JWT_SECRET`) are configured in `.env` (gitignored).
- Reference `.env.example` for required configuration variables.
