export type UserRole = 'admin' | 'state_gov' | 'logistics_operator' | 'citizen';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  state?: string;
  phone?: string;
  mobile_number?: string;
  sms_alerts_enabled?: boolean;
  is_active: boolean;
  created_at: string;
}

export interface StateData {
  id: number;
  name: string;
  code: string;
  accessibility_score: number;
  population: number;
  risk_level: string;
  districts?: DistrictData[];
}

export interface DistrictData {
  id: number;
  state_id: number;
  name: string;
  latitude: number;
  longitude: number;
  accessibility_score: number;
  road_connectivity: number;
  highway_access: number;
  railway_access: number;
  airport_access: number;
  logistics_access: number;
  travel_time_score: number;
  terrain_score: number;
  weather_resilience: number;
  emergency_access: number;
  network_reliability: number;
  risk_score: number;
}

export interface RoadData {
  id: number;
  name: string;
  road_type: string;
  state: string;
  start_location: string;
  end_location: string;
  distance_km: number;
  average_speed: number;
  condition: string;
  risk_level: string;
  status: string;
  coordinates_json?: string;
}

export interface LogisticsHubData {
  id: number;
  name: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  capacity: number;
  utilization: number;
  risk_level: string;
}

export interface WarehouseData {
  id: number;
  name: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  capacity: number;
  current_inventory: number;
  cold_storage: boolean;
  status: string;
}

export interface VehicleData {
  id: number;
  vehicle_number: string;
  vehicle_type: string;
  capacity: number;
  current_location: string;
  status: string;
  fuel_efficiency: number;
}

export interface ShipmentData {
  id: number;
  shipment_number: string;
  origin: string;
  destination: string;
  cargo_type: string;
  cargo_weight: number;
  vehicle_id?: number;
  status: string;
  eta: string;
  estimated_cost: number;
  risk_level: string;
}

export interface IncidentData {
  id: number;
  title: string;
  type: string;
  severity: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  description: string;
  affected_route: string;
  expected_duration: string;
  status: string;
  created_at: string;
}

export interface AlertData {
  id: number;
  title: string;
  message: string;
  severity: string;
  type: string;
  state: string;
  created_at: string;
  is_read: boolean;
}

export interface InfrastructureGapData {
  id: number;
  district: string;
  state: string;
  gap_type: string;
  severity: string;
  description: string;
  recommended_action: string;
  estimated_impact: string;
}

export interface RouteOption {
  route_name: string;
  strategy: string;
  distance_km: number;
  eta_hours: number;
  eta_formatted: string;
  fuel_cost_inr: number;
  toll_cost_inr: number;
  total_cost_inr: number;
  risk_score: number;
  reliability_score: number;
  weather_exposure: string;
  road_condition: string;
  waypoints: { name: string; lat: number; lng: number }[];
  segments: string[];
  disruptions_avoided: number;
  ai_rationale: string;
}

export interface RouteCalculationResult {
  origin: string;
  destination: string;
  active_incidents_count: number;
  recommended_strategy: string;
  fastest: RouteOption;
  cheapest: RouteOption;
  safest: RouteOption;
  reliable: RouteOption;
  disruption_detected: boolean;
  incident_details?: IncidentData;
  alternative_reroute?: RouteOption;
}

export interface AccessibilityScorecard {
  district_id?: number;
  district_name: string;
  state_id?: number;
  state_name: string;
  score?: number | null;
  overall_score?: number;
  status?: string;
  priority_level: string;
  factor_scores?: Record<string, number>;
  breakdown?: {
    road_connectivity?: number;
    highway_access?: number;
    railway_access?: number;
    airport_access?: number;
    logistics_access?: number;
    travel_time_score?: number;
    emergency_access?: number;
    weather_resilience?: number;
    network_reliability?: number;
  };
  ai_explanation?: string;
  reason?: string;
  bottlenecks?: string[];
  key_bottlenecks?: string[];
  recommended_interventions?: string[];
  population?: number;
  area_sq_km?: number;
  latitude?: number;
  longitude?: number;
}

export interface HubEvaluationResult {
  location_name: string;
  district: string;
  state: string;
  population_served: string;
  travel_time_reduction_pct: number;
  coverage_increase_districts: number;
  projected_accessibility: {
    current_score: number;
    projected_score: number;
    gain_points: number;
  };
  estimated_cost_reduction_pct: number;
  disaster_risk: string;
  highway_proximity_km: number;
  railway_proximity_km: number;
  airport_proximity_km: number;
  suitability_score: number;
  ai_recommendation_breakdown: string[];
}

