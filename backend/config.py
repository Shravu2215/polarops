import os

# Load .env file if available
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "leader@polarops.in")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
JWT_SECRET = os.getenv("JWT_SECRET")

# Requirement 4: Refuse to start if ADMIN_PASSWORD or JWT_SECRET are missing
if not ADMIN_PASSWORD or not JWT_SECRET:
    raise RuntimeError(
        "CRITICAL SECURITY ERROR: ADMIN_PASSWORD and JWT_SECRET environment variables must be defined in .env or system environment!"
    )

use_sqlite = os.getenv("USE_SQLITE", "true").lower() == "true"

if use_sqlite:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./polarops.db")
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://polarops:polarops_password@localhost:5432/polarops_db"
    )

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
