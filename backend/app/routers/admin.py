import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from ..database import get_db
from ..models import User, AuditLog, Road, LogisticsHub, Warehouse, InfrastructureGap, UserReport, RoadCondition, DataSource, APISyncLog
from ..schemas import UserResponse, UserCreate
from ..auth import require_roles, get_password_hash, User as UserModel
from ..services.sachet_service import sync_sachet_ndma_alerts

router = APIRouter(prefix="/api/admin", tags=["Admin Management"])

@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    return db.query(User).order_by(User.id.asc()).all()

@router.post("/users", response_model=UserResponse)
def create_user_by_admin(
    user_in: UserCreate,
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        state=user_in.state or "Assam",
        is_active=True
    )
    db.add(new_user)
    
    audit = AuditLog(
        user_email=current_user.email,
        action="ADMIN_CREATE_USER",
        details=f"Admin created user {new_user.email} with role '{new_user.role}'."
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/users/{user_id}/status")
def toggle_user_status(
    user_id: int,
    payload: Dict[str, bool],
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_active = payload.get("is_active", True)
    user.is_active = is_active

    audit = AuditLog(
        user_email=current_user.email,
        action="ADMIN_UPDATE_USER_STATUS",
        details=f"Admin set user {user.email} is_active to {is_active}."
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "message": f"User status updated to {'Active' if is_active else 'Deactivated'}"}

@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: Dict[str, str],
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_role = payload.get("role", "citizen")
    user.role = new_role

    audit = AuditLog(
        user_email=current_user.email,
        action="ADMIN_UPDATE_USER_ROLE",
        details=f"Admin updated user {user.email} role to '{new_role}'."
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "message": f"User role updated to '{new_role}'"}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.email == current_user.email:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    db.delete(user)
    audit = AuditLog(
        user_email=current_user.email,
        action="ADMIN_DELETE_USER",
        details=f"Admin deleted user {user.email}."
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "message": f"User {user_id} deleted successfully"}

@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 50,
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()
    return logs

@router.post("/roads")
def create_road_corridor(
    payload: Dict[str, Any],
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    new_road = Road(
        name=payload.get("name", "Strategic Corridor"),
        road_type=payload.get("road_type", "National Highway"),
        state=payload.get("state", "Assam"),
        start_location=payload.get("start_location", "Origin"),
        end_location=payload.get("end_location", "Destination"),
        distance_km=float(payload.get("distance_km", 50.0)),
        average_speed_limit=float(payload.get("average_speed_limit", payload.get("average_speed", 50.0))),
        condition=payload.get("condition", "Operational")
    )
    db.add(new_road)
    db.commit()
    db.refresh(new_road)
    return new_road

@router.post("/logistics-hubs")
def create_logistics_hub(
    payload: Dict[str, Any],
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    new_hub = LogisticsHub(
        name=payload.get("name"),
        state=payload.get("state"),
        district=payload.get("district"),
        latitude=float(payload.get("latitude")),
        longitude=float(payload.get("longitude")),
        capacity_mt=float(payload.get("capacity_mt", payload.get("capacity", 5000.0))),
        utilization_pct=float(payload.get("utilization_pct", payload.get("utilization", 0.0))),
        contact_person=payload.get("contact_person"),
        contact_phone=payload.get("contact_phone"),
        created_by_user_id=current_user.id
    )
    db.add(new_hub)
    db.commit()
    db.refresh(new_hub)
    return new_hub

@router.get("/user-reports")
def get_admin_user_reports(
    status_filter: Optional[str] = None,
    current_user: UserModel = Depends(require_roles(["admin", "state_gov"])),
    db: Session = Depends(get_db)
):
    """List citizen disaster reports for admin moderation."""
    q = db.query(UserReport)
    if status_filter:
        q = q.filter(UserReport.status == status_filter)
    return q.order_by(UserReport.created_at.desc()).all()

@router.post("/sync-sachet")
def admin_sync_sachet(
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    """Trigger manual sync of official SACHET alerts."""
    res = sync_sachet_ndma_alerts(db)
    return res

@router.get("/data-sources")
def get_data_sources_status(
    current_user: UserModel = Depends(require_roles(["admin"])),
    db: Session = Depends(get_db)
):
    """Return operational status and last sync logs of all external data pipelines."""
    logs = db.query(APISyncLog).order_by(APISyncLog.id.desc()).limit(15).all()
    sources = db.query(DataSource).all()
    return {
        "sources": sources,
        "recent_sync_logs": logs
    }
