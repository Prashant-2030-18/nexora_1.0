import os
import shutil
import uuid
import hashlib
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from ..database import get_db
from ..models import DisasterAlert, UserReport, AuditLog
from ..schemas import (
    DisasterAlertResponse, UserDisasterReportCreate,
    UserDisasterReportPatch, UserDisasterReportResponse
)
from ..services.sachet_service import (
    sync_sachet_ndma_alerts,
    get_active_sachet_alerts,
    get_sachet_sync_status,
    filter_alerts_for_route,
)
from ..services.citizen_report_verifier import verify_citizen_report
from ..services.storage_service import evidence_storage
from ..auth import get_current_user, require_roles, User

router = APIRouter(prefix="/api/disasters", tags=["Disaster Intelligence & SACHET NDMA"])
router_direct = APIRouter(prefix="/disasters", tags=["Disaster Intelligence & SACHET NDMA (Direct)"])

# Local fallback upload dir (used by LocalEvidenceStorage in dev)
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "reports"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

class ModerationRequest(BaseModel):
    notes: Optional[str] = None

def serialize_user_disaster(rep: UserReport) -> Dict[str, Any]:
    created_dt = rep.created_at or datetime.utcnow()
    updated_dt = rep.updated_at or created_dt
    rad = float(rep.radius_km if rep.radius_km is not None else 5.0)
    rep_by = rep.reported_by or (rep.reporter_name if rep.reporter_name else "Citizen")
    v_status = (rep.verification_status or "AI_REVIEW").upper()
    legacy_status = (rep.status or "PENDING").upper()
    
    # Determine confirmation (AI_SUPPORTED / AI_VERIFIED are confirmed active citizen hazards)
    is_verified = (v_status in ["AI_SUPPORTED", "AI_VERIFIED"]) or (legacy_status in ["APPROVED", "VERIFIED", "ACTIVE"] and v_status not in ["AI_REJECTED", "AI_UNSUPPORTED"])
    
    if v_status in ["AI_SUPPORTED", "AI_VERIFIED"]:
        badge = "AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)"
    elif v_status == "SACHET_CORROBORATED":
        badge = "OFFICIAL ALERT CORROBORATED"
    elif v_status in ["AI_UNSUPPORTED", "AI_REJECTED"] or legacy_status in ["REJECTED", "REJECT"]:
        badge = "AI REJECTED"
    else:
        badge = "UNCONFIRMED CITIZEN REPORT"

    ai_conf = float(rep.ai_confidence if rep.ai_confidence is not None else (rep.confidence if rep.confidence is not None else 0.70))

    # Mask phone number for citizen privacy
    raw_phone = rep.contact_info or rep.reporter_phone
    masked_phone = None
    if raw_phone:
        p_clean = raw_phone.strip()
        if len(p_clean) >= 8:
            masked_phone = p_clean[:3] + "-XXXXX-" + p_clean[-2:]
        else:
            masked_phone = "XXXXX"

    return {
        "id": rep.id,
        "type": rep.disaster_type,
        "disaster_type": rep.disaster_type,
        "hazard_type": rep.disaster_type,
        "severity": (rep.severity or "MODERATE").upper(),
        "latitude": float(rep.latitude),
        "longitude": float(rep.longitude),
        "location_name": rep.location_name or "Reported Location",
        "radiusKm": rad,
        "radius_km": rad,
        "description": rep.description or "",
        "source": "USER_REPORTED",
        "source_badge": badge,
        "verified": is_verified,
        "reportedBy": rep_by,
        "reported_by": rep_by,
        "reporter_name": rep.reporter_name,
        "reporter_phone": masked_phone,
        "createdAt": created_dt.isoformat(),
        "created_at": created_dt,
        "updatedAt": updated_dt.isoformat(),
        "updated_at": updated_dt,
        "status": rep.status or "PENDING",
        "confidence": ai_conf,
        "verification_status": v_status,
        "ai_confidence": ai_conf,
        "ai_reason": rep.ai_reason or rep.review_notes,
        "evidence_score": float(rep.evidence_score) if rep.evidence_score is not None else None,
        "location_score": float(rep.location_score) if rep.location_score is not None else None,
        "consistency_score": float(rep.consistency_score) if rep.consistency_score is not None else None,
        "duplicate_score": float(rep.duplicate_score) if rep.duplicate_score is not None else None,
        "image_analysis_available": bool(rep.image_analysis_available),
        "image_analysis_summary": rep.image_analysis_summary,
        "verified_at": rep.verified_at or rep.reviewed_at,
        "verification_model": rep.verification_model or "nexora-ai-v2",
        "verification_version": rep.verification_version or "2.0.0",
        "corroboration_count": int(rep.corroboration_count if rep.corroboration_count is not None else 1),
        "corroborated_sachet_alert_id": rep.corroborated_sachet_alert_id,
        "corroborated_sachet_identifier": getattr(rep, "corroborated_sachet_identifier", None),
        "location_scope": getattr(rep, "location_scope", None),
        "locationScope": getattr(rep, "location_scope", None),
        "evidence_hash": getattr(rep, "evidence_hash", None),
        "gps_accuracy": getattr(rep, "gps_accuracy", None),
        "road_impact": getattr(rep, "road_impact", "NONE"),
        "unique_evidence_count": getattr(rep, "unique_evidence_count", 0),
        "expires_at": rep.expires_at.isoformat() if getattr(rep, "expires_at", None) else None,
        "contactInfo": masked_phone,
        "contact_info": masked_phone,
        "estimatedRoadImpact": rep.estimated_road_impact or getattr(rep, "road_impact", None),
        "estimated_road_impact": rep.estimated_road_impact or getattr(rep, "road_impact", None),
        "evidenceUrl": rep.evidence_url,
        "evidence_url": rep.evidence_url,
        "image_url": rep.evidence_url,
        "reviewed_by": getattr(rep, "reviewed_by", None),
        "reviewed_at": rep.reviewed_at.isoformat() if getattr(rep, "reviewed_at", None) else None,
        "review_notes": rep.review_notes
    }

