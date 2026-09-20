from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from ..models import District, State, Warehouse

# =============================================================================
# NEXORA ACCESSIBILITY INTELLIGENCE INDEX (MDoNER NER Framework)
# Weights are strictly deterministic:
# 1. Road Density: 25%
# 2. Highway Proximity: 15%
# 3. Railway Proximity: 10%
# 4. Airport Proximity: 10%
# 5. Logistics/Warehouse Coverage: 15%
# 6. Terrain / Elevation Challenge: 10%
# 7. Monsoon Rainfall Resilience: 5%
# 8. Area Scale Ratio: 10%
# Total: 100%
# =============================================================================

WEIGHTS = {
    "road_density": 0.25,
    "highway_access": 0.15,
    "railway_access": 0.10,
    "airport_access": 0.10,
    "warehouse_coverage": 0.15,
    "terrain_factor": 0.10,
    "monsoon_resilience": 0.05,
    "area_scale": 0.10,
}

CRITICAL_FIELDS = [
    "road_density_km_per_sq_km",
    "distance_to_nearest_highway_km",
    "distance_to_nearest_railway_km"
]

def _normalize_road_density(density: Optional[float]) -> Optional[float]:
    """Density 0.0 to 2.2 km / sq km normalized to 0-100."""
    if density is None:
        return None
    return min(100.0, max(0.0, (density / 2.0) * 100.0))

def _normalize_distance(dist_km: Optional[float], max_km: float) -> Optional[float]:
    """Inverse distance: closer to infrastructure yields higher score."""
    if dist_km is None:
        return None
    if dist_km <= 0:
        return 100.0
    return max(0.0, 100.0 - ((dist_km / max_km) * 100.0))

def _normalize_warehouses(count: int) -> float:
    """Warehouse count: 0 to 12 normalized to 0-100."""
    return min(100.0, (count / 8.0) * 100.0)

def _normalize_elevation(elev_m: Optional[float]) -> float:
    """Elevation penalty in high Himalayan regions."""
    if elev_m is None:
        return 65.0
    # 0m to 4000m
    return max(10.0, 100.0 - ((elev_m / 3500.0) * 90.0))

def _normalize_rainfall(rain_mm: Optional[float]) -> float:
    """High monsoon rainfall (>2500mm) reduces year-round accessibility."""
    if rain_mm is None:
        return 70.0
    return max(15.0, 100.0 - ((rain_mm / 3500.0) * 85.0))

def _normalize_area(area_sq_km: Optional[float]) -> float:
    """Smaller compact districts are easier to service than massive rugged ones."""
    if area_sq_km is None:
        return 60.0
    return max(20.0, 100.0 - ((area_sq_km / 12000.0) * 80.0))

def _get_priority_label(score: float) -> str:
    if score >= 75.0:
        return "Good"
    elif score >= 55.0:
        return "Moderate"
    elif score >= 35.0:
        return "High Priority"
    else:
        return "Critical Priority"

