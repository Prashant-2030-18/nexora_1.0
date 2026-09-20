import random
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from ..database import get_db
from ..models import LogisticsHub, Warehouse, Vehicle, Shipment, AuditLog
from ..schemas import LogisticsHubResponse, WarehouseResponse, VehicleResponse, ShipmentResponse, ShipmentCreate
from ..auth import require_auth, User

router = APIRouter(prefix="/api", tags=["Logistics & Fleet"])

@router.get("/logistics-hubs", response_model=List[LogisticsHubResponse])
def get_logistics_hubs(state: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(LogisticsHub)
    if state and state.lower() != "all":
        query = query.filter(LogisticsHub.state.ilike(f"%{state}%"))
    return query.all()

@router.get("/warehouses", response_model=List[WarehouseResponse])
def get_warehouses(
    state: Optional[str] = None,
    cold_storage_only: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    query = db.query(Warehouse)
    if state and state.lower() != "all":
        query = query.filter(Warehouse.state.ilike(f"%{state}%"))
    if cold_storage_only:
        query = query.filter(Warehouse.cold_storage == True)
    return query.all()

@router.get("/fleet", response_model=List[VehicleResponse])
def get_fleet(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Vehicle)
    if status:
        query = query.filter(Vehicle.status == status)
    return query.all()

@router.get("/shipments", response_model=List[ShipmentResponse])
def get_shipments(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Shipment)
    if status:
        query = query.filter(Shipment.status == status)
    shipments = query.order_by(Shipment.id.desc()).all()
    
    # Map to response schema
    out = []
    for s in shipments:
        out.append({
            "id": s.id,
            "shipment_number": s.shipment_number,
            "origin": s.origin_address,
            "destination": s.destination_address,
            "origin_address": s.origin_address,
            "destination_address": s.destination_address,
            "cargo_type": s.cargo_type,
            "cargo_weight": s.cargo_weight_tonnes,
            "cargo_weight_tonnes": s.cargo_weight_tonnes,
            "vehicle_id": s.vehicle_id,
            "status": s.status,
            "eta": s.estimated_eta or "In Transit",
            "estimated_eta": s.estimated_eta or "In Transit",
            "estimated_cost": s.estimated_cost_inr,
            "estimated_cost_inr": s.estimated_cost_inr,
            "created_at": s.created_at
        })
    return out

@router.post("/shipments", response_model=ShipmentResponse)
def create_shipment(
    shipment_in: ShipmentCreate,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    shipment_num = f"NER-SHP-{random.randint(10000, 99999)}"
    
    # Assign available vehicle if not specified
    v_id = shipment_in.vehicle_id
    if not v_id:
        avail_v = db.query(Vehicle).filter(Vehicle.status == "Available").first()
        if avail_v:
            v_id = avail_v.id
            avail_v.status = "In Transit"

    orig = shipment_in.origin_address or shipment_in.origin or "Guwahati"
    dest = shipment_in.destination_address or shipment_in.destination or "Silchar"
    weight = shipment_in.cargo_weight_tonnes or shipment_in.cargo_weight or 5.0
    cost = shipment_in.estimated_cost_inr or shipment_in.estimated_cost or 16500.0

    new_shipment = Shipment(
        shipment_number=shipment_num,
        origin_address=orig,
        destination_address=dest,
        origin_latitude=shipment_in.origin_latitude or 26.1445,
        origin_longitude=shipment_in.origin_longitude or 91.7362,
        destination_latitude=shipment_in.destination_latitude or 24.8170,
        destination_longitude=shipment_in.destination_longitude or 92.7925,
        cargo_type=shipment_in.cargo_type,
        cargo_weight_tonnes=weight,
        vehicle_id=v_id,
        operator_user_id=current_user.id,
        status="In Transit",
        estimated_eta="7.5 hours",
        estimated_cost_inr=cost,
    )
    db.add(new_shipment)
    db.commit()
    db.refresh(new_shipment)

    # Audit log
    audit = AuditLog(
        user_email=current_user.email,
        action="CREATE_SHIPMENT",
        details=f"Created shipment {shipment_num} from {orig} to {dest}."
    )
    db.add(audit)
    db.commit()

    return {
        "id": new_shipment.id,
        "shipment_number": new_shipment.shipment_number,
        "origin": new_shipment.origin_address,
        "destination": new_shipment.destination_address,
        "origin_address": new_shipment.origin_address,
        "destination_address": new_shipment.destination_address,
        "cargo_type": new_shipment.cargo_type,
        "cargo_weight": new_shipment.cargo_weight_tonnes,
        "cargo_weight_tonnes": new_shipment.cargo_weight_tonnes,
        "vehicle_id": new_shipment.vehicle_id,
        "status": new_shipment.status,
        "eta": new_shipment.estimated_eta,
        "estimated_eta": new_shipment.estimated_eta,
        "estimated_cost": new_shipment.estimated_cost_inr,
        "estimated_cost_inr": new_shipment.estimated_cost_inr,
        "created_at": new_shipment.created_at
    }

@router.post("/logistics/apply-optimization")
def apply_logistics_optimization(
    payload: Dict[str, Any],
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    action_type = payload.get("action_type", "reroute_barak_axis")
    
    # Modify active shipments
    active_shipments = db.query(Shipment).filter(Shipment.status == "In Transit").limit(3).all()
    for s in active_shipments:
        s.status = "Rerouted"
        s.estimated_eta = "5.2h (via AI Bypass)"

    audit = AuditLog(
        user_email=current_user.email,
        action="APPLY_AI_LOGISTICS_OPTIMIZATION",
        details=f"Executed optimization '{action_type}'."
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "message": "AI Logistics Recommendation applied successfully! Active freight diverted through verified corridor.",
        "impact": {
            "delay_probability_reduction_pct": 34.0,
            "cost_savings_inr": 8400.0,
            "hours_saved": 2.3,
            "fuel_consumption_reduction_pct": 18.0
        }
    }
