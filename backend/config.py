import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./polarops.db"
)
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))

