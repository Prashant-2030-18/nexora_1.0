"""
NEXORA Hazard Processor — Server-Side SMS Fallback Engine
==========================================================
Checks active journey routes against trusted hazards.
Sends SMS via SmsProviderFactory when ALL conditions are met:

1. journey.active == True
2. last_heartbeat_at is stale (>= JOURNEY_OFFLINE_THRESHOLD_SECONDS)
3. journey.sms_consent == True
4. Trusted hazard exists (SACHET official or AI_SUPPORTED citizen)
5. Hazard severity >= SMS_HAZARD_MIN_SEVERITY
6. Hazard intersects remaining route corridor
7. AlertDelivery record does NOT already exist for this journey+hazard+channel

HONESTY RULES:
- Server uses "last known position" not "live position" (server cannot
  receive GPS while device is offline).
- SMS body never claims to know user's current real-time location.
- Conservative wording: "A hazard has been reported on your planned route"
  when exact intersection is uncertain.
"""

import json
import math
import datetime
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from ..models import JourneySession, AlertDelivery, DisasterAlert, UserReport
from ..config import settings
from .sms_provider import SmsProviderFactory, SmsProviderState


# ── Severity Ordering ────────────────────────────────────────────────────────

SEVERITY_RANK = {
    "extreme": 5, "critical": 4, "severe": 3, "high": 2, "moderate": 1,
    "minor": 0, "low": 0, "unknown": 0,
}

def _severity_meets_threshold(hazard_severity: str, min_severity: str) -> bool:
    h = SEVERITY_RANK.get(hazard_severity.lower(), 0)
    m = SEVERITY_RANK.get(min_severity.lower(), 2)  # default HIGH = 2
    return h >= m


# ── Haversine Distance ────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _extract_hazard_coords(h) -> Optional[Tuple[float, float]]:
    """Extract (lat, lon) from DisasterAlert or UserReport."""
    if getattr(h, "latitude", None) is not None and getattr(h, "longitude", None) is not None:
        return float(h.latitude), float(h.longitude)
    circle = getattr(h, "circle_coordinates", None)
    if circle and "," in circle:
        try:
            parts = circle.strip().split(" ")[0].split(",")
            return float(parts[0]), float(parts[1])
        except Exception:
            pass
    poly_str = getattr(h, "polygon_geojson", None)
    if poly_str:
        try:
            poly = json.loads(poly_str)
            coords = poly.get("coordinates", [])
            if coords and len(coords[0]) > 0:
                first = coords[0][0]
                return float(first[1]), float(first[0])
        except Exception:
            pass
    return None


# ── Route Corridor Intersection ───────────────────────────────────────────────

def _hazard_intersects_route(
    route_coords: List[List[float]],   # [[lon, lat], ...]
    hazard_lat: float,
    hazard_lon: float,
    corridor_km: float = 10.0,
    route_progress: float = 0.0,       # 0.0 – 1.0, skip already-passed segments
) -> bool:
    """
    Check if hazard is within corridor_km of the REMAINING route.
    route_coords: GeoJSON [[lon, lat]] pairs.
    route_progress: fraction of route already completed — skip passed segments.
    Returns True if intersects, False otherwise.
    Conservative: returns False if route_coords is empty or invalid.
    """
    if not route_coords or len(route_coords) < 2:
        return False

    try:
        # Determine the start index based on route_progress
        n = len(route_coords)
        start_idx = max(0, int(route_progress * n) - 1)

        for coord in route_coords[start_idx:]:
            lon, lat = coord[0], coord[1]
            dist = _haversine_km(lat, lon, hazard_lat, hazard_lon)
            if dist <= corridor_km:
                return True
    except Exception:
        pass
    return False


def _parse_route_coords(route_geometry_json: Optional[str]) -> List[List[float]]:
    """Parse stored GeoJSON route geometry to [[lon, lat]] list."""
    if not route_geometry_json:
        return []
    try:
        data = json.loads(route_geometry_json)
        if isinstance(data, list):
            return data
        # GeoJSON LineString
        if isinstance(data, dict) and data.get("type") == "LineString":
            return data.get("coordinates", [])
    except Exception:
        pass
    return []


# ── Last Position Description ─────────────────────────────────────────────────

def _last_position_desc(journey: JourneySession) -> str:
    """
    Generate honest description of last known position.
    Never claims this is live/current position.
    """
    if journey.last_known_latitude and journey.last_known_longitude:
        progress_pct = int((journey.last_route_progress or 0.0) * 100)
        return (
            f"approx. {progress_pct}% along planned route "
            f"(last update received before connectivity loss)"
        )
    return "position unavailable — using planned route origin"


def _landmark_from_journey(journey: JourneySession, hazard) -> str:
    """Get a landmark description from hazard or route."""
    desc = getattr(hazard, "area_desc", None) or getattr(hazard, "area_description", None) or getattr(hazard, "location_name", None)
    if desc:
        return str(desc)[:60]
    ev = getattr(hazard, "event", None) or getattr(hazard, "type", None)
    if ev:
        return f"reported {str(ev).lower()} zone"
    return journey.destination or "route corridor"


# ── Core Processor ───────────────────────────────────────────────────────────

