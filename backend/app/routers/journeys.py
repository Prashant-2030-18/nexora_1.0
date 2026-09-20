"""
NEXORA Journey Session Router
==============================
Manages active navigation journeys. Tracks heartbeats so backend can
detect connectivity loss and trigger SMS fallback if needed.

Endpoints:
    POST /api/journeys/start           — Start a new journey session
    POST /api/journeys/{id}/heartbeat  — Update GPS/connection state
    POST /api/journeys/{id}/finish     — End journey, stop SMS alerts
    GET  /api/journeys/{id}/alerts     — List alert deliveries for journey
    GET  /api/journeys/active          — Get current active journey for user
"""

import uuid
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from ..database import SessionLocal
from ..auth import get_current_user
from ..models import JourneySession, AlertDelivery, User


router = APIRouter(prefix="/api/journeys", tags=["Journeys"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Request / Response Schemas ────────────────────────────────────────────────

class StartJourneyRequest(BaseModel):
    travel_mode: str = "car"
    origin: Optional[str] = None
    destination: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    route_geometry: Optional[str] = None    # JSON string of [[lon,lat]] coords
    route_provider: Optional[str] = None
    route_id: Optional[str] = "fastest"
    sms_consent: bool = False               # Explicit opt-in required
    ivr_consent: bool = False
    preferred_language: str = "en"
    phone_number: Optional[str] = None      # Only needed if sms_consent=True


class HeartbeatRequest(BaseModel):
    timestamp: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    route_progress: Optional[float] = None  # 0.0 – 1.0
    connection_state: str = "ONLINE"


class FinishJourneyRequest(BaseModel):
    reason: Optional[str] = "USER_ENDED"


class JourneyResponse(BaseModel):
    journey_id: str
    active: bool
    travel_mode: Optional[str]
    origin: Optional[str]
    destination: Optional[str]
    started_at: str
    connectivity_status: str
    sms_consent: bool
    sms_phone_masked: Optional[str]
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    p = phone.strip()
    if len(p) > 6:
        return f"{p[:3]} ******{p[-4:]}"
    return "******"


def _parse_iso(ts: str) -> Optional[datetime.datetime]:
    try:
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return datetime.datetime.utcnow()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/start", response_model=JourneyResponse)
def start_journey(
    req: StartJourneyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start a new navigation journey session.
    Creates a server-side journey record for heartbeat monitoring
    and SMS fallback eligibility tracking.
    """
    # Deactivate any prior active journeys for this user
    prior = db.query(JourneySession).filter(
        JourneySession.user_id == current_user.id,
        JourneySession.active == True,
    ).all()
    for p in prior:
        p.active = False
        p.finished_at = datetime.datetime.utcnow()
        db.add(p)

    # Validate: if SMS consent, phone is required (check request then current_user.phone)
    phone_to_use = req.phone_number or getattr(current_user, "phone", None)
    if req.sms_consent and not phone_to_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A mobile number is required when SMS alerts are enabled. Please provide one or add it to your profile.",
        )

    journey_id = str(uuid.uuid4())
    journey = JourneySession(
        id=journey_id,
        user_id=current_user.id,
        phone_number=phone_to_use,
        preferred_language=req.preferred_language,
        travel_mode=req.travel_mode,
        origin=req.origin,
        destination=req.destination,
        origin_lat=req.origin_lat,
        origin_lon=req.origin_lon,
        dest_lat=req.dest_lat,
        dest_lon=req.dest_lon,
        route_geometry=req.route_geometry,
        route_provider=req.route_provider,
        route_id=req.route_id,
        sms_consent=req.sms_consent,
        ivr_consent=req.ivr_consent,
        satellite_preference="NOT_CONFIGURED",
        active=True,
        connectivity_status="ONLINE",
        last_connection_state="ONLINE",
        last_heartbeat_at=datetime.datetime.utcnow(),
        started_at=datetime.datetime.utcnow(),
    )
    db.add(journey)
    db.commit()
    db.refresh(journey)

    print(f"[Journey] Started: {journey_id} | user={current_user.id} | mode={req.travel_mode} | sms_consent={req.sms_consent}")

    return JourneyResponse(
        journey_id=journey_id,
        active=True,
        travel_mode=req.travel_mode,
        origin=req.origin,
        destination=req.destination,
        started_at=journey.started_at.isoformat(),
        connectivity_status="ONLINE",
        sms_consent=req.sms_consent,
        sms_phone_masked=_mask_phone(req.phone_number),
        message="Journey session started. Backend monitoring active.",
    )


@router.post("/{journey_id}/heartbeat")
def journey_heartbeat(
    journey_id: str,
    req: HeartbeatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Receive a lightweight heartbeat from the device.
    Updates last_heartbeat_at and GPS state.
    Backend infers connectivity loss from missed heartbeats.

    Throttling: frontend should send this every 10-20 seconds,
    not on every GPS sample.
    """
    journey = db.query(JourneySession).filter(
        JourneySession.id == journey_id,
        JourneySession.user_id == current_user.id,
    ).first()

    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")

    if not journey.active:
        return {"status": "JOURNEY_INACTIVE", "message": "Journey already finished"}

    now = datetime.datetime.utcnow()
    journey.last_heartbeat_at = now
    journey.last_connection_state = req.connection_state

    # Update last known GPS (server labels these as LAST KNOWN, not LIVE)
    if req.latitude is not None:
        journey.last_known_latitude = req.latitude
    if req.longitude is not None:
        journey.last_known_longitude = req.longitude
    if req.accuracy is not None:
        journey.last_gps_accuracy = req.accuracy
    if req.speed_kmh is not None:
        journey.last_speed = req.speed_kmh
    if req.heading is not None:
        journey.last_heading = req.heading
    if req.route_progress is not None:
        journey.last_route_progress = req.route_progress

    # If reconnected after OFFLINE_ASSUMED, update status
    if journey.connectivity_status == "OFFLINE_ASSUMED":
        journey.connectivity_status = "RECONNECTED"

    db.add(journey)
    db.commit()

    return {
        "status": "OK",
        "journey_id": journey_id,
        "server_received_at": now.isoformat(),
        "connection_state": req.connection_state,
    }


@router.post("/{journey_id}/finish")
def finish_journey(
    journey_id: str,
    req: FinishJourneyRequest = FinishJourneyRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    End a journey. Marks it inactive — no further SMS alerts will be sent.
    """
    journey = db.query(JourneySession).filter(
        JourneySession.id == journey_id,
        JourneySession.user_id == current_user.id,
    ).first()

    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")

    journey.active = False
    journey.finished_at = datetime.datetime.utcnow()
    journey.connectivity_status = "FINISHED"
    db.add(journey)
    db.commit()

    print(f"[Journey] Finished: {journey_id} | reason={req.reason}")

    return {
        "status": "FINISHED",
        "journey_id": journey_id,
        "finished_at": journey.finished_at.isoformat(),
        "message": "Journey ended. No further route alerts will be sent.",
    }


@router.get("/active")
def get_active_journey(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current active journey for the authenticated user.
    Used on app resume to restore journey state ("RESUME JOURNEY?" prompt).
    """
    journey = db.query(JourneySession).filter(
        JourneySession.user_id == current_user.id,
        JourneySession.active == True,
    ).order_by(JourneySession.started_at.desc()).first()

    if not journey:
        return {"active": False, "journey": None}

    return {
        "active": True,
        "journey": {
            "journey_id": journey.id,
            "travel_mode": journey.travel_mode,
            "origin": journey.origin,
            "destination": journey.destination,
            "started_at": journey.started_at.isoformat() if journey.started_at else None,
            "connectivity_status": journey.connectivity_status,
            "sms_consent": journey.sms_consent,
            "sms_phone_masked": _mask_phone(journey.phone_number),
            "route_id": journey.route_id,
        },
    }


@router.get("/{journey_id}/alerts")
def get_journey_alerts(
    journey_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all alert deliveries for a journey.
    Shows delivery status (QUEUED/SENT_TO_PROVIDER/DELIVERED/FAILED).
    """
    journey = db.query(JourneySession).filter(
        JourneySession.id == journey_id,
        JourneySession.user_id == current_user.id,
    ).first()

    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")

    deliveries = db.query(AlertDelivery).filter(
        AlertDelivery.journey_id == journey_id,
    ).order_by(AlertDelivery.attempted_at.desc()).all()

    return {
        "journey_id": journey_id,
        "alert_count": len(deliveries),
        "alerts": [
            {
                "id": d.id,
                "hazard_id": d.hazard_id,
                "hazard_source": d.hazard_source,
                "channel": d.channel,
                "status": d.status,
                "language": d.language,
                "provider": d.provider_name,
                "attempted_at": d.attempted_at.isoformat() if d.attempted_at else None,
                "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
            }
            for d in deliveries
        ],
    }
