from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Road
from ..schemas import RoadResponse

router = APIRouter(prefix="/api/roads", tags=["Roads & Highways"])

@router.get("", response_model=List[RoadResponse])
def get_all_roads(state: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Road)
    if state and state.lower() != "all":
        query = query.filter(Road.state.ilike(f"%{state}%"))
    return query.all()

@router.get("/{road_id}", response_model=RoadResponse)
def get_road_by_id(road_id: int, db: Session = Depends(get_db)):
    road = db.query(Road).filter(Road.id == road_id).first()
    if not road:
        raise HTTPException(status_code=404, detail="Road corridor not found")
    return road
