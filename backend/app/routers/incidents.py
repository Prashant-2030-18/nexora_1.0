import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Incident, Alert, AuditLog
from ..schemas import IncidentResponse, IncidentCreate
from ..auth import require_auth, require_roles, User

router = APIRouter(prefix="/api/incidents", tags=["Incidents & Disaster Intelligence"])

@router.get("", response_model=List[IncidentResponse])
def get_incidents(
    state: Optional[str] = None,
    status_filter: Optional[str] = None,
    severity: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Incident)
    if state and state.lower() != "all":
        query = query.filter(Incident.state.ilike(f"%{state}%"))
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    if severity:
        query = query.filter(Incident.severity == severity)
    return query.order_by(Incident.id.desc()).all()

@router.post("", response_model=IncidentResponse)
def create_incident(
    inc_in: IncidentCreate,
    current_user: User = Depends(require_roles(["admin", "state_gov"])),
    db: Session = Depends(get_db)
):
    new_inc = Incident(
        title=inc_in.title,
        type=inc_in.type,
        severity=inc_in.severity,
        state=inc_in.state,
        district=inc_in.district,
        latitude=inc_in.latitude,
        longitude=inc_in.longitude,
        description=inc_in.description,
        affected_route=inc_in.affected_route,
        expected_duration=inc_in.expected_duration,
        status=inc_in.status,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_inc)

    # Automatically create a critical alert notification
    alert = Alert(
        title=f"🚨 New {new_inc.severity.upper()} Incident: {new_inc.title}",
        message=f"{new_inc.description} Affected corridor: {new_inc.affected_route} ({new_inc.district}, {new_inc.state}).",
        severity=new_inc.severity,
        type="Disaster Alert",
        state=new_inc.state,
        is_read=False,
        created_at=datetime.datetime.utcnow()
    )
    db.add(alert)

    # Audit log
    audit = AuditLog(
        user_email=current_user.email,
        action="CREATE_INCIDENT",
        details=f"Created incident '{new_inc.title}' on {new_inc.affected_route} with severity {new_inc.severity}."
    )
    db.add(audit)

    db.commit()
    db.refresh(new_inc)
    return new_inc

@router.put("/{incident_id}", response_model=IncidentResponse)
def update_incident(
    incident_id: int,
    inc_update: IncidentCreate,
    current_user: User = Depends(require_roles(["admin", "state_gov"])),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc.title = inc_update.title
    inc.type = inc_update.type
    inc.severity = inc_update.severity
    inc.state = inc_update.state
    inc.district = inc_update.district
    inc.latitude = inc_update.latitude
    inc.longitude = inc_update.longitude
    inc.description = inc_update.description
    inc.affected_route = inc_update.affected_route
    inc.expected_duration = inc_update.expected_duration
    inc.status = inc_update.status

    audit = AuditLog(
        user_email=current_user.email,
        action="UPDATE_INCIDENT",
        details=f"Updated incident ID {incident_id} ({inc.title}) status to '{inc.status}'."
    )
    db.add(audit)
    db.commit()
    db.refresh(inc)
    return inc

@router.delete("/{incident_id}")
def delete_incident(
    incident_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    db.delete(inc)
    audit = AuditLog(
        user_email=current_user.email,
        action="DELETE_INCIDENT",
        details=f"Deleted incident ID {incident_id} ({inc.title})."
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "message": f"Incident {incident_id} deleted successfully"}

@router.post("/refresh-simulated")
def refresh_simulated_incidents(
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Refreshes live timestamps and simulated telemetry on active incidents."""
    incidents = db.query(Incident).all()
    for inc in incidents:
        inc.created_at = datetime.datetime.utcnow()
    db.commit()
    return {
        "status": "success",
        "message": "Simulated Live Intelligence data refreshed with current UTC timestamps.",
        "active_incidents_count": len(incidents)
    }
