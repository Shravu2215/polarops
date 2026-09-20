import os

use_sqlite = os.getenv("USE_SQLITE", "false").lower() == "true"

if use_sqlite:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./polarops.db")
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://polarops:polarops_password@localhost:5432/polarops_db"
    )

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