# --- 1. USER DISASTER REPORTING ENDPOINTS ---

@router.post("/report/evidence")
@router_direct.post("/report/evidence")
async def upload_report_evidence(file: UploadFile = File(...)):
    """Accepts JPG, PNG, WEBP <= 5MB, computes SHA-256 hash, and stores via evidence_storage.
    In development: saves to local uploads/reports/.
    In production: uploads to Supabase Storage private bucket.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    ext = Path(file.filename).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP images are permitted for ground evidence.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Evidence photo exceeds maximum 5MB size limit.")

    sha256_hash = hashlib.sha256(content).hexdigest()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/jpeg")

    try:
        evidence_url, object_path = evidence_storage.upload(content, file.filename, mime_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evidence upload failed: {str(exc)[:200]}")

    return {
        "status": "success",
        "evidence_url": evidence_url,
        "image_url": evidence_url,
        "object_path": object_path,
        "filename": Path(object_path).name,
        "size": len(content),
        "evidence_hash": sha256_hash
    }

def _create_user_report(report_in: UserDisasterReportCreate, current_user: Optional[User], db: Session):
    try:
        lat = float(report_in.latitude)
        lon = float(report_in.longitude)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Latitude and longitude must be valid numeric values.")
    
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        raise HTTPException(status_code=400, detail=f"Coordinates out of valid global range (-90 to +90 lat, -180 to +180 lon): ({lat}, {lon})")

    d_type = report_in.type or report_in.disaster_type or report_in.hazard_type or "Other"
    sev = (report_in.severity or "MODERATE").upper()
    rad = report_in.radiusKm if report_in.radiusKm is not None else (report_in.radius_km or 5.0)
    rep_by = report_in.reportedBy or report_in.reported_by or ("Operator" if (current_user and current_user.role in ["admin", "logistics_operator"]) else "Citizen")
    contact = report_in.contactInfo or report_in.contact_info or report_in.contact_phone
    impact = report_in.estimatedRoadImpact or report_in.estimated_road_impact
    evidence = report_in.evidenceUrl or report_in.evidence_url or report_in.image_url
    loc_name = report_in.location_name or f"Near {lat:.4f}, {lon:.4f}"
    gps_acc = report_in.gps_accuracy if report_in.gps_accuracy is not None else getattr(report_in, "gpsAccuracy", None)

    # 1. Run Automated Multi-Signal AI Verification Engine
    verify_payload = {
        "latitude": lat,
        "longitude": lon,
        "location_name": loc_name,
        "disaster_type": d_type,
        "severity": sev,
        "description": report_in.description or "",
        "evidence_url": evidence,
        "reporter_user_id": current_user.id if current_user else None,
        "reporter_phone": contact,
        "gps_accuracy": gps_acc
    }
    v_res = verify_citizen_report(verify_payload, db)

    # 2. Map verification result to internal database status
    # SACHET_CORROBORATED -> CORROBORATED (Official SACHET alert is primary; citizen report links to it)
    # AI_SUPPORTED / AI_VERIFIED -> APPROVED (Active hazard on GIS map & route engine)
    # AI_REVIEW -> PENDING (Cautionary advisory only)
    # AI_UNSUPPORTED / AI_REJECTED -> REJECTED (Excluded from active hazards)
    v_status = v_res["verification_status"]
    if v_status in ["AI_SUPPORTED", "AI_VERIFIED"]:
        sys_status = "APPROVED"
    elif v_status == "SACHET_CORROBORATED":
        sys_status = "CORROBORATED"
    elif v_status in ["AI_UNSUPPORTED", "AI_REJECTED"]:
        sys_status = "REJECTED"
    else:
        sys_status = "PENDING"

    new_report = UserReport(
        reporter_name=rep_by,
        reporter_phone=contact,
        reporter_email=current_user.email if current_user else None,
        reporter_user_id=current_user.id if current_user else None,
        disaster_type=d_type,
        severity=sev,
        latitude=lat,
        longitude=lon,
        location_name=loc_name,
        radius_km=float(rad),
        description=report_in.description or "",
        source="USER_REPORTED",
        reported_by=rep_by,
        confidence=v_res["ai_confidence"],
        contact_info=contact,
        estimated_road_impact=impact or v_res.get("road_impact"),
        evidence_url=evidence,
        status=sys_status,
        verification_status=v_status,
        ai_confidence=v_res["ai_confidence"],
        ai_reason=v_res["ai_reason"],
        evidence_score=v_res["evidence_score"],
        location_score=v_res["location_score"],
        consistency_score=v_res["consistency_score"],
        duplicate_score=v_res["duplicate_score"],
        image_analysis_available=v_res["image_analysis_available"],
        image_analysis_summary=v_res["image_analysis_summary"],
        verified_at=v_res["verified_at"],
        verification_model=v_res["verification_model"],
        verification_version=v_res["verification_version"],
        corroboration_count=v_res["corroboration_count"],
        corroborated_sachet_alert_id=v_res["corroborated_sachet_alert_id"],
        corroborated_sachet_identifier=v_res.get("corroborated_sachet_identifier"),
        location_scope=v_res.get("location_scope"),
        evidence_hash=v_res.get("evidence_hash"),
        gps_accuracy=gps_acc,
        road_impact=v_res.get("road_impact", "NONE"),
        unique_evidence_count=v_res.get("unique_evidence_count", 0),
        expires_at=v_res.get("expires_at"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Add audit log
    audit = AuditLog(
        user_email=current_user.email if current_user else "anonymous_citizen",
        action="CITIZEN_DISASTER_REPORT_AI_VERIFIED",
        details=f"Report #{new_report.id} ({d_type} at {loc_name}) verified by AI engine as {v_res['verification_status']} (confidence: {v_res['ai_confidence']:.2f})."
    )
    db.add(audit)
    db.commit()

    return serialize_user_disaster(new_report)

@router.post("/report", response_model=UserDisasterReportResponse, status_code=status.HTTP_201_CREATED)
def report_disaster_api(
    report_in: UserDisasterReportCreate,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually report a disaster affecting a particular geographic location."""
    return _create_user_report(report_in, current_user, db)

