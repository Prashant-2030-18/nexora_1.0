from typing import Dict, Any, List
import datetime

def get_predictive_intelligence_data() -> Dict[str, Any]:
    """
    Returns deterministic and simulated ML prediction models for:
    - 24h & 72h Disaster Risk Probabilities (Flood, Landslide, Severe Rainfall, Bridge Scour)
    - Road Disruption Probability Matrix across top corridors
    - Logistics freight volume demand forecast
    - Hourly traffic congestion index
    """
    now = datetime.datetime.utcnow()
    
    # 24-hour Disaster Predictions
    disaster_predictions = [
        {
            "category": "Flood Risk – Next 24 Hours",
            "region": "Brahmaputra Lower Basin (Dhubri, Barpeta, Morigaon)",
            "probability_pct": 74,
            "severity": "High",
            "primary_driver": "Upstream Himalayan runoff + 110mm forecasted precipitation",
            "recommended_action": "Divert heavy haulage from low-lying NH-127 to elevated northern ring corridor."
        },
        {
            "category": "Landslide Hazard – Next 24 Hours",
            "region": "Meghalaya & Southern Assam (NH-6 Sonapur Pass & Jowai)",
            "probability_pct": 68,
            "severity": "High",
            "primary_driver": "Continuous soil saturation index > 85% on steep slopes",
            "recommended_action": "Deploy preemptive clearing excavators and activate Lumding-Haflong bypass."
        },
        {
            "category": "High-Altitude Pass Disruption",
            "region": "Sela Pass / Tawang Corridor (NH-13)",
            "probability_pct": 52,
            "severity": "Medium",
            "primary_driver": "Dense fog, freezing rain and reduced tire traction",
            "recommended_action": "Enforce convoy transit with anti-skid chains."
        },
        {
            "category": "Teesta River Gorge Scour Risk",
            "region": "NH-10 Sevoke - Gangtok Corridor",
            "probability_pct": 61,
            "severity": "High",
            "primary_driver": "High Teesta river gauge levels following Sikkim cloudburst",
            "recommended_action": "Route priority pharma cargo via Lava-Algarah-Damdim alternate route."
        }
    ]

    # Road Disruption Matrix
    road_disruption_matrix = [
        {"corridor": "NH-6 (Shillong - Silchar)", "current_status": "Severely Restricted", "disruption_probability_24h": 82, "expected_delay_hours": 5.5, "alternative": "NH-27 via Lumding & Haflong"},
        {"corridor": "NH-29 (Dimapur - Kohima)", "current_status": "Moderate Congestion", "disruption_probability_24h": 46, "expected_delay_hours": 1.8, "alternative": "Pfutsero Hill Route"},
        {"corridor": "NH-37 (Jiribam - Imphal)", "current_status": "Monitored / Sinking Slopes", "disruption_probability_24h": 58, "expected_delay_hours": 3.2, "alternative": "NH-2 via Kohima"},
        {"corridor": "NH-27 (Guwahati - Nagaon)", "current_status": "Optimal Operational", "disruption_probability_24h": 12, "expected_delay_hours": 0.2, "alternative": "Direct 4-Lane"},
        {"corridor": "NH-10 (Siliguri - Gangtok)", "current_status": "Caution / Landslide Threat", "disruption_probability_24h": 64, "expected_delay_hours": 4.0, "alternative": "Reshi-Rongli Pass Route"},
        {"corridor": "NH-8 (Dharmanagar - Agartala)", "current_status": "Operational", "disruption_probability_24h": 18, "expected_delay_hours": 0.5, "alternative": "Khowai State Highway"}
    ]

    # Hourly Traffic Forecast (24 hours)
    traffic_forecast = []
    base_hours = [f"{(now.hour + i) % 24:02d}:00" for i in range(12)]
    traffic_values = [42, 38, 30, 25, 45, 68, 85, 92, 88, 76, 62, 54]
    for h, v in zip(base_hours, traffic_values):
        traffic_forecast.append({
            "time": h,
            "congestion_index": v,
            "average_speed_kmh": round(max(20, 65 - (v * 0.45)), 1)
        })

    # Logistics Demand & Warehouse Capacity Trends
    freight_demand_trends = [
        {"month": "Apr", "demand_mt": 14200, "capacity_mt": 18000, "utilization_pct": 78.8},
        {"month": "May", "demand_mt": 16500, "capacity_mt": 18500, "utilization_pct": 89.1},
        {"month": "Jun", "demand_mt": 18900, "capacity_mt": 19000, "utilization_pct": 99.4},
        {"month": "Jul (Monsoon Peak)", "demand_mt": 21400, "capacity_mt": 20000, "utilization_pct": 107.0}, # Overcapacity
        {"month": "Aug", "demand_mt": 19800, "capacity_mt": 20000, "utilization_pct": 99.0},
        {"month": "Sep (Current)", "demand_mt": 17600, "capacity_mt": 21000, "utilization_pct": 83.8},
        {"month": "Oct (Festival Spike)", "demand_mt": 22800, "capacity_mt": 22500, "utilization_pct": 101.3}
    ]

    return {
        "disaster_predictions": disaster_predictions,
        "road_disruption_matrix": road_disruption_matrix,
        "traffic_forecast": traffic_forecast,
        "freight_demand_trends": freight_demand_trends,
        "last_model_run": now.isoformat()
    }
