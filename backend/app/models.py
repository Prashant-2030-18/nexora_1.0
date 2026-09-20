import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="citizen", nullable=False) # admin, state_gov, logistics_operator, citizen
    state = Column(String(50), nullable=True) # e.g. "Assam" or "All"
    phone = Column(String(20), nullable=True)
    sms_alerts_enabled = Column(Boolean, default=False, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    vehicles = relationship("Vehicle", back_populates="operator")
    shipments = relationship("Shipment", back_populates="operator")
    warehouses = relationship("Warehouse", back_populates="owner")
    user_reports = relationship("UserReport", foreign_keys="[UserReport.reporter_user_id]", back_populates="reporter")

class State(Base):
    __tablename__ = "states"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    code = Column(String(10), unique=True, index=True, nullable=False)
    population = Column(Integer, default=1000000)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    districts = relationship("District", back_populates="state_rel", cascade="all, delete-orphan")

class District(Base):
    __tablename__ = "districts"

    id = Column(Integer, primary_key=True, index=True)
    state_id = Column(Integer, ForeignKey("states.id"), nullable=False)
    name = Column(String(100), index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    population = Column(Integer, nullable=True)
    area_sq_km = Column(Float, nullable=True)
    
    # Real infrastructure metrics for accessibility calculation
    road_density_km_per_sq_km = Column(Float, nullable=True)
    distance_to_nearest_highway_km = Column(Float, nullable=True)
    distance_to_nearest_railway_km = Column(Float, nullable=True)
    distance_to_nearest_airport_km = Column(Float, nullable=True)
    active_warehouse_count = Column(Integer, default=0)
    terrain_elevation_m = Column(Float, nullable=True)
    historical_monsoon_rainfall_mm = Column(Float, nullable=True)

    state_rel = relationship("State", back_populates="districts")

class Road(Base):
    __tablename__ = "roads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # e.g., "NH-27", "NH-6"
    road_type = Column(String(50), default="National Highway") # National Highway, State Highway, Express Highway, Rural Road
    state = Column(String(100), nullable=False)
    start_location = Column(String(100), nullable=False)
    end_location = Column(String(100), nullable=False)
    distance_km = Column(Float, nullable=False)
    average_speed_limit = Column(Float, default=50.0) # km/h
    condition = Column(String(50), default="Operational") # Operational, Restricted, Blocked, Under Maintenance
    geojson_geometry = Column(Text, nullable=True)

    conditions = relationship("RoadCondition", back_populates="road")

class LogisticsHub(Base):
    __tablename__ = "logistics_hubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    state = Column(String(100), nullable=False)
    district = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity_mt = Column(Float, default=5000.0) # In Metric Tonnes (MT)
    utilization_pct = Column(Float, default=0.0)
    contact_person = Column(String(100), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    state = Column(String(100), nullable=False)
    district = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity_mt = Column(Float, default=1000.0)
    current_inventory_mt = Column(Float, default=0.0)
    cold_storage = Column(Boolean, default=False)
    temperature_min_c = Column(Float, nullable=True)
    temperature_max_c = Column(Float, nullable=True)
    status = Column(String(50), default="Operational") # Operational, Maintenance, Full
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="warehouses")

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(50), unique=True, index=True, nullable=False)
    vehicle_type = Column(String(50), default="Heavy Duty Truck") # Heavy Duty Truck, Mini Truck, Refrigerated Van, 4x4 Hill Hauler
    capacity_tonnes = Column(Float, default=15.0)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    last_location_name = Column(String(200), nullable=True)
    status = Column(String(50), default="Available") # Available, In Transit, Maintenance, Offline
    fuel_efficiency_km_per_l = Column(Float, default=4.0)
    operator_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    operator = relationship("User", back_populates="vehicles")
    shipments = relationship("Shipment", back_populates="vehicle")
    gps_logs = relationship("GPSLocation", back_populates="vehicle", cascade="all, delete-orphan")

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    shipment_number = Column(String(50), unique=True, index=True, nullable=False)
    origin_address = Column(String(255), nullable=False)
    destination_address = Column(String(255), nullable=False)
    origin_latitude = Column(Float, nullable=False)
    origin_longitude = Column(Float, nullable=False)
    destination_latitude = Column(Float, nullable=False)
    destination_longitude = Column(Float, nullable=False)
    cargo_type = Column(String(100), default="Essential Goods")
    cargo_weight_tonnes = Column(Float, default=5.0)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    operator_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(50), default="Scheduled") # Scheduled, In Transit, Delivered, Delayed, Rerouted
    departure_time = Column(DateTime, nullable=True)
    estimated_eta = Column(String(50), nullable=True)
    distance_km = Column(Float, nullable=True)
    estimated_cost_inr = Column(Float, nullable=True)
    assigned_route_geojson = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="shipments")
    operator = relationship("User", back_populates="shipments")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False) # Flood, Landslide, Heavy Rain, Earthquake, Accident, Road Closure, Bridge Failure, Construction, Obstruction
    severity = Column(String(50), default="Medium") # Critical, High, Medium, Low
    state = Column(String(100), nullable=False)
    district = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(Text, nullable=False)
    affected_route = Column(String(200), nullable=True)
    expected_duration = Column(String(50), nullable=True)
    status = Column(String(50), default="Active") # Active, Mitigated, Resolved, False Alarm
    source = Column(String(50), default="NDMA_SACHET") # NDMA_SACHET, USER_REPORT, OFFICIAL_ADMIN
    source_reference_id = Column(String(100), nullable=True) # E.g. CAP alert identifier or user report id
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(50), default="Medium") # Critical, High, Medium, Low
    type = Column(String(50), default="Disaster Alert")
    state = Column(String(100), default="All")
    source_alert_id = Column(String(100), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_read = Column(Boolean, default=False)

class InfrastructureGap(Base):
    __tablename__ = "infrastructure_gaps"

    id = Column(Integer, primary_key=True, index=True)
    district = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    gap_type = Column(String(100), nullable=False)
    severity = Column(String(50), default="High")
    description = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    estimated_impact = Column(String(150), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id = Column(Integer, primary_key=True, index=True)
    scenario_type = Column(String(100), nullable=False) # road_closure, new_hub, new_road
    input_params = Column(Text, nullable=False) # JSON string
    results = Column(Text, nullable=False) # JSON string
    is_hypothetical = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(150), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=False)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class UserReport(Base):
    __tablename__ = "user_reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_name = Column(String(100), nullable=False)
    reporter_phone = Column(String(30), nullable=True)
    reporter_email = Column(String(150), nullable=True)
    reporter_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    disaster_type = Column(String(50), nullable=False)
    severity = Column(String(50), default="Medium")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    evidence_url = Column(String(500), nullable=True)
    status = Column(String(50), default="PENDING") # PENDING, APPROVED, REJECTED, DELETED
    radius_km = Column(Float, default=5.0)
    source = Column(String(50), default="USER_REPORTED")
    reported_by = Column(String(50), default="User") # User / Operator
    confidence = Column(Float, default=0.7)
    contact_info = Column(String(200), nullable=True)
    estimated_road_impact = Column(String(200), nullable=True)
    review_notes = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    # AI Verification Engine Fields
    verification_status = Column(String(50), default="AI_REVIEW")  # AI_VERIFIED, AI_REVIEW, AI_REJECTED
    ai_confidence = Column(Float, default=0.0)
    ai_reason = Column(Text, nullable=True)
    evidence_score = Column(Float, nullable=True)
    location_score = Column(Float, nullable=True)
    consistency_score = Column(Float, nullable=True)
    duplicate_score = Column(Float, nullable=True)
    image_analysis_available = Column(Boolean, default=False)
    image_analysis_summary = Column(Text, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verification_model = Column(String(100), nullable=True)
    verification_version = Column(String(50), default="1.0.0")
    corroboration_count = Column(Integer, default=1)
    corroborated_sachet_alert_id = Column(Integer, nullable=True)
    corroborated_sachet_identifier = Column(String(100), nullable=True)
    location_scope = Column(String(50), nullable=True)  # NER | INDIA_OUTSIDE_NER | GLOBAL_OUTSIDE_INDIA | INVALID
    evidence_hash = Column(String(64), nullable=True)  # SHA-256
    gps_accuracy = Column(Float, nullable=True)  # meters
    road_impact = Column(String(50), default="NONE")  # BLOCKAGE | PARTIAL_BLOCKAGE | MINOR_OBSTRUCTION | NONE
    unique_evidence_count = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=True)


    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    reporter = relationship("User", foreign_keys=[reporter_user_id], back_populates="user_reports")

class GPSLocation(Base):
    __tablename__ = "gps_locations"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_kmh = Column(Float, default=0.0)
    heading_deg = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="gps_logs")