def process_route_hazards_for_active_journeys(db: Session) -> dict:
    """
    Main entry point. Called periodically (e.g. on new hazard creation,
    periodic background task, or SACHET sync).

    Returns summary dict with counts.
    """
    now = datetime.datetime.utcnow()
    threshold_seconds = settings.JOURNEY_OFFLINE_THRESHOLD_SECONDS
    min_severity = settings.SMS_HAZARD_MIN_SEVERITY

    results = {
        "journeys_checked": 0,
        "stale_journeys": 0,
        "sms_sent": 0,
        "sms_skipped_no_consent": 0,
        "sms_skipped_no_hazard": 0,
        "sms_skipped_duplicate": 0,
        "sms_skipped_provider_not_configured": 0,
        "sms_failed": 0,
    }

    # Fetch all active journeys
    active_journeys = db.query(JourneySession).filter(
        JourneySession.active == True
    ).all()

    results["journeys_checked"] = len(active_journeys)

    # Fetch trusted official SACHET alerts
    sachet_hazards = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
    ).all()

    # Also fetch verified user reports (AI_SUPPORTED / AI_VERIFIED)
    user_hazards = db.query(UserReport).filter(
        UserReport.status != "DELETED",
        UserReport.verification_status.in_(["AI_SUPPORTED", "AI_VERIFIED", "APPROVED"])
    ).all()

    all_trusted = list(sachet_hazards) + list(user_hazards)

    # Filter to minimum severity
    eligible_hazards = [
        h for h in all_trusted
        if _severity_meets_threshold(getattr(h, "risk_level", None) or getattr(h, "severity", None) or "low", min_severity)
    ]

    for journey in active_journeys:
        # Check if heartbeat is stale
        last_hb = journey.last_heartbeat_at
        if last_hb is None:
            # Journey started but never sent heartbeat — use started_at
            last_hb = journey.started_at

        seconds_since_hb = (now - last_hb).total_seconds()

        if seconds_since_hb < threshold_seconds:
            # Journey is reachable — no SMS needed
            continue

        results["stale_journeys"] += 1

        # Mark journey as OFFLINE_ASSUMED (not "confirmed offline")
        if journey.connectivity_status != "OFFLINE_ASSUMED":
            journey.connectivity_status = "OFFLINE_ASSUMED"
            journey.last_connection_state = "OFFLINE_ASSUMED"
            db.add(journey)

        # Check SMS consent
        if not journey.sms_consent:
            results["sms_skipped_no_consent"] += 1
            continue

        if not journey.phone_number:
            results["sms_skipped_no_consent"] += 1
            continue

        # Check provider state
        provider = SmsProviderFactory.get()
        if provider.get_state() == SmsProviderState.NOT_CONFIGURED:
            results["sms_skipped_provider_not_configured"] += 1
            continue

        # Parse route geometry
        route_coords = _parse_route_coords(journey.route_geometry)
        route_progress = journey.last_route_progress or 0.0

        # Check each eligible hazard
        hazard_found = False
        for hazard in eligible_hazards:
            coords = _extract_hazard_coords(hazard)
            if not coords:
                continue

            h_lat, h_lon = coords

            # Check route intersection
            intersects = _hazard_intersects_route(
                route_coords,
                h_lat,
                h_lon,
                corridor_km=15.0,
                route_progress=route_progress,
            )

            if not intersects:
                continue

            hazard_found = True

            # Check deduplication — has this journey+hazard already been sent?
            existing_delivery = db.query(AlertDelivery).filter(
                AlertDelivery.journey_id == journey.id,
                AlertDelivery.hazard_id == hazard.id,
                AlertDelivery.channel == "SMS",
                AlertDelivery.status.in_(["QUEUED", "SENT_TO_PROVIDER", "DELIVERED"]),
            ).first()

            if existing_delivery:
                results["sms_skipped_duplicate"] += 1
                continue

            # Select template
            sev = getattr(hazard, "risk_level", None) or getattr(hazard, "severity", None) or "high"
            severity_upper = str(sev).upper()
            template_key = (
                "route_hazard_critical"
                if severity_upper in ("CRITICAL", "EXTREME")
                else "route_hazard_alert"
            )

            ev_type = getattr(hazard, "event", None) or getattr(hazard, "type", None) or "hazard"

            variables = {
                "severity": severity_upper,
                "event_type": str(ev_type),
                "landmark": _landmark_from_journey(journey, hazard),
                "last_position_desc": _last_position_desc(journey),
            }

            language = journey.preferred_language or "en"

            # Create delivery record BEFORE sending (prevents race condition)
            delivery = AlertDelivery(
                journey_id=journey.id,
                hazard_id=hazard.id,
                hazard_source="SACHET" if getattr(hazard, "source", "SACHET") == "SACHET_NDMA" else "CITIZEN",
                user_id=journey.user_id,
                phone_number=journey.phone_number,
                channel="SMS",
                language=language,
                status="QUEUED",
                provider_name=type(provider).__name__,
            )
            db.add(delivery)
            db.flush()

            # Attempt send
            try:
                send_result = provider.send_message(
                    phone_number=journey.phone_number,
                    template_key=template_key,
                    language=language,
                    variables=variables,
                )

                state = send_result.get("status")
                if state in (SmsProviderState.SIMULATION, SmsProviderState.LIVE):
                    delivery.status = "SENT_TO_PROVIDER"
                    delivery.provider_message_id = send_result.get("message_id")
                    results["sms_sent"] += 1
                else:
                    delivery.status = "FAILED"
                    delivery.error_message = send_result.get("error", "Unknown error")
                    results["sms_failed"] += 1

            except Exception as e:
                delivery.status = "FAILED"
                delivery.error_message = str(e)
                results["sms_failed"] += 1

            db.add(delivery)

        if not hazard_found:
            results["sms_skipped_no_hazard"] += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[HazardProcessor] DB commit error: {e}")

    return results