@router_direct.post("/report", response_model=UserDisasterReportResponse, status_code=status.HTTP_201_CREATED)
def report_disaster_direct(
    report_in: UserDisasterReportCreate,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return _create_user_report(report_in, current_user, db)

@router.get("/user-reported/stats")
@router_direct.get("/user-reported/stats")
def get_user_reported_stats(db: Session = Depends(get_db)):
    """Retrieve statistical counters for citizen disaster reports with AI breakdown."""
    total = db.query(UserReport).filter(UserReport.status != "DELETED").count()
    ai_verified = db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.verification_status == "AI_VERIFIED") | (UserReport.status.in_(["APPROVED", "Verified", "Active"]))
    ).count()
    ai_review = db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.verification_status == "AI_REVIEW") | (UserReport.status.in_(["PENDING", "Pending Verification"]))
    ).count()
    ai_rejected = db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.verification_status == "AI_REJECTED") | (UserReport.status.in_(["REJECTED", "Rejected"]))
    ).count()
    corroborated = db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.corroboration_count > 1) | (UserReport.corroborated_sachet_alert_id != None)
    ).count()
    return {
        "total": total,
        "ai_verified": ai_verified,
        "ai_review": ai_review,
        "ai_rejected": ai_rejected,
        "corroborated": corroborated,
        # Backward-compatibility aliases
        "approved": ai_verified,
        "pending": ai_review,
        "rejected": ai_rejected
    }

