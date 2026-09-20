from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import InfrastructureGap
from ..schemas import InfrastructureGapResponse

router = APIRouter(prefix="/api/infrastructure-gaps", tags=["Infrastructure Gap Intelligence"])

@router.get("", response_model=List[InfrastructureGapResponse])
def get_infrastructure_gaps(
    state: Optional[str] = None,
    severity: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(InfrastructureGap)
    if state and state.lower() != "all":
        query = query.filter(InfrastructureGap.state.ilike(f"%{state}%"))
    if severity:
        query = query.filter(InfrastructureGap.severity == severity)
    return query.all()
