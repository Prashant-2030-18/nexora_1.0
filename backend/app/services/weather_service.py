import os
import httpx
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from ..models import WeatherRecord, APISyncLog
from ..config import settings

OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5/weather"
OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = "NEXORA-SIH2026/1.0 (contact@nexora-ner.gov.in)"

def _fetch_openweathermap_coords(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetch live weather from OpenWeatherMap by coordinates."""
    if not settings.is_openweather_configured:
        return None
    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.OPENWEATHER_API_KEY,
        "units": "metric"
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(OPENWEATHER_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                main = data.get("main", {})
                wind = data.get("wind", {})
                weather_arr = data.get("weather", [{}])
                vis = data.get("visibility", 10000)
                rain_data = data.get("rain", {})
                rain_1h = rain_data.get("1h", 0.0) if isinstance(rain_data, dict) else 0.0

                return {
                    "temperature_c": round(float(main.get("temp", 0.0)), 1),
                    "humidity_pct": int(main.get("humidity", 0)),
                    "rainfall_mm": round(float(rain_1h), 2),
                    "wind_speed_kmh": round(float(wind.get("speed", 0.0)) * 3.6, 1),
                    "visibility_km": round(float(vis) / 1000.0, 2),
                    "condition_text": (weather_arr[0].get("description", "Normal")).capitalize(),
                    "source_api": "OpenWeatherMap (Official Live)",
                    "available": True
                }
            else:
                print(f"[WEATHER] OpenWeatherMap returned HTTP {resp.status_code}")
    except Exception as e:
        print(f"[WEATHER] OpenWeatherMap request error: {e}")
    return None

def _fetch_openweathermap_city(city_name: str) -> Optional[Dict[str, Any]]:
    """Fetch live weather from OpenWeatherMap by city query."""
    if not settings.is_openweather_configured:
        return None
    query = f"{city_name},IN" if not (",IN" in city_name.upper() or ", INDIA" in city_name.upper()) else city_name
    params = {
        "q": query,
        "appid": settings.OPENWEATHER_API_KEY,
        "units": "metric"
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(OPENWEATHER_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                main = data.get("main", {})
                wind = data.get("wind", {})
                weather_arr = data.get("weather", [{}])
                coord = data.get("coord", {})
                vis = data.get("visibility", 10000)
                rain_data = data.get("rain", {})
                rain_1h = rain_data.get("1h", 0.0) if isinstance(rain_data, dict) else 0.0

                return {
                    "temperature_c": round(float(main.get("temp", 0.0)), 1),
                    "humidity_pct": int(main.get("humidity", 0)),
                    "rainfall_mm": round(float(rain_1h), 2),
                    "wind_speed_kmh": round(float(wind.get("speed", 0.0)) * 3.6, 1),
                    "visibility_km": round(float(vis) / 1000.0, 2),
                    "condition_text": (weather_arr[0].get("description", "Normal")).capitalize(),
                    "latitude": coord.get("lat"),
                    "longitude": coord.get("lon"),
                    "location_name": data.get("name", city_name),
                    "source_api": "OpenWeatherMap (Official Live)",
                    "available": True
                }
    except Exception as e:
        print(f"[WEATHER] OpenWeatherMap city query error: {e}")
    return None

def _fetch_open_meteo(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Reliable fallback: Open-Meteo current forecast."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,visibility,weather_code",
        "timezone": "Asia/Kolkata",
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(OPEN_METEO_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                curr = data.get("current", {})
                code = curr.get("weather_code", 0)
                condition = "Clear sky"
                if code in [1, 2, 3]:
                    condition = "Mainly clear / partly cloudy"
                elif code in [45, 48]:
                    condition = "Fog"
                elif code in [51, 53, 55]:
                    condition = "Drizzle"
                elif code in [61, 63, 65]:
                    condition = "Rain"
                elif code in [80, 81, 82]:
                    condition = "Rain showers"
                elif code in [95, 96, 99]:
                    condition = "Thunderstorm"

                vis_m = curr.get("visibility", 10000.0)
                vis_km = (vis_m / 1000.0) if vis_m is not None else 10.0

                return {
                    "temperature_c": curr.get("temperature_2m"),
                    "humidity_pct": curr.get("relative_humidity_2m"),
                    "rainfall_mm": curr.get("precipitation", 0.0),
                    "wind_speed_kmh": curr.get("wind_speed_10m"),
                    "visibility_km": round(vis_km, 2),
                    "condition_text": condition,
                    "source_api": "Open-Meteo (Real-Time Fallback)",
                    "available": True
                }
    except Exception as e:
        print(f"[WEATHER] Open-Meteo error: {e}")
    return None

def evaluate_logistics_impact(data: Dict[str, Any]) -> str:
    """Classify weather severity for NER freight transit."""
    rain = data.get("rainfall_mm", 0.0) or 0.0
    wind = data.get("wind_speed_kmh", 0.0) or 0.0
    vis = data.get("visibility_km", 10.0) or 10.0

    if rain > 50 or wind > 75 or vis < 0.5:
        return "Severe"
    if rain > 20 or wind > 45 or vis < 2.0:
        return "High"
    if rain > 5 or wind > 25 or vis < 5.0:
        return "Moderate"
    return "Low"

def get_weather_for_location(lat: float, lon: float, location_name: str, db: Session) -> Dict[str, Any]:
    """
    Fetch live weather for a coordinate pair:
    1. Check 30-min cache in DB.
    2. Try OpenWeatherMap (using configured OPENWEATHER_API_KEY).
    3. Fall back to Open-Meteo if needed.
    4. If both unavailable, return clear 'available: False' without fake data.
    """
    # Check 30-minute DB cache
    recent = db.query(WeatherRecord).filter(
        WeatherRecord.latitude.between(lat - 0.05, lat + 0.05),
        WeatherRecord.longitude.between(lon - 0.05, lon + 0.05)
    ).order_by(WeatherRecord.fetched_at.desc()).first()

    now = datetime.utcnow()
    if recent and (now - recent.fetched_at).total_seconds() < 1800:
        return {
            "temperature_c": recent.temperature_c,
            "humidity_pct": recent.humidity_pct,
            "rainfall_mm": recent.rainfall_mm,
            "wind_speed_kmh": recent.wind_speed_kmh,
            "visibility_km": recent.visibility_km,
            "condition_text": recent.condition_text,
            "condition": recent.condition_text,
            "source_api": recent.source_api,
            "source": recent.source_api,
            "location_name": recent.location_name or location_name,
            "location": recent.location_name or location_name,
            "logistics_impact": evaluate_logistics_impact({
                "rainfall_mm": recent.rainfall_mm,
                "wind_speed_kmh": recent.wind_speed_kmh,
                "visibility_km": recent.visibility_km,
            }),
            "available": True,
            "cached": True
        }

    # Fetch live: OpenWeatherMap first if key configured, then Open-Meteo
    data = None
    if settings.is_openweather_configured:
        data = _fetch_openweathermap_coords(lat, lon)

    if not data:
        data = _fetch_open_meteo(lat, lon)

    if not data:
        return {
            "temperature_c": None,
            "humidity_pct": None,
            "rainfall_mm": None,
            "wind_speed_kmh": None,
            "visibility_km": None,
            "condition_text": "Live weather service currently unavailable",
            "source_api": "none",
            "location_name": location_name,
            "logistics_impact": "Unknown",
            "available": False,
            "cached": False
        }

    # Cache successful live telemetry
    try:
        rec = WeatherRecord(
            latitude=lat,
            longitude=lon,
            location_name=location_name,
            temperature_c=data.get("temperature_c"),
            rainfall_mm=data.get("rainfall_mm"),
            wind_speed_kmh=data.get("wind_speed_kmh"),
            humidity_pct=data.get("humidity_pct"),
            visibility_km=data.get("visibility_km"),
            condition_text=data.get("condition_text"),
            source_api=data.get("source_api", "Unknown"),
            fetched_at=now
        )
        db.add(rec)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WEATHER] Cache save error: {e}")

    data["location_name"] = location_name
    data["location"] = location_name
    data["condition"] = data.get("condition_text")
    data["source"] = data.get("source_api")
    data["logistics_impact"] = evaluate_logistics_impact(data)
    data["cached"] = False
    return data

def get_weather_for_city(city_name: str, db: Session) -> Dict[str, Any]:
    """Fetch live weather by city name via OpenWeatherMap or geocoding."""
    if settings.is_openweather_configured:
        city_res = _fetch_openweathermap_city(city_name)
        if city_res:
            city_res["logistics_impact"] = evaluate_logistics_impact(city_res)
            return city_res
    # Fallback coordinates for standard NER capital cities if geocoding needed
    NER_CAPITALS = {
        "guwahati": (26.1445, 91.7362, "Guwahati, Assam"),
        "shillong": (25.5788, 91.8933, "Shillong, Meghalaya"),
        "imphal": (24.8170, 93.9368, "Imphal, Manipur"),
        "silchar": (24.8170, 92.7925, "Silchar, Assam"),
        "kohima": (25.6751, 94.1086, "Kohima, Nagaland"),
        "dimapur": (25.9090, 93.7270, "Dimapur, Nagaland"),
        "aizawl": (23.7271, 92.7176, "Aizawl, Mizoram"),
        "agartala": (23.8315, 91.2868, "Agartala, Tripura"),
        "gangtok": (27.3389, 88.6065, "Gangtok, Sikkim"),
        "itanagar": (27.0844, 93.6053, "Itanagar, Arunachal Pradesh"),
    }
    match = NER_CAPITALS.get(city_name.lower().strip())
    if match:
        lat, lon, name = match
        return get_weather_for_location(lat, lon, name, db)

    return {
        "temperature_c": None,
        "humidity_pct": None,
        "rainfall_mm": None,
        "condition_text": f"Weather unavailable for '{city_name}'",
        "location_name": city_name,
        "logistics_impact": "Unknown",
        "available": False
    }
