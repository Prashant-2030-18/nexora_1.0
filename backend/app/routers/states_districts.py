from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import State, District
from ..schemas import StateResponse, DistrictResponse

router = APIRouter(prefix="/api", tags=["States & Districts"])

@router.get("/states", response_model=List[StateResponse])
def get_all_states(db: Session = Depends(get_db)):
    return db.query(State).all()

@router.get("/districts", response_model=List[DistrictResponse])
def get_districts(
    state_id: Optional[int] = None,
    state_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(District)
    if state_id:
        query = query.filter(District.state_id == state_id)
    elif state_name and state_name.lower() != "all":
        query = query.join(State).filter(State.name.ilike(f"%{state_name}%"))
    return query.all()

@router.get("/districts/{district_id}", response_model=DistrictResponse)
def get_district_by_id(district_id: int, db: Session = Depends(get_db)):
    district = db.query(District).filter(District.id == district_id).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    return district
