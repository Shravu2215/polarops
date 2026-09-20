# PolarOps — Antarctic Expedition Digital Twin & SOS Dispatcher (SIH26062)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React Native](https://img.shields.io/badge/Mobile-React%20Native%20%2F%20Expo-61DAFB.svg)](https://expo.dev/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB.svg)](https://www.python.org/)

PolarOps is an extreme-environment operational engine and emergency dispatch Digital Twin designed for Indian Antarctic Research Stations (**Maitri** & **Bharati**).

---

## 🎬 Demonstration & Presentation

- 📺 **Demo Video Link**: [Watch PolarOps SIH26062 Video Presentation](https://youtube.com/your-demo-video-link-here)
- 📐 **Architecture & System Design**: See [`docs/architecture.md`](docs/architecture.md)
- 📊 **SIH Presentation Guide**: See [`docs/sih26062_presentation.md`](docs/sih26062_presentation.md)

---

## 🚀 Key Technical Features

1. **Zero Mock Data Architecture**:
   - Every metric (Survival Days, Personnel on Field, Cargo Manifests, live Open-Meteo Antarctic Weather) is dynamically computed from live DB state & real APIs.

2. **Autonomous Emergency SOS Dispatch**:
   - Computes Haversine distance to dispatch nearest available responder with required skill (`doctor`, `mechanic`, `pilot`, `engineer`) and vehicle (`Sno-Cat`, `Helicopter`).
   - Enforces strict **10-minute location freshness filter** (`last_location_update >= now - 10m`) to prevent dispatching stale personnel.

3. **Live Antarctic Station Weather Integration**:
   - Real-time sub-zero weather metrics (temperature, wind chill, blizzard warnings) directly fetched from Open-Meteo API for Maitri (`-70.766, 11.733`) and Bharati (`-69.407, 76.191`).

4. **Cryptographic SHA-256 Audit Chain**:
   - Every critical operation (user registration, inventory entry, SOS dispatch) generates a SHA-256 hash linked to previous audit entry. Verified via `GET /audit/verify`.

5. **Role Security Model**:
   - Self-registration is hardcoded to `Team Member`. Only Expedition Leaders can provision administrative accounts (`POST /users`) or change user roles (`PATCH /users/{id}/role`).

6. **Offline-First Resilience**:
   - Mobile client caches station summary with `AsyncStorage` and displays a non-intrusive offline state banner during network dropouts (`"Offline, showing last data"`).

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, PyJWT / Passlib (bcrypt), Uvicorn
- **Mobile**: React Native, Expo Go (SDK 57), TypeScript, `AsyncStorage`, `SecureStore`
- **Database**: SQLite (Development) / PostgreSQL (Production)
- **APIs**: Open-Meteo Live Weather API

---

## ⚡ Quickstart Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and `npm`

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create .env from template
cp .env.example .env

# Initialize clean DB with bootstrap leader
python reset_db.py

# Run FastAPI server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will start at `http://localhost:8000`. API Documentation available at `http://localhost:8000/docs`.

### 3. Mobile App Setup

```bash
# Navigate to mobile
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npx expo start -c
```

Scan the QR code with **Expo Go** on Android/iOS device or press `w` for web.

---

## 🧪 Automated Test Suite

Run the full automated test suite covering security role enforcement, auth checks, secret startup refusal, and end-to-end SOS dispatch:

```bash
cd backend
python -m unittest tests/test_requirements.py
```

---

## 🔒 Security Configuration

- Secrets (`ADMIN_PASSWORD`, `JWT_SECRET`) are read from `.env` (gitignored).
- Refer to `.env.example` for environment variable templates.