export interface ScenarioSimulationResult {
  scenario_type: string;
  summary: string;
  affected_districts: string[];
  travel_time_change_pct: number;
  cost_change_pct: number;
  accessibility_change_points: number;
  shipments_impacted: number;
  economic_benefit_inr?: string;
  before_metrics: Record<string, any>;
  after_metrics: Record<string, any>;
  ai_strategic_advice: string;
  is_hypothetical?: boolean;
  disclaimer?: string;
}

export interface AICopilotResponse {
  answer: string;
  data_points: Record<string, any>[];
  suggested_actions: { label: string; action: string }[];
  timestamp: string;
}

export interface AuditLogData {
  id: number;
  user_email: string;
  action: string;
  details: string;
  timestamp: string;
}
export interface LocationSearchResult {
  display_name: string;
  latitude: number;
  longitude: number;
  type?: string;
  class?: string;
}

export interface SignalChecklistItem {
  label: string;
  status: 'passed' | 'neutral' | 'failed';
  detail: string;
}

export interface UserReportData {
  id?: number;
  reporter_name: string;
  reporter_phone?: string;
  reporter_email?: string;
  disaster_type: string;
  hazard_type?: string;
  type?: string;
  severity: string;
  latitude: number;
  longitude: number;
  location_name: string;
  radius_km?: number;
  radiusKm?: number;
  description: string;
  evidence_url?: string;
  evidenceUrl?: string;
  image_url?: string;
  status?: string;
  verified?: boolean;
  source?: string;
  source_badge?: string;
  reported_by?: string;
  reportedBy?: string;
  contact_info?: string;
  contactInfo?: string;
  estimated_road_impact?: string;
  estimatedRoadImpact?: string;
  review_notes?: string;
  reviewed_by?: string;
  created_at?: string;
  updated_at?: string;
  confidence?: number;
  verification_status?: string;
  ai_confidence?: number;
  ai_reason?: string;
  evidence_score?: number;
  location_score?: number;
  consistency_score?: number;
  duplicate_score?: number;
  image_analysis_available?: boolean;
  image_analysis_summary?: string;
  verified_at?: string;
  verification_model?: string;
  verification_version?: string;
  corroboration_count?: number;
  corroborated_sachet_alert_id?: number | null;
  corroborated_sachet_identifier?: string | null;
  location_scope?: string;
  locationScope?: string;
  evidence_hash?: string;
  evidenceHash?: string;
  gps_accuracy?: number;
  gpsAccuracy?: number;
  road_impact?: string;
  unique_evidence_count?: number;
  expires_at?: string;
  signals_breakdown?: Record<string, any>;
  signals_checklist?: SignalChecklistItem[];
}

export interface DisasterAlertData {
  id: number;
  identifier: string;
  event: string;
  disaster_type?: string;
  event_type?: string;
  headline: string;
  description?: string;
  instruction?: string;
  area_description?: string;
  area?: string;
  severity: string;
  raw_severity?: string;
  urgency?: string;
  certainty?: string;
  status?: string;
  sent_at?: string;
  issued_at?: string;
  effective_at?: string;
  expires_at?: string;
  polygon_geojson?: string;
  circle_coordinates?: string;
  latitude?: number | null;
  longitude?: number | null;
  radius_km?: number;
  geometry?: any;
  has_valid_location?: boolean;
  polygon_positions?: [number, number][];
  source_url?: string;
  is_active: boolean;
  source?: string;
  sourceType?: string;
  verificationStatus?: string;
  source_badge?: string;
  verified?: boolean;
  fetched_at?: string;
  alertAge?: string;
  dataFreshness?: string;
  officialSourceUrl?: string;
}

export interface DisasterFeedResponse {
  total: number;
  active: number;
  mapped: number;
  unmapped: number;
  disasters: DisasterAlertData[];
}

export interface WeatherData {
  temperature_c?: number;
  humidity_pct?: number;
  rainfall_mm?: number;
  wind_speed_kmh?: number;
  visibility_km?: number;
  condition_text?: string;
  logistics_impact?: string;
  location_name?: string;
  source_api?: string;
}

export interface NavigationStep {
  instruction: string;
  road_name: string;
  distance_m: number;
  duration_s: number;
  type: string;
  modifier?: string;
  location?: [number, number];
}

