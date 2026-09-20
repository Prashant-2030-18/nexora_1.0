from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import UserReport, AuditLog
from ..schemas import UserReportCreate, UserReportModerate, UserReportResponse
from ..services.citizen_report_verifier import verify_citizen_report
from ..auth import get_current_user, require_roles, User

router = APIRouter(prefix="/api/user-reports", tags=["Citizen Disaster Reporting"])

@router.post("", response_model=UserReportResponse)
def submit_disaster_report(
    report_in: UserReportCreate,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allows citizens and ground personnel to submit ground-truth disaster reports.
    Automatically evaluated by the NEXORA AI verification engine.
    """
    try:
        lat = float(report_in.latitude)
        lon = float(report_in.longitude)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Latitude and longitude must be valid numeric values.")

    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        raise HTTPException(status_code=400, detail=f"Coordinates out of valid global range (-90 to +90 lat, -180 to +180 lon): ({lat}, {lon})")

    d_type = report_in.disaster_type or report_in.hazard_type or "Other"
    sev = (report_in.severity or "MODERATE").upper()
    loc_name = report_in.location_name or f"Near {lat:.4f}, {lon:.4f}"
    evidence = report_in.evidence_url or report_in.image_url

    # 1. Run AI Verification
    payload = {
        "latitude": lat,
        "longitude": lon,
        "location_name": loc_name,
        "disaster_type": d_type,
        "severity": sev,
        "description": report_in.description or "",
        "evidence_url": evidence,
        "reporter_user_id": current_user.id if current_user else None,
        "reporter_phone": report_in.reporter_phone or report_in.contact_phone or report_in.contact_info,
        "gps_accuracy": report_in.gps_accuracy
    }
    v_res = verify_citizen_report(payload, db)

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
        reporter_name=report_in.reporter_name or "Citizen Reporter",
        reporter_phone=report_in.reporter_phone or report_in.contact_phone or report_in.contact_info,
        reporter_email=report_in.reporter_email or (current_user.email if current_user else None),
        reporter_user_id=current_user.id if current_user else None,
        disaster_type=d_type,
        severity=sev,
        latitude=lat,
        longitude=lon,
        location_name=loc_name,
        description=report_in.description or "",
        evidence_url=evidence,
        status=sys_status,
        confidence=v_res["ai_confidence"],
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
        evidence_hash=v_res.get("evidence_hash") or report_in.evidence_hash,
        gps_accuracy=report_in.gps_accuracy,
        road_impact=v_res.get("road_impact", "NONE"),
        unique_evidence_count=v_res.get("unique_evidence_count", 0),
        expires_at=v_res.get("expires_at"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    new_report.signals_checklist = v_res.get("signals_checklist")

    # Log audit
    audit = AuditLog(
        user_email=current_user.email if current_user else "anonymous_citizen",
        action="CITIZEN_DISASTER_REPORT_AI",
        details=f"Submitted report #{new_report.id} ({d_type} at {loc_name}) verified as {v_res['verification_status']} (confidence: {v_res['ai_confidence']:.2f})."
    )
    db.add(audit)
    db.commit()

    return new_report

@router.get("/verified", response_model=List[UserReportResponse])
def get_verified_reports(db: Session = Depends(get_db)):
    """
    Returns only verified user reports (AI_SUPPORTED / AI_VERIFIED / APPROVED / Verified).
    These are used by the GIS map and route risk calculation engine.
    """
    return db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.verification_status.in_(["AI_SUPPORTED", "AI_VERIFIED"])) | (UserReport.status.in_(["APPROVED", "Verified", "Active"]))
    ).order_by(UserReport.created_at.desc()).all()

@router.get("/pending", response_model=List[UserReportResponse])
def get_pending_reports(
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db)
):
    """Operator/Admin endpoint to list unreviewed advisory reports."""
    return db.query(UserReport).filter(
        UserReport.status != "DELETED",
        (UserReport.verification_status == "AI_REVIEW") | (UserReport.status.in_(["PENDING", "Pending Verification"]))
    ).order_by(UserReport.created_at.desc()).all()

@router.get("", response_model=List[UserReportResponse])
def list_all_reports(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(UserReport).filter(UserReport.status != "DELETED")
    if status_filter and status_filter.upper() != "ALL":
        sf = status_filter.upper()
        if sf in ["AI_SUPPORTED", "AI_VERIFIED", "APPROVED", "VERIFIED", "ACTIVE"]:
            q = q.filter((UserReport.verification_status.in_(["AI_SUPPORTED", "AI_VERIFIED"])) | (UserReport.status.in_(["APPROVED", "Verified", "Active"])))
        elif sf in ["AI_REVIEW", "PENDING", "PENDING VERIFICATION"]:
            q = q.filter((UserReport.verification_status == "AI_REVIEW") | (UserReport.status.in_(["PENDING", "Pending Verification"])))
        elif sf in ["AI_UNSUPPORTED", "AI_REJECTED", "REJECTED"]:
            q = q.filter((UserReport.verification_status.in_(["AI_UNSUPPORTED", "AI_REJECTED"])) | (UserReport.status.in_(["REJECTED", "Rejected"])))
        elif sf in ["SACHET_CORROBORATED", "CORROBORATED"]:
            q = q.filter((UserReport.verification_status == "SACHET_CORROBORATED") | (UserReport.status == "CORROBORATED"))
        else:
            q = q.filter((UserReport.verification_status == status_filter) | (UserReport.status == status_filter))
    return q.order_by(UserReport.created_at.desc()).all()

@router.put("/{report_id}/moderate", response_model=UserReportResponse)
def moderate_report(
    report_id: int,
    mod_in: UserReportModerate,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db)
):
    """
    Admin/operator moderation override: changes status to 'APPROVED', 'REJECTED', or 'Resolved'.
    """
    report = db.query(UserReport).filter(UserReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    new_status = mod_in.status
    if new_status in ["Verified", "APPROVED", "AI_VERIFIED"]:
        new_status = "APPROVED"
        report.verification_status = "AI_VERIFIED"
    elif new_status in ["Rejected", "REJECTED", "AI_REJECTED"]:
        new_status = "REJECTED"
        report.verification_status = "AI_REJECTED"
    else:
        report.verification_status = "AI_REVIEW"

    report.status = new_status
    report.review_notes = mod_in.review_notes
    if mod_in.review_notes:
        report.ai_reason = f"Operator Override ({new_status}): {mod_in.review_notes}"
    report.reviewed_by = current_user.email
    report.reviewed_by_user_id = current_user.id
    report.reviewed_at = datetime.utcnow()
    report.updated_at = datetime.utcnow()

    audit = AuditLog(
        user_email=current_user.email,
        action="MODERATE_DISASTER_REPORT_OVERRIDE",
        details=f"Set report ID {report_id} to '{new_status}'. Notes: {mod_in.review_notes}"
    )
    db.add(audit)
    db.commit()
    db.refresh(report)
    return report

@router.delete("/{report_id}")
def delete_user_report(
    report_id: int,
    current_user: User = Depends(require_roles(["admin", "state_gov", "logistics_operator"])),
    db: Session = Depends(get_db)
):
    report = db.query(UserReport).filter(UserReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()
    return {"status": "success", "message": f"Report {report_id} permanently removed"}