class RouteRequest(Base):
    __tablename__ = "route_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    origin_name = Column(String(255), nullable=False)
    destination_name = Column(String(255), nullable=False)
    origin_latitude = Column(Float, nullable=False)
    origin_longitude = Column(Float, nullable=False)
    destination_latitude = Column(Float, nullable=False)
    destination_longitude = Column(Float, nullable=False)
    profile = Column(String(50), default="driving")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    results = relationship("RouteResult", back_populates="request", cascade="all, delete-orphan")

class RouteResult(Base):
    __tablename__ = "route_results"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("route_requests.id"), nullable=False)
    strategy = Column(String(50), default="Fastest") # Fastest, Cheapest, Safest, Balanced
    distance_km = Column(Float, nullable=False)
    duration_minutes = Column(Float, nullable=False)
    polyline_geojson = Column(Text, nullable=False)
    risk_score = Column(Float, default=0.0)
    disasters_intersected_count = Column(Integer, default=0)
    intersected_alerts_json = Column(Text, nullable=True)
    weather_summary = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    request = relationship("RouteRequest", back_populates="results")

class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String(150), nullable=True)
    temperature_c = Column(Float, nullable=True)
    rainfall_mm = Column(Float, nullable=True)
    wind_speed_kmh = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    visibility_km = Column(Float, nullable=True)
    condition_text = Column(String(100), nullable=True)
    icon_code = Column(String(50), nullable=True)
    source_api = Column(String(50), default="Open-Meteo")
    fetched_at = Column(DateTime, default=datetime.datetime.utcnow)

