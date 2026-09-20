from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from datetime import datetime
from ..database import get_db
from ..models import State, District, Road, LogisticsHub, Incident, Shipment, Alert, InfrastructureGap, DisasterAlert
from ..services.accessibility_engine import compute_district_accessibility

router = APIRouter(prefix="/api/analytics", tags=["Analytics & KPIs"])

@router.get("/kpis")
def get_dashboard_kpis(state: Optional[str] = None, db: Session = Depends(get_db)):
    states_count = db.query(State).count()
    
    dist_query = db.query(District)
    if state and state.lower() != "all":
        dist_query = dist_query.join(State).filter(State.name.ilike(f"%{state}%"))
    districts = dist_query.all()
    
    # Calculate average accessibility across districts
    valid_scores = []
    for d in districts:
        sc = compute_district_accessibility(d).get("score")
        if sc is not None:
            valid_scores.append(sc)
    avg_accessibility = round(sum(valid_scores) / max(1, len(valid_scores)), 1) if valid_scores else 50.0

    hub_query = db.query(LogisticsHub)
    if state and state.lower() != "all":
        hub_query = hub_query.filter(LogisticsHub.state.ilike(f"%{state}%"))
    active_hubs = hub_query.count()

    inc_query = db.query(Incident).filter(Incident.status == "Active")
    if state and state.lower() != "all":
        inc_query = inc_query.filter(Incident.state.ilike(f"%{state}%"))
    active_incidents = inc_query.count()

    # Active official disaster alerts (single source of truth)
    now = datetime.utcnow()
    active_disasters = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
        (DisasterAlert.expires_at == None) | (DisasterAlert.expires_at >= now)
    ).count()

    shipments_in_transit = db.query(Shipment).filter(Shipment.status == "In Transit").count()
    
    alert_query = db.query(Alert).filter(Alert.is_read == False, Alert.severity.in_(["Critical", "High"]))
    if state and state.lower() != "all":
        alert_query = alert_query.filter(Alert.state.in_([state, "All"]))
    critical_alerts = alert_query.count()

    at_risk_routes = db.query(Road).filter(Road.condition != "Operational").count()
    
    gap_query = db.query(InfrastructureGap)
    if state and state.lower() != "all":
        gap_query = gap_query.filter(InfrastructureGap.state.ilike(f"%{state}%"))
    infra_gaps = gap_query.count()

    return {
        "states_count": states_count,
        "average_accessibility_score": avg_accessibility,
        "active_logistics_hubs": active_hubs,
        "active_incidents": active_disasters,
        "active_disasters": active_disasters,
        "deliveries_in_transit": shipments_in_transit,
        "critical_alerts": critical_alerts,
        "at_risk_routes": at_risk_routes,
        "infrastructure_gaps": infra_gaps,
        "ai_recommendation": "Active monsoon weather patterns in hill corridors. Safest routing strategy recommended for heavy commercial transport."
    }

@router.get("/charts")
def get_analytics_charts(state: Optional[str] = None, db: Session = Depends(get_db)):
    # State accessibility comparison
    states = db.query(State).all()
    state_chart = []
    for s in states:
        dists = db.query(District).filter(District.state_id == s.id).all()
        scs = [compute_district_accessibility(d).get("score") for d in dists]
        scs = [x for x in scs if x is not None]
        avg_s = round(sum(scs) / max(1, len(scs)), 1) if scs else 50.0
        state_chart.append({
            "name": s.name,
            "code": s.code,
            "accessibility": avg_s,
            "population": round((s.population or 1000000) / 100000, 1)
        })

    # Incident severity distribution
    incidents = db.query(Incident).all()
    sev_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    type_counts = {}
    for inc in incidents:
        sev_counts[inc.severity] = sev_counts.get(inc.severity, 0) + 1
        type_counts[inc.type] = type_counts.get(inc.type, 0) + 1

    incident_chart = [{"severity": k, "count": v} for k, v in sev_counts.items()]
    incident_types = [{"type": k, "count": v} for k, v in type_counts.items()]

    monthly_trends = [
        {"month": "Jan", "avg_delivery_hours": 12.4, "disruptions": 4, "transport_cost_idx": 100},
        {"month": "Feb", "avg_delivery_hours": 11.8, "disruptions": 3, "transport_cost_idx": 98},
        {"month": "Mar", "avg_delivery_hours": 12.1, "disruptions": 5, "transport_cost_idx": 102},
        {"month": "Apr", "avg_delivery_hours": 13.5, "disruptions": 8, "transport_cost_idx": 109},
        {"month": "May", "avg_delivery_hours": 15.2, "disruptions": 14, "transport_cost_idx": 118},
        {"month": "Jun", "avg_delivery_hours": 18.9, "disruptions": 26, "transport_cost_idx": 136},
        {"month": "Jul", "avg_delivery_hours": 21.4, "disruptions": 38, "transport_cost_idx": 148},
        {"month": "Aug", "avg_delivery_hours": 19.6, "disruptions": 31, "transport_cost_idx": 141},
        {"month": "Sep", "avg_delivery_hours": 16.0, "disruptions": 18, "transport_cost_idx": 124},
    ]

    return {
        "state_comparison": state_chart,
        "incident_distribution": incident_chart,
        "incident_types": incident_types,
        "monthly_trends": monthly_trends
    }

@router.get("/priority-development-areas")
def get_priority_development_areas(db: Session = Depends(get_db)):
    """Rank districts with lowest accessibility for priority development intervention."""
    districts = db.query(District).all()
    scored = []
    for d in districts:
        acc = compute_district_accessibility(d)
        scored.append((d, acc))

    # Sort by accessibility score ascending (lowest score = highest priority)
    scored.sort(key=lambda x: (x[1].get("score") is None, x[1].get("score") or 0.0))

    priority_list = []
    for d, acc in scored[:8]:
        st = d.state_rel.name if d.state_rel else "NER"
        score = acc.get("score") or 35.0
        priority_list.append({
            "district": d.name,
            "state": st,
            "accessibility_score": score,
            "road_connectivity": round(min(100.0, (d.road_density_km_per_sq_km or 0.5) * 50.0), 1),
            "railway_access": round(max(0.0, 100.0 - (d.distance_to_nearest_railway_km or 100.0) * 0.5), 1),
            "logistics_access": min(100.0, (d.active_warehouse_count or 0) * 20.0),
            "priority_tier": "Tier 1 - Immediate PM-DevINE Intervention" if score < 42 else "Tier 2 - Strategic Expansion",
            "recommended_focus": "Multi-modal railhead link & solar cold storage facility" if (d.distance_to_nearest_railway_km or 0) > 80 else "All-weather double lane highway upgrade"
        })
    return priority_list
