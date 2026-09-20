from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Alert
from ..schemas import AlertResponse

router = APIRouter(prefix="/api/notifications", tags=["Notifications & Alerts"])

@router.get("", response_model=List[AlertResponse])
def get_notifications(
    state: Optional[str] = None,
    unread_only: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    query = db.query(Alert)
    if state and state.lower() != "all":
        query = query.filter(Alert.state.in_([state, "All"]))
    if unread_only:
        query = query.filter(Alert.is_read == False)
    return query.order_by(Alert.id.desc()).all()

@router.post("/{alert_id}/read")
def mark_notification_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    return {"status": "success", "message": f"Alert {alert_id} marked as read"}

@router.post("/mark-all-read")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    db.query(Alert).update({Alert.is_read: True})
    db.commit()
    return {"status": "success", "message": "All alerts marked as read"}