class DisasterAlert(Base):
    __tablename__ = "disaster_alerts"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(200), unique=True, index=True, nullable=False) # CAP alert identifier
    sender = Column(String(150), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    status = Column(String(50), default="Actual")
    msg_type = Column(String(50), default="Alert")
    event = Column(String(100), nullable=False) # e.g. Flood, Landslide, Severe Weather
    category = Column(String(100), nullable=True)
    response_type = Column(String(100), nullable=True)
    sender_name = Column(String(150), nullable=True)
    urgency = Column(String(50), nullable=True)
    severity = Column(String(50), default="Moderate") # Extreme, Severe, Moderate, Minor, Unknown
    raw_severity = Column(String(50), nullable=True) # Unmodified CAP severity
    certainty = Column(String(50), nullable=True)
    headline = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    instruction = Column(Text, nullable=True)
    area_description = Column(Text, nullable=True)
    polygon_geojson = Column(Text, nullable=True)
    circle_coordinates = Column(String(100), nullable=True)
    geocode = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    effective_at = Column(DateTime, nullable=True)
    onset_at = Column(DateTime, nullable=True)
    source = Column(String(50), default="SACHET_NDMA")
    source_type = Column(String(50), default="SACHET_NDMA")
    verification_status = Column(String(50), default="VERIFIED")
    source_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    fetched_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Convenient field aliases matching CAP 1.2 nomenclature
    @hybrid_property
    def sent(self):
        return self.sent_at

    @hybrid_property
    def expires(self):
        return self.expires_at

    @hybrid_property
    def effective(self):
        return self.effective_at

    @hybrid_property
    def onset(self):
        return self.onset_at

    @hybrid_property
    def area_desc(self):
        return self.area_description

    @hybrid_property
    def polygon(self):
        return self.polygon_geojson

    @hybrid_property
    def circle(self):
        return self.circle_coordinates

    @hybrid_property
    def official_url(self):
        return self.source_url

class SachetFeedCache(Base):
    __tablename__ = "sachet_feed_cache"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(200), unique=True, index=True, nullable=False)
    endpoint = Column(String(500), nullable=True)
    etag = Column(String(200), nullable=True)
    xml_content = Column(Text, nullable=True)
    content_hash = Column(String(100), nullable=True)
    http_status = Column(Integer, nullable=True)
    last_checked_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_successful_fetch = Column(DateTime, nullable=True)
    last_modified_at = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    source = Column(String(50), default="SACHET_NDMA")
    source_type = Column(String(50), default="SACHET_NDMA")
    verification_status = Column(String(50), default="VERIFIED")
    response_status = Column(String(50), nullable=True)
    fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    @hybrid_property
    def alert_identifier(self):
        return self.identifier

    @alert_identifier.setter
    def alert_identifier(self, val):
        self.identifier = val

    @hybrid_property
    def cached_xml(self):
        return self.xml_content

    @cached_xml.setter
    def cached_xml(self, val):
        self.xml_content = val

