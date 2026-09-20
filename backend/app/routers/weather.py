from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from ..database import get_db
from ..services.weather_service import get_weather_for_location
from ..services.route_engine import geocode_location

router = APIRouter(prefix="/api/weather", tags=["Live Weather Telemetry"])

@router.get("")
def get_weather(
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
    location: Optional[str] = Query(None, description="Location name, e.g. Guwahati"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get live weather data. Uses Open-Meteo or OpenWeatherMap with database caching.
    Returns: temperature, rainfall, wind, visibility, humidity, condition, logistics impact.
    """
    loc_name = location or "NER Coordinate"
    target_lat = lat
    target_lon = lon

    if (target_lat is None or target_lon is None) and location:
        geo = geocode_location(location)
        if geo:
            target_lat = geo["lat"]
            target_lon = geo["lon"]
            loc_name = geo["display_name"]
        else:
            raise HTTPException(status_code=404, detail=f"Could not locate '{location}'. Please provide coordinates.")

    if target_lat is None or target_lon is None:
        raise HTTPException(status_code=400, detail="Must provide either (lat, lon) or location name.")

    data = get_weather_for_location(target_lat, target_lon, loc_name, db)
    return data
