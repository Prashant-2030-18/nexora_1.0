from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- User & Auth Schemas ---
class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: str = "citizen"
    state: Optional[str] = "Assam"
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    sms_alerts_enabled: Optional[bool] = False

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    sms_alerts_enabled: Optional[bool] = None
    is_active: Optional[bool] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    state: Optional[str] = None
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    sms_alerts_enabled: Optional[bool] = False
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- State & District Schemas ---
class DistrictResponse(BaseModel):
    id: int
    state_id: int
    name: str
    latitude: float
    longitude: float
    population: Optional[int] = None
    area_sq_km: Optional[float] = None
    road_density_km_per_sq_km: Optional[float] = None
    distance_to_nearest_highway_km: Optional[float] = None
    distance_to_nearest_railway_km: Optional[float] = None
    distance_to_nearest_airport_km: Optional[float] = None
    active_warehouse_count: int = 0
    terrain_elevation_m: Optional[float] = None
    historical_monsoon_rainfall_mm: Optional[float] = None

    class Config:
        from_attributes = True

class StateResponse(BaseModel):
    id: int
    name: str
    code: str
    population: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    districts: Optional[List[DistrictResponse]] = []

    class Config:
        from_attributes = True

# --- Road Schemas ---
class RoadBase(BaseModel):
    name: str
    road_type: str = "National Highway"
    state: str
    start_location: str
    end_location: str
    distance_km: float
    average_speed_limit: float = 50.0
    condition: str = "Operational"
    geojson_geometry: Optional[str] = None

class RoadResponse(BaseModel):
    id: int
    name: str
    road_type: str = "National Highway"
    state: str
    start_location: str
    end_location: str
    distance_km: float
    average_speed: Optional[float] = 50.0
    average_speed_limit: Optional[float] = 50.0
    condition: str = "Operational"
    risk_level: Optional[str] = "Low"
    status: Optional[str] = "Operational"
    geojson_geometry: Optional[str] = None

    class Config:
        from_attributes = True

class RoadConditionCreate(BaseModel):
    road_id: int
    condition: str
    obstruction_type: Optional[str] = None

class RoadConditionResponse(BaseModel):
    id: int
    road_id: int
    condition: str
    obstruction_type: Optional[str] = None
    reported_at: datetime
    updated_by_user_id: Optional[int] = None

    class Config:
        from_attributes = True

# --- Logistics Schemas ---
class LogisticsHubCreate(BaseModel):
    name: str
    state: str
    district: str
    latitude: float
    longitude: float
    capacity_mt: Optional[float] = 5000.0
    capacity: Optional[float] = 5000.0
    utilization_pct: Optional[float] = 0.0
    utilization: Optional[float] = 0.0
    risk_level: Optional[str] = "Low"
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None

class LogisticsHubResponse(BaseModel):
    id: int
    name: str
    state: str
    district: str
    latitude: float
    longitude: float
    capacity_mt: Optional[float] = 5000.0
    capacity: Optional[float] = 5000.0
    utilization_pct: Optional[float] = 0.0
    utilization: Optional[float] = 0.0
    risk_level: Optional[str] = "Low"
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class WarehouseCreate(BaseModel):
    name: str
    state: str
    district: str
    latitude: float
    longitude: float
    capacity_mt: Optional[float] = 1000.0
    capacity: Optional[float] = 1000.0
    current_inventory_mt: Optional[float] = 0.0
    current_inventory: Optional[float] = 0.0
    cold_storage: bool = False
    temperature_min_c: Optional[float] = None
    temperature_max_c: Optional[float] = None
    status: str = "Operational"

class WarehouseResponse(BaseModel):
    id: int
    name: str
    state: str
    district: str
    latitude: float
    longitude: float
    capacity_mt: Optional[float] = 1000.0
    capacity: Optional[float] = 1000.0
    current_inventory_mt: Optional[float] = 0.0
    current_inventory: Optional[float] = 0.0
    cold_storage: bool = False
    status: str = "Operational"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class VehicleCreate(BaseModel):
    vehicle_number: str
    vehicle_type: str = "Heavy Duty Truck"
    capacity_tonnes: Optional[float] = 15.0
    capacity: Optional[float] = 15.0
    fuel_efficiency_km_per_l: Optional[float] = 4.0
    fuel_efficiency: Optional[float] = 4.0
    current_location: Optional[str] = None
    last_location_name: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    status: str = "Available"

class VehicleUpdate(BaseModel):
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    last_location_name: Optional[str] = None
    status: Optional[str] = None