export interface UserDisasterReport {
  id: number;
  type: string;
  disaster_type?: string;
  hazard_type?: string;
  severity: string;
  latitude: number;
  longitude: number;
  location_name: string;
  radiusKm: number;
  radius_km?: number;
  description: string;
  source: string;
  source_badge: string;
  verified: boolean;
  reportedBy: string;
  reported_by?: string;
  reporter_name?: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  confidence: number;
  contactInfo?: string;
  contact_info?: string;
  estimatedRoadImpact?: string;
  estimated_road_impact?: string;
  evidenceUrl?: string;
  evidence_url?: string;
  image_url?: string;
  review_notes?: string;
  reviewed_by?: string;
  verification_status?: string;
  ai_confidence?: number;
  ai_reason?: string;
  evidence_score?: number;
  location_score?: number;
  consistency_score?: number;
  duplicate_score?: number;
  image_analysis_available?: boolean;
  image_analysis_summary?: string;
  verified_at?: string;
  verification_model?: string;
  verification_version?: string;
  corroboration_count?: number;
  corroborated_sachet_alert_id?: number | null;
  corroborated_sachet_identifier?: string | null;
  location_scope?: string;
  locationScope?: string;
  evidence_hash?: string;
  evidenceHash?: string;
  gps_accuracy?: number;
  gpsAccuracy?: number;
  road_impact?: string;
  unique_evidence_count?: number;
  expires_at?: string;
  signals_breakdown?: Record<string, any>;
  signals_checklist?: SignalChecklistItem[];
}

export interface SachetSyncStatus {
  source: string;
  official_portal?: string;
  officialSourceUrl?: string;
  status: string;
  statusCode?: string;
  statusBadge?: string;
  last_sync_timestamp: string | null;
  last_successful_sync?: string | null;
  last_successful_fetch_time?: string | null;
  lastSuccessfulFetch?: string | null;
  lastCheckedAt?: string | null;
  lastModifiedAt?: string | null;
  last_updated_human?: string;
  last_updated?: string;
  active_alerts_count?: number;
  total_alerts_stored?: number;
  total_active_alerts?: number;
  activeAlertCount?: number;
  expiredAlertCount?: number;
  alertCount?: number;
  etagPresent?: boolean;
  is_live: boolean;
  error?: string | null;
  httpStatus?: number | null;
  alertIndexStatus?: string;
  alertIndexConfigured?: boolean;
  official_endpoint?: string;
  listing_endpoint?: string;
}

export interface ServiceStatusPanel {
  backendApi: { status: string; detail?: string };
  database: { status: string; detail?: string };
  sachetNdma: { status: string; statusCode?: string; isLive?: boolean; lastSuccessfulFetch?: string; etagPresent?: boolean; error?: string | null };
  gps: { status: string; detail?: string };
  routingProvider: { status: string; detail?: string };
  weatherProvider: { status: string; detail?: string };
  aiProvider: { status: string; detail?: string };
  googleMapsProvider: { status: string; detail?: string };
  openStreetMapProvider: { status: string; detail?: string };
}

export type GPSStatus =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'REQUESTING'
  | 'ACQUIRING'
  | 'LIVE'
  | 'WEAK'
  | 'DENIED'
  | 'UNAVAILABLE';

export type SpeedSource =
  | 'DEVICE_GPS'
  | 'LIVE_GPS'
  | 'CALCULATED_GPS'
  | 'CALCULATED_FROM_GPS'
  | 'STATIONARY'
  | 'SPEED_UNAVAILABLE'
  | 'UNAVAILABLE';

export type TravelMode = 'car' | 'truck' | 'walking' | 'bicycle' | 'train' | 'flight';

export interface GPSState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  accuracyMeters?: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  headingDegrees?: number | null;
  rawSpeedMps: number | null;
  rawGpsSpeedMps?: number | null;
  currentSpeedKmh: number | null;
  speedKmh?: number | null;
  speedSource: SpeedSource;
  isMoving?: boolean;
  isStationary?: boolean;
  reasonUnavailable?: string | null;
  selectedTravelMode?: TravelMode;
  timestamp: number | null;
  gpsStatus: GPSStatus;
  gpsQuality?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LOW' | 'VERY_LOW' | 'UNAVAILABLE';
  source?: string;
  permissionStatus: 'granted' | 'prompt' | 'denied' | 'unknown';
  isTracking: boolean;
  lastReliableFix?: { latitude: number; longitude: number; timestamp: number; accuracy: number } | null;
  rawGpsPosition?: [number, number] | null;
  snappedPosition?: [number, number] | null;
  isOffRoute?: boolean;
  offRouteDistanceMeters?: number;
}



