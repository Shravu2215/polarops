import httpx
from datetime import datetime, timezone
import math
from typing import Optional, Dict, Any

_weather_cache: Dict[str, Any] = {}

def calculate_wind_chill(temp_c: float, wind_speed_kmh: float) -> float:
    if temp_c <= 10.0 and wind_speed_kmh >= 4.8:
        v_pow = math.pow(wind_speed_kmh, 0.16)
        wc = 13.12 + (0.6215 * temp_c) - (11.37 * v_pow) + (0.3965 * temp_c * v_pow)
        return round(wc, 1)
    return round(temp_c, 1)

async def fetch_real_weather(latitude: float, longitude: float, station_name: str) -> Optional[Dict[str, Any]]:
    global _weather_cache
    cache_key = f"{station_name}_{latitude}_{longitude}"
    
    url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m"
    
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json().get("current", {})
                temp = data.get("temperature_2m", 0.0)
                wind_speed = data.get("wind_speed_10m", 0.0)
                humidity = data.get("relative_humidity_2m", 0)

                wind_chill = calculate_wind_chill(temp, wind_speed)

                blizzard_text = None
                if wind_speed >= 50.0:
                    blizzard_text = f"Blizzard Warning: High winds of {wind_speed:.1f} km/h recorded at {station_name}."

                weather_result = {
                    "station": station_name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "temperature": temp,
                    "unit": "°C",
                    "wind_speed_kmh": wind_speed,
                    "wind_chill": wind_chill,
                    "humidity": humidity,
                    "blizzard_warning": blizzard_text,
                    "is_stale": False,
                    "fetched_at": datetime.now(timezone.utc).isoformat()
                }

                _weather_cache[cache_key] = weather_result
                return weather_result
    except Exception as err:
        print(f"Open-Meteo live API fetch error: {err}")

    # Fallback to cache if available
    if cache_key in _weather_cache:
        cached = _weather_cache[cache_key].copy()
        cached["is_stale"] = True
        return cached

    return None