def _get_user_reports(status_filter: Optional[str], db: Session):
    q = db.query(UserReport).filter(UserReport.status != "DELETED")
    if status_filter and status_filter.upper() != "ALL":
        sf = status_filter.upper()
        if sf in ["AI_VERIFIED", "APPROVED", "VERIFIED", "ACTIVE"]:
            q = q.filter((UserReport.verification_status == "AI_VERIFIED") | (UserReport.status.in_(["APPROVED", "Verified", "Active"])))
        elif sf in ["AI_REVIEW", "PENDING", "PENDING VERIFICATION"]:
            q = q.filter((UserReport.verification_status == "AI_REVIEW") | (UserReport.status.in_(["PENDING", "Pending Verification"])))
        elif sf in ["AI_REJECTED", "REJECTED"]:
            q = q.filter((UserReport.verification_status == "AI_REJECTED") | (UserReport.status.in_(["REJECTED", "Rejected"])))
        else:
            q = q.filter((UserReport.verification_status == status_filter) | (UserReport.status == status_filter))
    reports = q.order_by(UserReport.created_at.desc()).all()
    return [serialize_user_disaster(r) for r in reports]

@router.get("/user-reported", response_model=List[UserDisasterReportResponse])
def get_user_reported_disasters_api(
    status: Optional[str] = Query(None, description="Filter by status (AI_VERIFIED, AI_REVIEW, AI_REJECTED, ALL)"),
    db: Session = Depends(get_db)
):
    """Retrieve all citizen-reported ground disasters."""
    return _get_user_reports(status, db)