class VehicleResponse(BaseModel):
    id: int
    vehicle_number: str
    vehicle_type: str = "Heavy Duty Truck"
    capacity_tonnes: Optional[float] = 15.0
    capacity: Optional[float] = 15.0
    fuel_efficiency_km_per_l: Optional[float] = 4.0
    fuel_efficiency: Optional[float] = 4.0
    current_location: Optional[str] = None
    last_location_name: Optional[str] = None
    status: str = "Available"
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class GPSLocationCreate(BaseModel):
    vehicle_id: int
    latitude: float
    longitude: float
    speed_kmh: float = 0.0
    heading_deg: float = 0.0

class GPSLocationResponse(GPSLocationCreate):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class ShipmentCreate(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None
    origin_address: Optional[str] = None
    destination_address: Optional[str] = None
    origin_latitude: Optional[float] = 26.1445
    origin_longitude: Optional[float] = 91.7362
    destination_latitude: Optional[float] = 24.8170
    destination_longitude: Optional[float] = 92.7925
    cargo_type: str = "Essential Goods"
    cargo_weight: Optional[float] = 5.0
    cargo_weight_tonnes: Optional[float] = 5.0
    vehicle_id: Optional[int] = None
    departure_time: Optional[datetime] = None
    estimated_cost: Optional[float] = 15000.0
    estimated_cost_inr: Optional[float] = 15000.0
    distance_km: Optional[float] = None
    estimated_eta: Optional[str] = None

class ShipmentUpdate(BaseModel):
    status: Optional[str] = None
    vehicle_id: Optional[int] = None
    estimated_eta: Optional[str] = None
    assigned_route_geojson: Optional[str] = None

class ShipmentResponse(BaseModel):
    id: int
    shipment_number: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    origin_address: Optional[str] = None
    destination_address: Optional[str] = None
    cargo_type: str
    cargo_weight: Optional[float] = None
    cargo_weight_tonnes: Optional[float] = None
    vehicle_id: Optional[int] = None
    status: str
    eta: Optional[str] = None
    estimated_eta: Optional[str] = None
    estimated_cost: Optional[float] = None
    estimated_cost_inr: Optional[float] = None
    risk_level: Optional[str] = "Low"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Incidents & User Reports ---
class IncidentCreate(BaseModel):
    title: str
    type: str
    severity: str = "Medium"
    state: str
    district: Optional[str] = None
    latitude: float
    longitude: float
    description: str
    affected_route: Optional[str] = None
    expected_duration: Optional[str] = "6 hours"
    status: str = "Active"
    source: str = "OFFICIAL_ADMIN"

class IncidentResponse(IncidentCreate):
    id: int
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserReportCreate(BaseModel):
    reporter_name: Optional[str] = "Citizen Reporter"
    reporter_phone: Optional[str] = None
    contact_phone: Optional[str] = None
    reporter_email: Optional[str] = None
    disaster_type: Optional[str] = None
    hazard_type: Optional[str] = None
    severity: str = "Medium"
    latitude: float
    longitude: float
    location_name: str
    description: str
    evidence_url: Optional[str] = None
    image_url: Optional[str] = None
    radius_km: Optional[float] = 5.0
    reported_by: Optional[str] = "User"
    contact_info: Optional[str] = None
    estimated_road_impact: Optional[str] = None
    gps_accuracy: Optional[float] = None
    evidence_hash: Optional[str] = None

class UserDisasterReportCreate(BaseModel):
    type: Optional[str] = None
    disaster_type: Optional[str] = None
    hazard_type: Optional[str] = None
    severity: str = "MODERATE"
    latitude: float
    longitude: float
    location_name: Optional[str] = "Reported Location"
    radiusKm: Optional[float] = None
    radius_km: Optional[float] = 5.0
    description: str
    reportedBy: Optional[str] = None
    reported_by: Optional[str] = "User"
    reporter_name: Optional[str] = None
    contactInfo: Optional[str] = None
    contact_info: Optional[str] = None
    contact_phone: Optional[str] = None
    estimatedRoadImpact: Optional[str] = None
    estimated_road_impact: Optional[str] = None
    evidenceUrl: Optional[str] = None
    evidence_url: Optional[str] = None
    image_url: Optional[str] = None
    gps_accuracy: Optional[float] = None
    gpsAccuracy: Optional[float] = None
    evidence_hash: Optional[str] = None
    evidenceHash: Optional[str] = None

class UserDisasterReportPatch(BaseModel):
    type: Optional[str] = None
    disaster_type: Optional[str] = None
    hazard_type: Optional[str] = None
    severity: Optional[str] = None
    radiusKm: Optional[float] = None
    radius_km: Optional[float] = None
    description: Optional[str] = None
    status: Optional[str] = None
    review_notes: Optional[str] = None
    estimatedRoadImpact: Optional[str] = None
    estimated_road_impact: Optional[str] = None
    evidenceUrl: Optional[str] = None
    evidence_url: Optional[str] = None
    image_url: Optional[str] = None

class UserDisasterReportResponse(BaseModel):
    id: int
    type: str
    disaster_type: str
    hazard_type: Optional[str] = None
    severity: str
    latitude: float
    longitude: float
    location_name: str
    radiusKm: float
    radius_km: float
    description: str
    source: str = "USER_REPORTED"
    source_badge: Optional[str] = "AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)"
    verified: Optional[bool] = False
    reportedBy: str
    reported_by: str
    createdAt: str
    created_at: datetime
    updatedAt: str
    updated_at: Optional[datetime] = None
    status: str
    confidence: float
    contactInfo: Optional[str] = None
    contact_info: Optional[str] = None
    estimatedRoadImpact: Optional[str] = None
    estimated_road_impact: Optional[str] = None
    evidenceUrl: Optional[str] = None
    evidence_url: Optional[str] = None
    image_url: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    review_notes: Optional[str] = None
    verification_status: Optional[str] = "AI_REVIEW"
    ai_confidence: Optional[float] = 0.0
    ai_reason: Optional[str] = None
    evidence_score: Optional[float] = None
    location_score: Optional[float] = None
    consistency_score: Optional[float] = None
    duplicate_score: Optional[float] = None
    image_analysis_available: Optional[bool] = False
    image_analysis_summary: Optional[str] = None
    verified_at: Optional[datetime] = None
    verification_model: Optional[str] = None
    verification_version: Optional[str] = "1.0.0"
    corroboration_count: Optional[int] = 1
    corroborated_sachet_alert_id: Optional[int] = None
    corroborated_sachet_identifier: Optional[str] = None
    location_scope: Optional[str] = None
    locationScope: Optional[str] = None
    evidence_hash: Optional[str] = None
    gps_accuracy: Optional[float] = None
    road_impact: Optional[str] = "NONE"
    unique_evidence_count: Optional[int] = 0
    expires_at: Optional[datetime] = None
    signals_breakdown: Optional[Dict[str, Any]] = None
    signals_checklist: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class UserReportModerate(BaseModel):
    status: str # "APPROVED", "Verified", "REJECTED", "Rejected", "PENDING"
    review_notes: Optional[str] = None

class UserReportResponse(UserReportCreate):
    id: int
    status: str
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    verification_status: Optional[str] = "AI_REVIEW"
    ai_confidence: Optional[float] = 0.0
    ai_reason: Optional[str] = None
    evidence_score: Optional[float] = None
    location_score: Optional[float] = None
    consistency_score: Optional[float] = None
    duplicate_score: Optional[float] = None
    image_analysis_available: Optional[bool] = False
    image_analysis_summary: Optional[str] = None
    verified_at: Optional[datetime] = None
    verification_model: Optional[str] = None
    verification_version: Optional[str] = "1.0.0"
    corroboration_count: Optional[int] = 1
    corroborated_sachet_alert_id: Optional[int] = None
    corroborated_sachet_identifier: Optional[str] = None
    location_scope: Optional[str] = None
    locationScope: Optional[str] = None
    evidence_hash: Optional[str] = None
    gps_accuracy: Optional[float] = None
    road_impact: Optional[str] = "NONE"
    unique_evidence_count: Optional[int] = 0
    expires_at: Optional[datetime] = None
    signals_checklist: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

# --- Disaster Alerts (SACHET CAP) ---
class DisasterAlertResponse(BaseModel):
    id: int
    identifier: str
    sender: Optional[str] = None
    sent_at: Optional[datetime] = None
    status: str
    msg_type: str
    event: str
    urgency: Optional[str] = None
    severity: str
    certainty: Optional[str] = None
    headline: str
    description: Optional[str] = None
    area_description: Optional[str] = None
    polygon_geojson: Optional[str] = None
    circle_coordinates: Optional[str] = None
    expires_at: Optional[datetime] = None
    effective_at: Optional[datetime] = None
    onset_at: Optional[datetime] = None
    instruction: Optional[str] = None
    source_url: Optional[str] = None
    is_active: bool
    fetched_at: datetime

    class Config:
        from_attributes = True

class AlertResponse(BaseModel):
    id: int
    title: str
    message: str
    severity: str
    type: str
    state: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- Infrastructure Gaps ---
class InfrastructureGapResponse(BaseModel):
    id: int
    district: str
    state: str
    gap_type: str
    severity: str
    description: str
    recommended_action: str
    estimated_impact: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Simulation Result & What-If ---
class ScenarioRequest(BaseModel):
    scenario_type: str
    road_name: Optional[str] = None
    hub_location: Optional[str] = None
    hub_capacity: Optional[float] = 5000.0
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    distance_km: Optional[float] = 50.0

class ScenarioResult(BaseModel):
    scenario_type: str
    summary: str
    affected_districts: List[str]
    travel_time_change_pct: float
    cost_change_pct: float
    accessibility_change_points: float
    shipments_impacted: int
    economic_benefit_inr: Optional[str] = None
    before_metrics: Dict[str, Any]
    after_metrics: Dict[str, Any]
    ai_strategic_advice: str
    is_hypothetical: bool = True
    disclaimer: str = "SIMULATION RESULT — Hypothetical scenario, not a confirmed government project."

# Alias for backward compatibility
SimulationRequest = ScenarioRequest
SimulationResultResponse = ScenarioResult

# --- Audit Logs ---
class AuditLogResponse(BaseModel):
    id: int
    user_email: str
    action: str
    details: str
    ip_address: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# --- Weather ---
class WeatherRecordResponse(BaseModel):
    id: int
    latitude: float
    longitude: float
    location_name: Optional[str] = None
    temperature_c: Optional[float] = None
    rainfall_mm: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    humidity_pct: Optional[float] = None
    visibility_km: Optional[float] = None
    condition_text: Optional[str] = None
    source_api: str
    fetched_at: datetime

    class Config:
        from_attributes = True

# --- Route Planning Schemas ---
class RouteRequest(BaseModel):
    origin: str
    destination: str
    vehicle_type: str = "Heavy Duty Truck"
    cargo_type: str = "Essential Commodities"
    cargo_weight: Optional[float] = 10.0
    cargo_weight_tonnes: Optional[float] = 10.0
    avoid_disasters: bool = True
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    travel_mode: Optional[str] = "driving"

RoutePlanningRequest = RouteRequest

class RouteOption(BaseModel):
    strategy: str
    distance_km: float
    eta_hours: float
    eta_formatted: str
    fuel_cost_inr: float
    toll_cost_inr: float
    total_cost_inr: float
    risk_score: float
    reliability_score: float
    weather_exposure: str
    geometry_coordinates: List[List[float]] = []
    hazards_on_route: int = 0
    note: str

class RouteCalculationResponse(BaseModel):
    origin: str
    origin_geocoded: str
    destination: str
    destination_geocoded: str
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    vehicle_type: str
    cargo_type: str
    weather: Optional[Dict[str, Any]] = None
    weather_impact: str
    active_hazards_count: int
    route_intersecting_hazards: List[Dict[str, Any]]
    disruption_detected: bool
    hazard_warning: Optional[str] = None
    data_sources: List[str]
    navigation_steps: Optional[List[Dict[str, Any]]] = []
    travel_mode: Optional[str] = "driving"
    routes: Dict[str, RouteOption]

RoutePlanningResponse = RouteCalculationResponse

class RerouteRequest(BaseModel):
    shipment_id: Optional[int] = None
    current_route_name: Optional[str] = None
    incident_id: Optional[int] = None
    origin: str
    destination: str

# --- Hub Planner Schemas ---
class HubPlannerRequest(BaseModel):
    latitude: float
    longitude: float
    district_name: Optional[str] = None
    target_capacity_mt: Optional[float] = 5000.0

class HubPlannerResponse(BaseModel):
    location_name: str
    district: str
    state: str
    population_served: str
    travel_time_reduction_pct: float
    coverage_increase_districts: int
    projected_accessibility: Dict[str, float]
    estimated_cost_reduction_pct: float
    disaster_risk: str
    highway_proximity_km: float
    railway_proximity_km: float
    airport_proximity_km: float
    suitability_score: float
    ai_recommendation_breakdown: List[str]

# --- AI Copilot ---
class AICopilotQuery(BaseModel):
    query: str
    context_state: Optional[str] = "All"
    user_role: Optional[str] = "admin"
    current_location: Optional[Dict[str, Any]] = None
    destination: Optional[str] = None
    active_route: Optional[Dict[str, Any]] = None
    current_speed: Optional[float] = None
    gps_accuracy: Optional[float] = None
    eta: Optional[str] = None
    remaining_distance_km: Optional[float] = None
    route_risk: Optional[float] = None
    hazards: Optional[List[Dict[str, Any]]] = None
    navigation_state: Optional[str] = None

class AICopilotResponse(BaseModel):
    answer: str
    grounded_on: str
    timestamp: str
    data_points: List[Dict[str, Any]] = []
    suggested_actions: List[Dict[str, Any]] = []
    disclaimer: Optional[str] = None

# --- API Sync & Data Source ---
class APISyncLogResponse(BaseModel):
    id: int
    service_name: str
    status: str
    items_synced: int
    response_time_ms: Optional[float] = None
    error_message: Optional[str] = None
    sync_timestamp: datetime

    class Config:
        from_attributes = True

class DataSourceResponse(BaseModel):
    id: int
    name: str
    endpoint_url: str
    auth_type: str
    status: str
    last_sync_at: Optional[datetime] = None
    sync_interval_minutes: int

    class Config:
        from_attributes = True
