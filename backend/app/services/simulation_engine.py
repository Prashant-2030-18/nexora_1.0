import json
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models import SimulationResult

def run_what_if_simulation(db: Session, scenario_type: str, params: Dict[str, Any], user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Executes what-if scenario models.
    All outputs are explicitly flagged as hypothetical simulations.
    Results are persisted to the simulation_results table with is_hypothetical=True.
    """
    disclaimer_text = "SIMULATION RESULT — Hypothetical scenario, not a confirmed government project."

    if scenario_type == "close_highway":
        road_name = params.get("road_name", "NH-6 (Shillong-Silchar Corridor)")
        
        affected_districts = ["East Khasi Hills", "West Jaintia Hills", "East Jaintia Hills", "Cachar (Silchar)", "Karimganj", "Hailakandi", "Aizawl"]
        travel_time_increase_pct = 68.5
        cost_increase_pct = 42.0
        shipments_impacted = 28
        accessibility_drop = -18.4

        before_metrics = {
            "average_transit_time_hrs": 6.5,
            "average_fuel_cost_inr": 4800,
            "corridor_reliability_index": 82.0,
            "freight_volume_capacity_tpd": 4500
        }
        after_metrics = {
            "average_transit_time_hrs": 11.2,
            "average_fuel_cost_inr": 7900,
            "corridor_reliability_index": 38.0,
            "freight_volume_capacity_tpd": 1200
        }

        ai_strategic_advice = (
            f"Closure of {road_name} creates a severe bottleneck severing Southern Assam, Mizoram, and Tripura from the national grid. "
            "Model recommends immediate activation of the Lumding-Haflong (NH-27) alternate corridor and staging emergency reserves in Silchar."
        )

        res = {
            "scenario_type": "close_highway",
            "summary": f"Simulated complete closure of strategic corridor: {road_name}",
            "affected_districts": affected_districts,
            "travel_time_change_pct": travel_time_increase_pct,
            "cost_change_pct": cost_increase_pct,
            "accessibility_change_points": accessibility_drop,
            "shipments_impacted": shipments_impacted,
            "economic_benefit_inr": "- ₹1.45 Crore / Day (Estimated Disruption Loss)",
            "before_metrics": before_metrics,
            "after_metrics": after_metrics,
            "ai_strategic_advice": ai_strategic_advice,
            "is_hypothetical": True,
            "disclaimer": disclaimer_text
        }

    elif scenario_type == "new_logistics_hub":
        hub_loc = params.get("hub_location", "Silchar Multi-Modal Terminal")
        capacity = params.get("hub_capacity", 5000.0)

        affected_districts = ["Cachar", "Hailakandi", "Karimganj", "Dima Hasao", "Kolasib", "Aizawl", "North Tripura"]
        travel_time_decrease_pct = -34.5
        cost_decrease_pct = -26.0
        accessibility_gain = +22.8
        shipments_benefited = 64

        before_metrics = {
            "regional_inventory_holding_days": 18,
            "spoilage_rate_perishables_pct": 14.2,
            "last_mile_delivery_radius_km": 45,
            "average_order_dispatch_time_hrs": 36
        }
        after_metrics = {
            "regional_inventory_holding_days": 6,
            "spoilage_rate_perishables_pct": 3.1,
            "last_mile_delivery_radius_km": 140,
            "average_order_dispatch_time_hrs": 8
        }

        ai_strategic_advice = (
            f"Commissioning the {hub_loc} ({capacity} MT) transforms Barak Valley into a major transshipment nexus for Mizoram and Tripura. "
            "Projected to reduce perishables spoilage by 78% and decrease regional logistics costs by ₹42 Lakhs per month."
        )

        res = {
            "scenario_type": "new_logistics_hub",
            "summary": f"Simulated deployment of {hub_loc} with {capacity} MT Grade-A Cold Storage",
            "affected_districts": affected_districts,
            "travel_time_change_pct": travel_time_decrease_pct,
            "cost_change_pct": cost_decrease_pct,
            "accessibility_change_points": accessibility_gain,
            "shipments_impacted": shipments_benefited,
            "economic_benefit_inr": "+ ₹3.8 Crore / Year (Logistics ROI)",
            "before_metrics": before_metrics,
            "after_metrics": after_metrics,
            "ai_strategic_advice": ai_strategic_advice,
            "is_hypothetical": True,
            "disclaimer": disclaimer_text
        }

    else: # "new_road_corridor"
        start_pt = params.get("start_point", "Guwahati")
        end_pt = params.get("end_point", "Tura (Direct Greenfield Corridor)")
        dist_km = params.get("distance_km", 145.0)

        affected_districts = ["Kamrup Metropolitan", "Goalpara", "West Garo Hills", "South West Garo Hills", "East Garo Hills"]
        travel_time_decrease_pct = -48.0
        cost_decrease_pct = -32.5
        accessibility_gain = +31.5
        shipments_benefited = 42

        before_metrics = {
            "corridor_length_km": 215,
            "average_speed_kmh": 36.0,
            "transit_duration_hrs": 6.0,
            "monsoon_disruption_days_per_year": 24
        }
        after_metrics = {
            "corridor_length_km": dist_km,
            "average_speed_kmh": 65.0,
            "transit_duration_hrs": 2.2,
            "monsoon_disruption_days_per_year": 2
        }

        ai_strategic_advice = (
            f"Developing the {start_pt} to {end_pt} greenfield all-weather corridor unlocks western Meghalaya agricultural belts. "
            "Enables same-day delivery of Garo Hills organic produce into Guwahati consumer markets with 48% travel-time savings."
        )

        res = {
            "scenario_type": "new_road_corridor",
            "summary": f"Simulated Greenfield Expressway: {start_pt} ↔ {end_pt} ({dist_km} km)",
            "affected_districts": affected_districts,
            "travel_time_change_pct": travel_time_decrease_pct,
            "cost_change_pct": cost_decrease_pct,
            "accessibility_change_points": accessibility_gain,
            "shipments_impacted": shipments_benefited,
            "economic_benefit_inr": "+ ₹5.6 Crore / Year (Regional Trade Expansion)",
            "before_metrics": before_metrics,
            "after_metrics": after_metrics,
            "ai_strategic_advice": ai_strategic_advice,
            "is_hypothetical": True,
            "disclaimer": disclaimer_text
        }

    # Save to SimulationResult DB table
    try:
        sim_record = SimulationResult(
            scenario_type=scenario_type,
            input_params=json.dumps(params),
            results=json.dumps(res),
            is_hypothetical=True,
            created_at=datetime.utcnow(),
            user_id=user_id
        )
        db.add(sim_record)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[SIMULATION] DB log error: {e}")

    return res
