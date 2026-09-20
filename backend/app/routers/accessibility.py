from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from ..database import get_db
from ..models import District
from ..services.accessibility_engine import get_all_accessibility_scores, compute_district_accessibility

router = APIRouter(prefix="/api/accessibility", tags=["Accessibility Intelligence"])

@router.get("")
def get_accessibility_index(
    state: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    db: Session = Depends(get_db)
):
    scores = get_all_accessibility_scores(db, state_filter=state)
    
    # Calculate state averages for available scores
    state_scores = {}
    for r in scores:
        st = r.get("state_name", "Unknown")
        sc = r.get("score")
        if sc is not None:
            if st not in state_scores:
                state_scores[st] = []
            state_scores[st].append(sc)
            
    state_summary = [
        {"state": k, "avg_accessibility": round(sum(v) / len(v), 1), "district_count": len(v)}
        for k, v in state_scores.items()
    ]
    state_summary.sort(key=lambda x: x["avg_accessibility"])

    # Apply sort order: asc = critical first (lowest score), desc = highest score first
    if sort_order and sort_order.lower() == "desc":
        scores.sort(key=lambda x: (x.get("score") is None, -(x.get("score") or 0.0)))
    else:
        scores.sort(key=lambda x: (x.get("score") is None, x.get("score") or 0.0))

    return {
        "districts_scored_count": len(scores),
        "state_averages": state_summary,
        "districts": scores,
        "methodology": "MDoNER Multi-Factor Deterministic Matrix (Road Density 25%, Highway 15%, Rail 10%, Air 10%, Logistics 15%, Elevation 10%, Monsoon 5%, Area 10%)"
    }

@router.get("/{district_id}")
def get_district_accessibility(district_id: int, db: Session = Depends(get_db)):
    district = db.query(District).filter(District.id == district_id).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    return compute_district_accessibility(district)
