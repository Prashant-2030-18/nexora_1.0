import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any
from ..database import get_db
from ..models import SimulationResult, AuditLog
from ..schemas import ScenarioRequest, ScenarioResult
from ..services.simulation_engine import run_what_if_simulation
from ..auth import get_current_user, User

router = APIRouter(prefix="/api/simulation", tags=["What-If Scenario Simulator"])

@router.post("", response_model=ScenarioResult)
def execute_simulation(
    req: ScenarioRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    params = {
        "road_name": req.road_name,
        "hub_location": req.hub_location,
        "hub_capacity": req.hub_capacity,
        "start_point": req.start_point,
        "end_point": req.end_point,
        "distance_km": req.distance_km
    }

    result = run_what_if_simulation(db, req.scenario_type, params)
    
    # Save simulation history in DB
    sim_record = SimulationResult(
        scenario_type=req.scenario_type,
        input_params=json.dumps(params),
        results=json.dumps(result),
        user_id=current_user.id if current_user else None
    )
    db.add(sim_record)
    
    if current_user:
        audit = AuditLog(
            user_email=current_user.email,
            action="RUN_SIMULATION",
            details=f"Ran '{req.scenario_type}' simulation scenario."
        )
        db.add(audit)

    db.commit()
    return result

@router.get("/history")
def get_simulation_history(db: Session = Depends(get_db)):
    records = db.query(SimulationResult).order_by(SimulationResult.id.desc()).limit(10).all()
    out = []
    for r in records:
        out.append({
            "id": r.id,
            "scenario_type": r.scenario_type,
            "input_params": json.loads(r.input_params),
            "results": json.loads(r.results),
            "created_at": r.created_at
        })
    return out
