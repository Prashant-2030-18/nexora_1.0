from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import AICopilotQuery, AICopilotResponse
from ..services.ai_copilot import ask_copilot

router = APIRouter(prefix="/api/ai", tags=["NER Intelligence Copilot"])

@router.post("/query", response_model=AICopilotResponse)
def execute_ai_query(req: AICopilotQuery, db: Session = Depends(get_db)):
    nav_ctx = {
        "current_location": req.current_location,
        "destination": req.destination,
        "active_route": req.active_route,
        "current_speed": req.current_speed,
        "gps_accuracy": req.gps_accuracy,
        "eta": req.eta,
        "remaining_distance_km": req.remaining_distance_km,
        "route_risk": req.route_risk,
        "hazards": req.hazards,
        "navigation_state": req.navigation_state,
    }
    res = ask_copilot(
        query=req.query,
        db=db,
        context_state=req.context_state or "All",
        nav_context=nav_ctx
    )
    return res
