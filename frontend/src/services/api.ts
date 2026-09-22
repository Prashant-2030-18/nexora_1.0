import axios from 'axios';
import {
  User, StateData, DistrictData, RoadData, LogisticsHubData,
  WarehouseData, VehicleData, ShipmentData, IncidentData, AlertData,
  InfrastructureGapData, RouteCalculationResult, AccessibilityScorecard,
  HubEvaluationResult, ScenarioSimulationResult, AICopilotResponse, AuditLogData,
  DisasterAlertData, DisasterFeedResponse
} from '../types';

// ── API base URL configuration ────────────────────────────────────────────────
// When VITE_API_BASE_URL is empty:
// - In local dev: Vite proxy forwards '/api' to localhost:8000
// - On Vercel: vercel.json reverse-proxies '/api' to Render backend (ZERO CORS errors)
// When VITE_API_BASE_URL is explicitly set: uses that URL directly
const _rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE_URL = _rawBase ? _rawBase.replace(/\/$/, '') : '';
const API_BASE = `${API_BASE_URL}/api`;

export const TOKEN_KEY = 'nexora_access_token';
export const USER_KEY = 'nexora_user';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  // Generous 60s timeout for Render server cold starts from standby
  timeout: 60000,
});

// Intercept requests to attach JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

export const api = {
  // Auth
  login: async (credentials: { email: string; password: string }) => {
    const res = await apiClient.post<{ access_token: string; token_type: string; user: User }>('/auth/login', credentials);
    return res.data;
  },
  register: async (userData: { name: string; email: string; password: string; role?: string; state?: string; phone?: string; mobile_number?: string; sms_alerts_enabled?: boolean }) => {
    const res = await apiClient.post<User>('/auth/register', userData);
    return res.data;
  },
  getMe: async () => {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  },
  getHealth: async () => {
    // /health is at root level (not under /api prefix)
    const healthUrl = `${API_BASE_URL}/health`;
    const res = await axios.get<{ status: string; service?: string }>(healthUrl, { timeout: 8000 });
    return res.data;
  },
  getHealthLive: async () => {
    const res = await axios.get<{ status: string; service?: string }>(`${API_BASE_URL}/health/live`, { timeout: 6000 });
    return res.data;
  },
  getHealthReady: async () => {
    const res = await axios.get<{ status: string; database?: string; service?: string }>(`${API_BASE_URL}/health/ready`, { timeout: 8000 });
    return res.data;
  },
  wakeUpBackend: async (onProgress?: (attempt: number, elapsedSec: number) => void): Promise<boolean> => {
    const startTime = Date.now();
    let attempt = 0;
    while (Date.now() - startTime < 35000) {
      attempt++;
      try {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (onProgress) onProgress(attempt, elapsed);
        const res = await axios.get(`${API_BASE_URL}/health/live`, { timeout: 4000 });
        if (res.status === 200) return true;
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(1200 * Math.pow(1.25, attempt), 3500)));
      }
    }
    return false;
  },

  // States & Districts
  getStates: async () => {
    const res = await apiClient.get<StateData[]>('/states');
    return res.data;
  },
  getDistricts: async (stateName?: string) => {
    const res = await apiClient.get<DistrictData[]>('/districts', {
      params: { state_name: stateName }
    });
    return res.data;
  },
  getDistrictById: async (id: number) => {
    const res = await apiClient.get<DistrictData>(`/districts/${id}`);
    return res.data;
  },

  // Roads
  getRoads: async (state?: string) => {
    const res = await apiClient.get<RoadData[]>('/roads', {
      params: { state }
    });
    return res.data;
  },

  // Logistics
  getLogisticsHubs: async (state?: string) => {
    const res = await apiClient.get<LogisticsHubData[]>('/logistics-hubs', {
      params: { state }
    });
    return res.data;
  },
  getWarehouses: async (state?: string, coldStorageOnly?: boolean) => {
    const res = await apiClient.get<WarehouseData[]>('/warehouses', {
      params: { state, cold_storage_only: coldStorageOnly }
    });
    return res.data;
  },
  getFleet: async (status?: string) => {
    const res = await apiClient.get<VehicleData[]>('/fleet', { params: { status } });
    return res.data;
  },
  getShipments: async (status?: string) => {
    const res = await apiClient.get<ShipmentData[]>('/shipments', { params: { status } });
    return res.data;
  },
  createShipment: async (payload: { origin: string; destination: string; cargo_type: string; cargo_weight: number; vehicle_id?: number }) => {
    const res = await apiClient.post<ShipmentData>('/shipments', payload);
    return res.data;
  },
  applyLogisticsOptimization: async (actionType: string = "reroute_barak_axis") => {
    const res = await apiClient.post('/logistics/apply-optimization', { action_type: actionType });
    return res.data;
  },

  // Incidents & Live Disasters
  getIncidents: async (state?: string, statusFilter?: string, severity?: string) => {
    const res = await apiClient.get<IncidentData[]>('/incidents', {
      params: { state, status_filter: statusFilter, severity }
    });
    return res.data;
  },
  createIncident: async (payload: Partial<IncidentData>) => {
    const res = await apiClient.post<IncidentData>('/incidents', payload);
    return res.data;
  },
  updateIncident: async (id: number, payload: Partial<IncidentData>) => {
    const res = await apiClient.put<IncidentData>(`/incidents/${id}`, payload);
    return res.data;
  },
  deleteIncident: async (id: number) => {
    const res = await apiClient.delete(`/incidents/${id}`);
    return res.data;
  },
  refreshSimulatedIncidents: async () => {
    const res = await apiClient.post('/incidents/refresh-simulated');
    return res.data;
  },

  // Route Planning & Rerouting
  calculateSmartRoutes: async (payload: {
    origin: string;
    destination: string;
    vehicle_type?: string;
    cargo_type?: string;
    cargo_weight?: number;
    priority?: string;
    travel_mode?: string;
    origin_lat?: number;
    origin_lon?: number;
    dest_lat?: number;
    dest_lon?: number;
  }) => {
    const res = await apiClient.post<RouteCalculationResult>('/routes/calculate', payload);
    return res.data;
  },

  applyReroute: async (payload: { shipment_id?: number; current_route_name: string; origin: string; destination: string }) => {
    const res = await apiClient.post('/routes/reroute', payload);
    return res.data;
  },

  // Accessibility Intelligence
  getAccessibilityScores: async (state?: string, sortOrder: string = 'asc') => {
    const res = await apiClient.get<{ districts_scored_count: number; state_averages: any[]; districts: AccessibilityScorecard[] }>('/accessibility', {
      params: { state, sort_order: sortOrder }
    });
    return res.data;
  },
  getDistrictAccessibility: async (districtId: number) => {
    const res = await apiClient.get<AccessibilityScorecard>(`/accessibility/${districtId}`);
    return res.data;
  },

  // What-If Scenario Simulator
  runSimulation: async (payload: {
    scenario_type: string;
    road_name?: string;
    hub_location?: string;
    hub_capacity?: number;
    start_point?: string;
    end_point?: string;
    distance_km?: number;
  }) => {
    const res = await apiClient.post<ScenarioSimulationResult>('/simulation', payload);
    return res.data;
  },
  getSimulationHistory: async () => {
    const res = await apiClient.get<any[]>('/simulation/history');
    return res.data;
  },

  // Hub Planner
  evaluateHubLocation: async (lat: number, lng: number, targetCapacity: number = 5000.0) => {
    const res = await apiClient.post<HubEvaluationResult>('/hub-planner/evaluate', {
      latitude: lat,
      longitude: lng,
      target_capacity_mt: targetCapacity
    });
    return res.data;
  },

  // Infrastructure Gaps
  getInfrastructureGaps: async (state?: string, severity?: string) => {
    const res = await apiClient.get<InfrastructureGapData[]>('/infrastructure-gaps', {
      params: { state, severity }
    });
    return res.data;
  },

  // Predictions
  getPredictions: async () => {
    const res = await apiClient.get<any>('/predictions');
    return res.data;
  },

  // Analytics & KPIs
  getDashboardKpis: async (state?: string) => {
    const res = await apiClient.get<any>('/analytics/kpis', { params: { state } });
    return res.data;
  },
  getAnalyticsCharts: async (state?: string) => {
    const res = await apiClient.get<any>('/analytics/charts', { params: { state } });
    return res.data;
  },
  getPriorityDevelopmentAreas: async () => {
    const res = await apiClient.get<any[]>('/analytics/priority-development-areas');
    return res.data;
  },

  // AI Copilot
  queryCopilot: async (
    query: string,
    contextState: string = 'All',
    userRole: string = 'admin',
    navContext?: Record<string, any>
  ) => {
    const res = await apiClient.post<AICopilotResponse>('/ai/query', {
      query,
      context_state: contextState,
      user_role: userRole,
      ...(navContext || {})
    });
    return res.data;
  },

  // Notifications
  getNotifications: async (state?: string, unreadOnly?: boolean) => {
    const res = await apiClient.get<AlertData[]>('/notifications', {
      params: { state, unread_only: unreadOnly }
    });
    return res.data;
  },
  markNotificationRead: async (id: number) => {
    const res = await apiClient.post(`/notifications/${id}/read`);
    return res.data;
  },
  markAllNotificationsRead: async () => {
    const res = await apiClient.post('/notifications/mark-all-read');
    return res.data;
  },

  // Admin Management
  getAdminUsers: async () => {
    const res = await apiClient.get<User[]>('/admin/users');
    return res.data;
  },
  createAdminUser: async (userData: any) => {
    const res = await apiClient.post<User>('/admin/users', userData);
    return res.data;
  },
  toggleUserStatus: async (userId: number, isActive: boolean) => {
    const res = await apiClient.put(`/admin/users/${userId}/status`, { is_active: isActive });
    return res.data;
  },
  updateUserRole: async (userId: number, role: string) => {
    const res = await apiClient.put(`/admin/users/${userId}/role`, { role });
    return res.data;
  },
  deleteUser: async (userId: number) => {
    const res = await apiClient.delete(`/admin/users/${userId}`);
    return res.data;
  },
  getAuditLogs: async () => {
    const res = await apiClient.get<AuditLogData[]>('/admin/audit-logs');
    return res.data;
  },

  // Global Geocoding Search
  searchLocations: async (query: string, limit: number = 6) => {
    const res = await apiClient.get<any[]>('/geo/search', { params: { q: query, limit } });
    return res.data;
  },
  reverseGeocode: async (lat: number, lon: number) => {
    const res = await apiClient.get<any>('/geo/reverse', { params: { lat, lon } });
    return res.data;
  },

  // Live Disasters & SACHET NDMA
  getDisasters: async (state?: string) => {
    const res = await apiClient.get<DisasterFeedResponse>('/disasters', { params: { state } });
    return res.data;
  },
  getDisasterAlerts: async (state?: string) => {
    const res = await apiClient.get<DisasterAlertData[]>('/disasters/live', { params: { state } });
    return res.data;
  },
  syncSachetAlerts: async (force: boolean = false) => {
    const res = await apiClient.post<any>('/disasters/sachet/sync', null, { params: { force } });
    return res.data;
  },
  getSachetSyncStatus: async () => {
    const res = await apiClient.get<any>('/disasters/status');
    return res.data;
  },
  getRouteDisasters: async (coordinates: number[][], buffer_km = 12) => {
    const res = await apiClient.post<any>('/disasters/route', { coordinates, buffer_km });
    return res.data;
  },
  getServicesStatus: async () => {
    const res = await apiClient.get<any>('/services/status');
    return res.data;
  },

  // User Disaster Reporting (Feature 1)
  reportUserDisaster: async (payload: {
    type: string;
    severity: string;
    latitude: number;
    longitude: number;
    location_name?: string;
    radiusKm?: number;
    description: string;
    reportedBy?: string;
    contactInfo?: string;
    estimatedRoadImpact?: string;
    evidenceUrl?: string;
    gps_accuracy?: number;
    evidence_hash?: string;
  }) => {
    const res = await apiClient.post<any>('/disasters/report', payload);
    return res.data;
  },
  getUserReportedDisasters: async (status?: string) => {
    const res = await apiClient.get<any[]>('/disasters/user-reported', { params: { status } });
    return res.data;
  },
  getUserReportStats: async () => {
    const res = await apiClient.get<{
      total: number;
      ai_verified: number;
      ai_review: number;
      ai_rejected: number;
      corroborated: number;
      pending: number;
      approved: number;
      rejected: number;
    }>('/disasters/user-reported/stats');
    return res.data;
  },
  uploadReportEvidence: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ status: string; image_url: string; filename: string; size: number; evidence_hash?: string }>(
      '/disasters/report/evidence',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return res.data;
  },
  reverifyUserReport: async (id: number) => {
    const res = await apiClient.post<any>(`/disasters/user-reported/${id}/reverify`);
    return res.data;
  },
  approveUserReport: async (id: number, notes?: string) => {
    const res = await apiClient.patch<any>(`/disasters/user-reported/${id}/approve`, { notes });
    return res.data;
  },
  rejectUserReport: async (id: number, notes?: string) => {
    const res = await apiClient.patch<any>(`/disasters/user-reported/${id}/reject`, { notes });
    return res.data;
  },
  updateUserDisaster: async (id: number, payload: any) => {
    const res = await apiClient.patch<any>(`/disasters/${id}`, payload);
    return res.data;
  },
  deleteUserDisaster: async (id: number) => {
    const res = await apiClient.delete<any>(`/disasters/${id}`);
    return res.data;
  },

  // Citizen Disaster Reports
  submitUserReport: async (reportData: any) => {
    const res = await apiClient.post<any>('/user-reports', reportData);
    return res.data;
  },
  getVerifiedUserReports: async () => {
    const res = await apiClient.get<any[]>('/user-reports/verified');
    return res.data;
  },
  getPendingUserReports: async () => {
    const res = await apiClient.get<any[]>('/user-reports/pending');
    return res.data;
  },
  getAllUserReports: async (statusFilter?: string) => {
    const res = await apiClient.get<any[]>('/user-reports', { params: { status_filter: statusFilter } });
    return res.data;
  },
  moderateUserReport: async (reportId: number, status: string, notes?: string) => {
    const res = await apiClient.put<any>(`/user-reports/${reportId}/moderate`, { status, review_notes: notes });
    return res.data;
  },

  // Weather Telemetry
  getWeather: async (lat?: number, lon?: number, location?: string) => {
    const res = await apiClient.get<any>('/weather', { params: { lat, lon, location } });
    return res.data;
  },

  // Admin Data Sources & Pipeline Status
  getDataSourcesStatus: async () => {
    const res = await apiClient.get<any>('/admin/data-sources');
    return res.data;
  },

  // Report Download URLs
  getReportDownloadUrl: (reportType: string, fileFormat: string = 'pdf') => {
    return `/api/reports/download?report_type=${reportType}&file_format=${fileFormat}`;
  }
};