# Backward compatibility alias
SachetEtagCache = SachetFeedCache

class RoadCondition(Base):
    __tablename__ = "road_conditions"

    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(Integer, ForeignKey("roads.id"), nullable=False)
    condition = Column(String(50), nullable=False) # Clear, Submerged, Landslide Blocked, Maintenance, Slow
    obstruction_type = Column(String(100), nullable=True)
    reported_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    road = relationship("Road", back_populates="conditions")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # None = Broadcast to all
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(50), default="Medium")
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class APISyncLog(Base):
    __tablename__ = "api_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String(100), nullable=False) # SACHET_NDMA, OSRM, OPEN_METEO, GEMINI
    status = Column(String(50), nullable=False) # SUCCESS, FAILED, TIMEOUT
    items_synced = Column(Integer, default=0)
    response_time_ms = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    sync_timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False) # e.g. "NDMA SACHET CAP XML", "OSRM Public Routing", "Open-Meteo Global Weather"
    endpoint_url = Column(String(255), nullable=False)
    auth_type = Column(String(50), default="None")
    status = Column(String(50), default="Operational") # Operational, Degraded, Down
    last_sync_at = Column(DateTime, nullable=True)
    sync_interval_minutes = Column(Integer, default=30)


# ============================================================
# COMMUNICATION RESILIENCE & OFFLINE MODELS
# Added for: Automatic Offline Mode + SMS Fallback + Satellite-Ready
# ============================================================

