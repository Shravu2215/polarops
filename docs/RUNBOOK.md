# PolarOps — Clean Checkout Execution Runbook

This runbook provides complete, step-by-step instructions to run the PolarOps backend server, automated test suite, and mobile client from a fresh checkout.

---

## 1. System Requirements

- **Python**: 3.10, 3.11, or 3.12+
- **Node.js**: v18.0.0 or higher
- **Package Manager**: `npm` (v9+) or `yarn`
- **Operating System**: Windows 10/11, macOS, or Linux

---

## 2. Backend Setup & Startup

Open a terminal at the root of the repository:

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
# source venv/bin/activate

# Install required backend dependencies
pip install -r requirements.txt

# (Optional) Install testing utilities
pip install pytest pytest-asyncio httpx pillow

# Copy environment template if .env does not exist
cp .env.example .env

# Initialize database schema and seed initial station personnel, vehicles, and planner data
python seed.py

# Launch FastAPI development server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend server will start at:
- **API Server**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **ReDoc Schema**: `http://localhost:8000/redoc`

---

## 3. Automated Test Suite Execution

To verify all backend functionality (cargo optimizer, weather forecast, backward planner, security enforcement, audit verification):

```bash
# From backend directory with venv activated
python -m pytest tests
```

Expected output: `9 passed` with 0 failures.

---

## 4. Mobile Client Setup & Launch

Open a second terminal at the root of the repository:

```bash
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Launch Expo development server (clearing cache)
npx expo start -c
```

### Running the Mobile Client:
- **Web Browser**: Press `w` in the terminal to launch in browser (`http://localhost:8081`).
- **Mobile Device**: Scan the printed terminal QR code using **Expo Go** on Android or iOS.
- **Android Emulator**: Press `a` (requires Android Studio emulator).

---

## 5. Testing Credentials & Bootstrap Accounts

When logging into the mobile application or testing REST endpoints:

- **Expedition Leader Account**:
  - **Email / Username**: `leader@polarops.in` or `leader`
  - **Password**: Print/logged to console during database seed, or set via `ADMIN_PASSWORD` environment variable
  - **Role**: Expedition Leader
  - **Station**: Maitri

- **Self-Registered Team Member**:
  - Click **Sign Up** on login screen to create a new team member account.

---

## 6. Key Verification Endpoints

1. **Dashboard Overview**: `GET /dashboard/summary`
2. **Forecast Engine**: `GET /forecast?cold_factor=1.5`
3. **OR-Tools Cargo Optimizer**: `POST /cargo/optimize`
4. **Monte Carlo Risk Simulator**: `POST /simulate`
5. **Team Roster & Freshness**: `GET /people` & `GET /users`
6. **Backward Expedition Planner**: `GET /planner` & `POST /planner/schedule`
7. **Audit Ledger Verification**: `GET /audit` & `GET /audit/verify`