@router_direct.get("/user-reported", response_model=List[UserDisasterReportResponse])
def get_user_reported_disasters_direct(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    return _get_user_reports(status, db)

@router.post("/user-reported/{id}/reverify", response_model=UserDisasterReportResponse)
@router_direct.post("/user-reported/{id}/reverify", response_model=UserDisasterReportResponse)
def reverify_user_report_api(
    id: int,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Re-evaluate an existing citizen report through the AI verification engine."""
    report = db.query(UserReport).filter(UserReport.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Disaster report not found")

    payload = {
        "latitude": report.latitude,
        "longitude": report.longitude,
        "location_name": report.location_name,
        "disaster_type": report.disaster_type,
        "severity": report.severity,
        "description": report.description,
        "evidence_url": report.evidence_url
    }
    v_res = verify_citizen_report(payload, db, current_report_id=report.id)

    report.verification_status = v_res["verification_status"]
    report.ai_confidence = v_res["ai_confidence"]
    report.confidence = v_res["ai_confidence"]
    report.ai_reason = v_res["ai_reason"]
    report.evidence_score = v_res["evidence_score"]
    report.location_score = v_res["location_score"]
    report.consistency_score = v_res["consistency_score"]
    report.duplicate_score = v_res["duplicate_score"]
    report.image_analysis_available = v_res["image_analysis_available"]
    report.image_analysis_summary = v_res["image_analysis_summary"]
    report.verified_at = v_res["verified_at"]
    report.verification_model = v_res["verification_model"]
    report.verification_version = v_res["verification_version"]
    report.corroboration_count = v_res["corroboration_count"]
    report.corroborated_sachet_alert_id = v_res["corroborated_sachet_alert_id"]
    report.status = "APPROVED" if v_res["verification_status"] == "AI_VERIFIED" else ("REJECTED" if v_res["verification_status"] == "AI_REJECTED" else "PENDING")
    report.updated_at = datetime.utcnow()

    audit = AuditLog(
        user_email=current_user.email if current_user else "ai_system",
        action="AI_REVERIFY_REPORT",
        details=f"Report #{id} re-verified as {v_res['verification_status']} (confidence: {v_res['ai_confidence']:.2f})."
    )
    db.add(audit)
    db.commit()
    db.refresh(report)
    return serialize_user_disaster(report)

@router.patch("/user-reported/{id}/approve", response_model=UserDisasterReportResponse)
@router_direct.patch("/user-reported/{id}/approve", response_model=UserDisasterReportResponse)
def approve_user_report(
    id: int,
    mod_in: Optional[ModerationRequest] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(UserReport).filter(UserReport.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Disaster report not found")
    
    reviewer = current_user.email if current_user else "Operator"
    report.status = "APPROVED"
    report.verification_status = "AI_VERIFIED"
    report.reviewed_by = reviewer
    report.reviewed_at = datetime.utcnow()
    report.updated_at = datetime.utcnow()
    if mod_in and mod_in.notes:
        report.review_notes = mod_in.notes
        report.ai_reason = f"Operator Override Approved: {mod_in.notes}"
    db.commit()
    db.refresh(report)

    audit = AuditLog(
        user_email=reviewer,
        action="APPROVE_CITIZEN_REPORT_OVERRIDE",
        details=f"Operator approved citizen report ID {id} ({report.disaster_type} at {report.location_name})."
    )
    db.add(audit)
    db.commit()
    return serialize_user_disaster(report)

@router.patch("/user-reported/{id}/reject", response_model=UserDisasterReportResponse)
@router_direct.patch("/user-reported/{id}/reject", response_model=UserDisasterReportResponse)
def reject_user_report(
    id: int,
    mod_in: Optional[ModerationRequest] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(UserReport).filter(UserReport.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Disaster report not found")
    
    reviewer = current_user.email if current_user else "Operator"
    report.status = "REJECTED"
    report.verification_status = "AI_REJECTED"
    report.reviewed_by = reviewer
    report.reviewed_at = datetime.utcnow()
    report.updated_at = datetime.utcnow()
    if mod_in and mod_in.notes:
        report.review_notes = mod_in.notes
        report.ai_reason = f"Operator Override Rejected: {mod_in.notes}"
    db.commit()
    db.refresh(report)

    audit = AuditLog(
        user_email=reviewer,
        action="REJECT_CITIZEN_REPORT",
        details=f"Rejected citizen report ID {id}. Reason: {report.review_notes or 'Unspecified'}"
    )
    db.add(audit)
    db.commit()
    return serialize_user_disaster(report)

def _patch_user_report(id: int, patch_in: UserDisasterReportPatch, db: Session):
    report = db.query(UserReport).filter(UserReport.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Disaster report not found")
    
    if patch_in.type or patch_in.disaster_type or patch_in.hazard_type:
        report.disaster_type = patch_in.type or patch_in.disaster_type or patch_in.hazard_type
    if patch_in.severity:
        report.severity = patch_in.severity.upper()
    if patch_in.radiusKm is not None:
        report.radius_km = float(patch_in.radiusKm)
    elif patch_in.radius_km is not None:
        report.radius_km = float(patch_in.radius_km)
    if patch_in.description is not None:
        report.description = patch_in.description
    if patch_in.status:
        report.status = patch_in.status
    if patch_in.estimatedRoadImpact or patch_in.estimated_road_impact:
        report.estimated_road_impact = patch_in.estimatedRoadImpact or patch_in.estimated_road_impact
    ev = getattr(patch_in, "evidenceUrl", None) or getattr(patch_in, "evidence_url", None) or getattr(patch_in, "image_url", None)
    if ev:
        report.evidence_url = ev
    if getattr(patch_in, "review_notes", None):
        report.review_notes = patch_in.review_notes

    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return serialize_user_disaster(report)

@router.patch("/{id}", response_model=UserDisasterReportResponse)
def patch_disaster_report_api(
    id: int,
    patch_in: UserDisasterReportPatch,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db),
):
    """Update a user-reported disaster (authorized roles only)."""
    return _patch_user_report(id, patch_in, db)

@router_direct.patch("/{id}", response_model=UserDisasterReportResponse)
def patch_disaster_report_direct(
    id: int,
    patch_in: UserDisasterReportPatch,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db),
):
    return _patch_user_report(id, patch_in, db)

def _delete_user_report(id: int, db: Session):
    report = db.query(UserReport).filter(UserReport.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Disaster report not found")
    
    # Safe cleanup of uploaded evidence file
    if report.evidence_url and "/uploads/reports/" in report.evidence_url:
        try:
            fname = report.evidence_url.split("/uploads/reports/")[-1]
            fpath = UPLOAD_DIR / fname
            if fpath.exists():
                fpath.unlink()
        except Exception as e:
            print(f"[CLEANUP] Could not delete evidence file: {e}")

    db.delete(report)
    db.commit()
    return {"status": "success", "message": f"Disaster report {id} permanently removed"}

@router.delete("/{id}")
def delete_disaster_report_api(
    id: int,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db),
):
    """Delete a user-reported disaster (admin / state_gov / logistics_operator)."""
    return _delete_user_report(id, db)

@router_direct.delete("/{id}")
def delete_disaster_report_direct(
    id: int,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db),
):
    return _delete_user_report(id, db)

# --- 2. SACHET SYNC STATUS ---

@router.get("/status")
@router.get("/sachet-status")
def get_sachet_status_api(db: Session = Depends(get_db)):
    """Provides official SACHET NDMA connection status, last sync timestamp, and active alert count."""
    return get_sachet_sync_status(db)

@router_direct.get("/status")
@router_direct.get("/sachet-status")
def get_sachet_status_direct(db: Session = Depends(get_db)):
    return get_sachet_sync_status(db)

# --- 3. SACHET OFFICIAL ALERTS ---

@router.get("/live")
@router_direct.get("/live")
def list_live_disaster_alerts(
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Active official SACHET alerts with source badges and freshness metadata."""
    return get_active_sachet_alerts(db, state=state)

@router.get("")
@router_direct.get("")
def list_active_disaster_alerts(
    state: Optional[str] = None,
    format: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retrieve normalized official live SACHET NDMA disaster alerts as a single source of truth."""
    active_alerts = get_active_sachet_alerts(db, state=state)
    if format == "list":
        return active_alerts

    mapped_count = sum(1 for a in active_alerts if a.get("has_valid_location"))
    unmapped_count = len(active_alerts) - mapped_count
    return {
        "total": len(active_alerts),
        "active": len(active_alerts),
        "mapped": mapped_count,
        "unmapped": unmapped_count,
        "disasters": active_alerts,
    }

# Sync endpoints (must be before /{alert_id})
_last_sync_at: Dict[str, float] = {"ts": 0.0}
_SYNC_COOLDOWN_SEC = 15

def _run_sachet_sync(db: Session, force: bool = False):
    import time as _time
    now = _time.time()
    if not force and (now - _last_sync_at["ts"]) < _SYNC_COOLDOWN_SEC:
        status = get_sachet_sync_status(db)
        return {
            "status": "rate_limited",
            "connection_status": status.get("statusBadge") or status.get("status"),
            "statusCode": status.get("statusCode"),
            "synced_count": 0,
            "error": f"Sync cooldown active — retry after {_SYNC_COOLDOWN_SEC}s",
            "cooldown_sec": _SYNC_COOLDOWN_SEC,
            **{k: status.get(k) for k in ("activeAlertCount", "etagPresent", "lastSuccessfulFetch")},
        }
    _last_sync_at["ts"] = now
    return sync_sachet_ndma_alerts(db)

@router.post("/sync")
@router.post("/sachet/sync")
def trigger_sachet_sync(
    force: bool = False,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually triggers SACHET NDMA feed synchronization (ETag-aware)."""
    return _run_sachet_sync(db, force=force)

@router_direct.post("/sync")
@router_direct.post("/sachet/sync")
def trigger_sachet_sync_direct(
    force: bool = False,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return _run_sachet_sync(db, force=force)

@router.get("/sachet/sync")
@router_direct.get("/sachet/sync")
def get_sachet_sync_result(db: Session = Depends(get_db)):
    """Return latest SACHET sync status without forcing a new network poll."""
    return get_sachet_sync_status(db)

@router.post("/route")
@router_direct.post("/route")
def disasters_for_route(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Filter disasters relative to a route geometry.
    Body: { "coordinates": [[lon, lat], ...], "buffer_km": 12 }
    """
    coords = payload.get("coordinates") or payload.get("geometry_coordinates") or []
    buffer_km = float(payload.get("buffer_km") or 12.0)
    if not isinstance(coords, list) or len(coords) < 2:
        raise HTTPException(status_code=400, detail="Route coordinates [[lon,lat],...] with at least 2 points required")
    return filter_alerts_for_route(db, coords, buffer_km=buffer_km)

@router.get("/{alert_id}", response_model=DisasterAlertResponse)
@router_direct.get("/{alert_id}")
def get_alert_details(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(DisasterAlert).filter(DisasterAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Disaster alert not found")
    return alert
