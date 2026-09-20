import httpx
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import District

router = APIRouter(prefix="/api/geo", tags=["Global Geocoding & Location Search"])

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "NEXORA-SIH2026/1.0 (contact@nexora-ner.gov.in)"

@router.get("/search")
def search_locations(
    q: str = Query(..., min_length=1, description="Location query: city, district, address anywhere in India or globally"),
    limit: int = Query(6, ge=1, le=20),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Search any location globally (Guwahati, Imphal, Shillong, Bengaluru, Mangaluru, Delhi, Mumbai, etc.).
    Returns coordinates, display name, and bounding box.
    """
    query_str = q.strip()
    if not query_str:
        return []

    clean_results = []
    # 1. Quick match from local districts table
    try:
        dist_matches = db.query(District).filter(District.name.ilike(f"%{query_str}%")).limit(3).all()
        for dm in dist_matches:
            if dm.latitude and dm.longitude:
                clean_results.append({
                    "display_name": f"{dm.name}, India",
                    "latitude": float(dm.latitude),
                    "longitude": float(dm.longitude),
                    "type": "district",
                    "class": "administrative",
                    "importance": 0.9,
                    "address": {"district": dm.name, "country": "India"}
                })
    except Exception as e:
        print(f"[GEO] Local district match error: {e}")

    # 2. Query Nominatim global
    headers = {"User-Agent": USER_AGENT}
    params = {
        "q": query_str,
        "format": "json",
        "addressdetails": 1,
        "limit": limit
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(NOMINATIM_SEARCH_URL, params=params, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                existing_names = {r["display_name"].lower() for r in clean_results}
                for item in results:
                    disp = item.get("display_name", "")
                    if disp.lower() not in existing_names:
                        existing_names.add(disp.lower())
                        clean_results.append({
                            "display_name": disp,
                            "latitude": float(item.get("lat", 0.0)),
                            "longitude": float(item.get("lon", 0.0)),
                            "type": item.get("type", "location"),
                            "class": item.get("class", "place"),
                            "importance": item.get("importance", 0.0),
                            "address": item.get("address", {})
                        })
                return clean_results[:limit]
            elif resp.status_code == 429:
                if clean_results:
                    return clean_results
                raise HTTPException(status_code=429, detail="Geocoding service rate limit exceeded. Please wait a moment.")
            else:
                return clean_results
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GEO] Search error: {e}")
        return clean_results

@router.get("/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0)
) -> Dict[str, Any]:
    """Reverse geocode coordinates into a human-readable location name."""
    headers = {"User-Agent": USER_AGENT}
    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "zoom": 16
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(NOMINATIM_REVERSE_URL, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "display_name": data.get("display_name", f"{lat:.4f}, {lon:.4f}"),
                    "latitude": lat,
                    "longitude": lon,
                    "address": data.get("address", {})
                }
            else:
                return {
                    "display_name": f"{lat:.4f}, {lon:.4f}",
                    "latitude": lat,
                    "longitude": lon
                }
    except Exception as e:
        print(f"[GEO] Reverse geocode error: {e}")
        return {
            "display_name": f"{lat:.4f}, {lon:.4f}",
            "latitude": lat,
            "longitude": lon
        }