def compute_district_accessibility(district: District, live_warehouses: int = 0) -> Dict[str, Any]:
    """Compute deterministic accessibility score for a district."""
    # Check for missing critical data
    missing_fields = [f for f in CRITICAL_FIELDS if getattr(district, f, None) is None]
    if missing_fields:
        return {
            "district_id": district.id,
            "district_name": district.name,
            "state_id": district.state_id,
            "score": None,
            "overall_score": 0.0,
            "status": "unavailable",
            "reason": f"Score unavailable: Missing primary GIS telemetry for: {', '.join(missing_fields)}.",
            "priority_level": "Unavailable",
            "bottlenecks": [f"Missing GIS telemetry: {', '.join(missing_fields)}"],
            "key_bottlenecks": [f"Missing GIS telemetry: {', '.join(missing_fields)}"],
            "factor_scores": {},
            "breakdown": {
                "road_connectivity": 0.0,
                "highway_access": 0.0,
                "railway_access": 0.0,
                "airport_access": 0.0,
                "logistics_access": 0.0,
                "travel_time_score": 0.0,
                "weather_resilience": 0.0,
                "emergency_access": 0.0,
                "network_reliability": 0.0,
            },
            "ai_explanation": f"Score unavailable for {district.name}: Missing primary GIS telemetry for {', '.join(missing_fields)}.",
            "recommended_interventions": ["Deploy on-ground GIS infrastructure survey to establish baseline telemetry."],
            "population": district.population,
            "area_sq_km": district.area_sq_km,
            "methodology": "MDoNER NER Accessibility Index (8-Factor Multi-Criteria Matrix)"
        }

    f_road = _normalize_road_density(district.road_density_km_per_sq_km)
    f_highway = _normalize_distance(district.distance_to_nearest_highway_km, max_km=180.0)
    f_railway = _normalize_distance(district.distance_to_nearest_railway_km, max_km=250.0)
    f_airport = _normalize_distance(district.distance_to_nearest_airport_km, max_km=320.0)
    f_warehouse = _normalize_warehouses(live_warehouses or (district.active_warehouse_count or 0))
    f_terrain = _normalize_elevation(district.terrain_elevation_m)
    f_rainfall = _normalize_rainfall(district.historical_monsoon_rainfall_mm)
    f_area = _normalize_area(district.area_sq_km)

    factors = {
        "road_density": f_road,
        "highway_access": f_highway,
        "railway_access": f_railway,
        "airport_access": f_airport,
        "warehouse_coverage": f_warehouse,
        "terrain_factor": f_terrain,
        "monsoon_resilience": f_rainfall,
        "area_scale": f_area
    }

    final_score = sum(factors[k] * WEIGHTS[k] for k in WEIGHTS)
    final_score = round(max(5.0, min(99.0, final_score)), 1)

    bottlenecks = []
    if f_road < 35.0:
        bottlenecks.append(f"Severely deficient road density ({round(district.road_density_km_per_sq_km or 0, 2)} km/km²)")
    if f_highway < 35.0:
        bottlenecks.append(f"Isolated from National Highway network ({round(district.distance_to_nearest_highway_km or 0, 1)} km)")
    if f_railway < 30.0:
        bottlenecks.append(f"No direct railhead access ({round(district.distance_to_nearest_railway_km or 0, 1)} km to nearest station)")
    if f_warehouse < 25.0:
        bottlenecks.append("Acute lack of commercial cold chain and staging warehouse capacity")
    if f_terrain < 35.0:
        bottlenecks.append("Severe high-altitude Himalayan terrain vulnerability")

    breakdown = {
        "road_connectivity": round(f_road, 1),
        "highway_access": round(f_highway, 1),
        "railway_access": round(f_railway, 1),
        "airport_access": round(f_airport, 1),
        "logistics_access": round(f_warehouse, 1),
        "travel_time_score": round(f_terrain, 1),
        "weather_resilience": round(f_rainfall, 1),
        "emergency_access": round(f_area, 1),
        "network_reliability": round(min(100.0, (f_road + f_highway) / 2.0), 1),
    }

    recommended = []
    if f_road < 40.0:
        recommended.append("Prioritize PMGSY all-weather blacktop arterial road paving")
    if f_highway < 40.0:
        recommended.append("Develop 2-lane spur connectivity connecting to nearest National Highway corridor")
    if f_railway < 35.0:
        recommended.append("Establish multi-modal transshipment cargo hub at closest railhead")
    if f_warehouse < 30.0:
        recommended.append("Subsidize district-level cold storage and strategic distribution staging warehouse")
    if f_terrain < 40.0 or f_rainfall < 40.0:
        recommended.append("Deploy landslide early warning sensors and rapid-clearing response teams")
    if not recommended:
        recommended.append("Maintain routine infrastructure maintenance and logistics tracking telemetry")

    priority = _get_priority_label(final_score)

    ai_explanation = (
        f"{district.name} maintains an accessibility score of {final_score}/100 ({priority}). "
        + (f"Key bottlenecks: {'; '.join(bottlenecks)}. " if bottlenecks else "Infrastructure accessibility is well-distributed across road, rail, and logistics nodes. ")
        + f"Terrain factor is rated {round(f_terrain, 1)}/100 with monsoon resilience at {round(f_rainfall, 1)}/100."
    )

    return {
        "district_id": district.id,
        "district_name": district.name,
        "state_id": district.state_id,
        "latitude": district.latitude,
        "longitude": district.longitude,
        "score": final_score,
        "overall_score": final_score,
        "status": "available",
        "priority_level": priority,
        "factor_scores": {k: round(v, 1) for k, v in factors.items()},
        "breakdown": breakdown,
        "factor_weights": WEIGHTS,
        "bottlenecks": bottlenecks,
        "key_bottlenecks": bottlenecks,
        "ai_explanation": ai_explanation,
        "recommended_interventions": recommended,
        "population": district.population,
        "area_sq_km": district.area_sq_km,
        "methodology": "MDoNER NER Accessibility Index (8-Factor Multi-Criteria Matrix)"
    }

def get_all_accessibility_scores(db: Session, state_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch accessibility index for all districts or filtered by state."""
    q = db.query(District)
    if state_filter and state_filter.lower() != "all":
        state = db.query(State).filter(State.name.ilike(f"%{state_filter}%")).first()
        if state:
            q = q.filter(District.state_id == state.id)

    districts = q.all()
    results = []
    for d in districts:
        wh_count = db.query(Warehouse).filter(Warehouse.district == d.name).count()
        score_data = compute_district_accessibility(d, live_warehouses=wh_count)
        
        # Add state name
        st = db.query(State).filter(State.id == d.state_id).first()
        score_data["state_name"] = st.name if st else "NER"
        results.append(score_data)

    # Sort so that lowest scores (most vulnerable) appear first, unavailable at the end
    results.sort(key=lambda x: (x["score"] is None, x["score"] or 0.0))
    return results
