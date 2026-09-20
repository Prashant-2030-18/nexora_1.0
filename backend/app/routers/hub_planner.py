from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import HubPlannerRequest, HubPlannerResponse
from ..services.hub_evaluator import evaluate_hub_location

router = APIRouter(prefix="/api/hub-planner", tags=["AI Logistics Hub Planner"])

@router.post("/evaluate", response_model=HubPlannerResponse)
def evaluate_hub(req: HubPlannerRequest, db: Session = Depends(get_db)):
    res = evaluate_hub_location(
        db=db,
        lat=req.latitude,
        lng=req.longitude,
        target_capacity=req.target_capacity_mt or 5000.0
    )
    return res