class JourneySession(Base):
    """
    Represents one active navigation journey for a user.
    Backend monitors heartbeats; stale heartbeat triggers SMS fallback check.
    """
    __tablename__ = "journey_sessions"

    id = Column(String(36), primary_key=True, index=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    phone_number = Column(String(20), nullable=True)  # masked in logs
    preferred_language = Column(String(30), default="en")  # ISO 639-1 or locale code
    travel_mode = Column(String(30), nullable=True)         # car, truck, walking, bicycle, train, flight
    origin = Column(String(255), nullable=True)
    destination = Column(String(255), nullable=True)
    origin_lat = Column(Float, nullable=True)
    origin_lon = Column(Float, nullable=True)
    dest_lat = Column(Float, nullable=True)
    dest_lon = Column(Float, nullable=True)
    route_geometry = Column(Text, nullable=True)            # GeoJSON LineString as JSON string
    route_provider = Column(String(100), nullable=True)     # OSRM, Aviation Engine, etc.
    route_id = Column(String(100), nullable=True)           # strategy e.g. 'fastest'
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    last_heartbeat_at = Column(DateTime, nullable=True)

    # Last known device state (server cannot know live GPS while offline)
    last_known_latitude = Column(Float, nullable=True)
    last_known_longitude = Column(Float, nullable=True)
    last_route_progress = Column(Float, nullable=True)      # 0.0 – 1.0
    last_heading = Column(Float, nullable=True)             # degrees
    last_speed = Column(Float, nullable=True)               # km/h
    last_gps_accuracy = Column(Float, nullable=True)        # meters
    last_connection_state = Column(String(30), default="ONLINE")  # ONLINE/DEGRADED/OFFLINE/RESTORING/SYNCING

    # Communication preferences (requires explicit user consent)
    sms_consent = Column(Boolean, default=False)
    ivr_consent = Column(Boolean, default=False)
    satellite_preference = Column(String(30), default="NOT_CONFIGURED")

    # Journey status
    active = Column(Boolean, default=True)
    connectivity_status = Column(String(30), default="ONLINE")  # ONLINE / OFFLINE_ASSUMED / RECONNECTED

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ConnectivityEvent(Base):
    """
    Log of significant connectivity transitions.
    Only state-change events are logged, not every heartbeat success.
    """
    __tablename__ = "connectivity_events"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(String(36), ForeignKey("journey_sessions.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    event_type = Column(String(50), nullable=False)  # ONLINE, DEGRADED, OFFLINE_ASSUMED, RECONNECTED, SYNCING
    detail = Column(Text, nullable=True)              # e.g. "3 consecutive heartbeat failures"
    client_timestamp = Column(DateTime, nullable=True)
    server_timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class AlertDelivery(Base):
    """
    SMS/IVR/satellite delivery deduplication table.
    Prevents duplicate alerts for the same hazard+journey combination.
    """
    __tablename__ = "alert_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(String(36), ForeignKey("journey_sessions.id"), nullable=True)
    hazard_id = Column(Integer, nullable=True)            # DisasterAlert.id or UserReport.id
    hazard_source = Column(String(50), nullable=True)     # SACHET / CITIZEN
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    phone_number = Column(String(20), nullable=True)      # masked in UI, stored server-side only
    channel = Column(String(30), nullable=False)          # SMS / IVR / SATELLITE / IN_APP
    language = Column(String(30), default="en")

    # Delivery states: QUEUED / SENT_TO_PROVIDER / DELIVERED / FAILED / UNKNOWN
    status = Column(String(30), default="QUEUED")
    provider_message_id = Column(String(200), nullable=True)  # returned by SMS provider
    provider_name = Column(String(100), nullable=True)        # ConsoleSmsProvider / live provider name
    error_message = Column(Text, nullable=True)

    attempted_at = Column(DateTime, default=datetime.datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)            # only set if provider confirms delivery
    acknowledged_at = Column(DateTime, nullable=True)         # user acknowledged the alert


class OfflineSyncReceipt(Base):
    """
    Idempotency key store. Backend records processed offline sync keys
    to prevent duplicate records on retry.
    """
    __tablename__ = "offline_sync_receipts"

    id = Column(Integer, primary_key=True, index=True)
    idempotency_key = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    entity_type = Column(String(50), nullable=False)  # CITIZEN_REPORT / EVIDENCE / JOURNEY_TELEMETRY / etc.
    operation = Column(String(30), nullable=False)     # CREATE / UPDATE / ACK
    result_id = Column(String(100), nullable=True)     # server-side ID of created/updated entity
    client_timestamp = Column(DateTime, nullable=True)
    server_received_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(30), default="PROCESSED")   # PROCESSED / ERROR


class UserCommunicationPreference(Base):
    """
    Stores per-user communication consent and preferences.
    Required before any SMS/IVR/satellite messaging.
    """
    __tablename__ = "user_communication_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    sms_consent = Column(Boolean, default=False)           # explicit opt-in required
    ivr_consent = Column(Boolean, default=False)
    satellite_preference = Column(String(30), default="NOT_CONFIGURED")
    preferred_language = Column(String(30), default="en")
    sms_min_severity = Column(String(30), default="HIGH")  # HIGH / CRITICAL
    consent_given_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class SatelliteSession(Base):
    """
    Future satellite communication session placeholder.
    State is always NOT_CONFIGURED unless a real native/provider SDK
    session is explicitly injected.
    IMPORTANT: GPS availability does NOT imply satellite internet capability.
    Emergency SOS is NOT treated as general satellite data connectivity.
    """
    __tablename__ = "satellite_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    journey_id = Column(String(36), ForeignKey("journey_sessions.id"), nullable=True)
    provider_name = Column(String(100), nullable=True)     # e.g. "Starlink D2D", "OneWeb", etc.
    state = Column(String(50), default="NOT_CONFIGURED")   # NOT_CONFIGURED / UNKNOWN / SUPPORTED_BUT_UNAVAILABLE / AVAILABLE / ACTIVE
    session_token = Column(String(500), nullable=True)     # provider session token (encrypted)
    capability_confirmed = Column(Boolean, default=False)  # True only when real SDK confirms
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

