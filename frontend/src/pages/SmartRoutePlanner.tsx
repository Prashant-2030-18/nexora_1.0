import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Route, ArrowRight, ShieldCheck, Zap, DollarSign,
  AlertTriangle, CheckCircle2, Clock, Fuel, Navigation,
  Layers, Compass, Sparkles, RefreshCw, MapPin, Locate,
  Check, X, CloudRain, Shield, Activity, Bot,
  Car, Truck, Gauge, Radio, AlertOctagon, CornerUpRight, ArrowUpRight,
  TrendingUp, BarChart3, Database, ShieldAlert,
  Footprints, Bike, Train, Plane, ArrowLeftRight, Info
} from 'lucide-react';
import { api } from '../services/api';
import { useDisasters } from '../context/DisasterContext';
import { useGPS } from '../context/GPSContext';
import { useConnectivity } from '../context/ConnectivityContext';
import { useAuth } from '../context/AuthContext';
import {
  startJourney, finishJourney, startHeartbeat, stopHeartbeat,
  restoreActiveJourney, getCurrentJourneyId
} from '../services/journeySession';
import { cacheRoute, getCachedRoute, cacheHazards } from '../services/offlineStore';
import { MapView } from '../components/MapView';
import { Map3DView } from '../components/Map3DView';
import { NavigationHUD } from '../components/NavigationHUD';
import { NavigationMap } from '../components/navigation/NavigationMap';
import { NavigationErrorBoundary } from '../components/navigation/NavigationErrorBoundary';
import { Basic2DNavigationMap } from '../components/navigation/Basic2DNavigationMap';
import { NavigationPreparationOverlay } from '../components/navigation/NavigationPreparationOverlay';
import { RouteMismatchDialog } from '../components/navigation/RouteMismatchDialog';
import { NavigationExperience } from '../components/navigation/NavigationExperience';
import { useNavigation } from '../context/NavigationContext';
import { GPSQuality, classifyGPSQuality } from '../context/GPSContext';
import { ReportDisasterModal } from '../components/ReportDisasterModal';
import { isValidCoordinate } from '../utils/coordinates';
import { DistrictData, IncidentData, DisasterAlertData, UserDisasterReport, NavigationStep, TravelMode } from '../types';

export interface StructuredLocation {
  label: string;
  latitude: number | null;
  longitude: number | null;
  source: 'GPS' | 'SEARCH' | 'MAP_PICK' | 'QUICK_SELECT' | 'MANUAL';
  accuracyMeters?: number | null;
  timestamp?: number | null;
}

interface RouteProfile {
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
  geometry_coordinates: number[][];
  hazards_on_route: number;
  note: string;
  waypoint_names?: string[];
}

export interface RealRouteResponse {
  origin: string;
  origin_geocoded: string;
  destination: string;
  destination_geocoded: string;
  origin_lat: number;
  origin_lon: number;
  dest_lat: number;
  dest_lon: number;
  vehicle_type: string;
  cargo_type: string;
  weather?: any;
  weather_impact: string;
  active_hazards_count: number;
  route_intersecting_hazards: any[];
  navigation_steps?: NavigationStep[];
  disruption_detected: boolean;
  hazard_warning?: string;
  alternative_routes_available?: boolean;
  route_status_message?: string;
  data_sources: string[];
  travel_mode?: string;
  provider_status?: string;
  // Flight-specific
  origin_airport?: { iata: string; name: string; city: string; state: string; runway: string; distance_to_query_km?: number };
  dest_airport?: { iata: string; name: string; city: string; state: string; runway: string; distance_to_query_km?: number };
  flight_level?: string;
  aircraft_type?: string;
  cruise_speed_kmh?: number;
  flight_advisory?: string;
  routes: {
    fastest: RouteProfile;
    cheapest: RouteProfile;
    safest: RouteProfile;
    reliable: RouteProfile;
  };
}

export const SmartRoutePlanner: React.FC = () => {
  // Mode switch: Operator vs Driver
  const [plannerMode, setPlannerMode] = useState<'operator' | 'driver'>('operator');
  // Travel mode & Live GPS from unified GPSContext (single source of truth)
  const {
    gps,
    debugTelemetry,
    selectedTravelMode,
    setSelectedTravelMode,
    startTracking,
    stopTracking,
    acquireRefinedFix,
  } = useGPS();
  const {
    navigationState,
    setNavigationState,
    navigationError,
    setNavigationError,
    isBasic2DMode,
    setIsBasic2DMode,
    isNavigating,
    isRoutePreview,
    setIsRoutePreview,
    startNavigationSession,
    stopNavigationSession,
    onMapReady,
    onMapError,
    updateActiveRoute,
    cancelPreparation,
  } = useNavigation();
  const [showMismatchDialog, setShowMismatchDialog] = useState<boolean>(false);

  // Preparation overlay state
  const [prepGpsError, setPrepGpsError] = useState<{
    code: 'PERMISSION_DENIED' | 'GPS_UNAVAILABLE' | 'TIMEOUT' | 'INSECURE_CONTEXT' | string;
    message: string;
    recentFix?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: number;
    } | null;
  } | null>(null);
  const [prepGpsAccuracy, setPrepGpsAccuracy] = useState<number | null>(null);
  const [prepGpsQuality, setPrepGpsQuality] = useState<GPSQuality | null>(null);
  const [isStartingAnyway, setIsStartingAnyway] = useState<boolean>(false);
  const [gpsOverrideAccepted, setGpsOverrideAccepted] = useState<boolean>(false);
  const [mapEngineFailed, setMapEngineFailed] = useState<boolean>(false);
  const mapInitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const travelMode = selectedTravelMode;
  const setTravelMode = setSelectedTravelMode;
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  // Unavailability notice from backend for non-road modes
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  // Collapsible route maneuver details
  const [showRouteDetails, setShowRouteDetails] = useState<boolean>(false);

  // Route input parameters - default empty
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originLocation, setOriginLocation] = useState<StructuredLocation | null>(null);
  const [destLocation, setDestLocation] = useState<StructuredLocation | null>(null);
  const [gpsAcquisitionText, setGpsAcquisitionText] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState('Heavy Duty Truck');
  const [cargoType, setCargoType] = useState('Essential Commodities');
  const [cargoWeight, setCargoWeight] = useState<number>(10.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { disasters } = useDisasters();
  const [routeResult, setRouteResult] = useState<RealRouteResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<'fastest' | 'cheapest' | 'safest' | 'reliable'>('fastest');
  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [userDisasters, setUserDisasters] = useState<UserDisasterReport[]>([]);
  const [liveKpis, setLiveKpis] = useState<any>(null);

  // Disaster reporting modal & interactive map-pick state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [mapPickTarget, setMapPickTarget] = useState<'origin' | 'destination' | 'disaster' | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [pickedCoord, setPickedCoord] = useState<{ lat: number; lng: number } | null>(null);

  // Turn-by-turn Telemetry state
  const [navTelemetry, setNavTelemetry] = useState<{
    speedKmh: number | null;
    speedSource: 'LIVE GPS' | 'CALCULATED FROM GPS' | 'SIMULATED' | 'UNAVAILABLE';
    headingDeg: number | null;
    accuracyMeters: number | null;
    lat: number;
    lng: number;
    isOffRoute: boolean;
    offRouteDistanceMeters: number;
  }>({
    speedKmh: null,
    speedSource: 'UNAVAILABLE',
    headingDeg: null,
    accuracyMeters: null,
    lat: 0,
    lng: 0,
    isOffRoute: false,
    offRouteDistanceMeters: 0,
  });
  const [mapDimension, setMapDimension] = useState<'2d' | '3d'>('2d');
  const [webglFailed, setWebglFailed] = useState(false);

  // Authentication & Connectivity Context
  const { user } = useAuth();
  const { connectionState, lastSachetSync, getOfflineAgeMinutes } = useConnectivity();
  const isOffline = connectionState === 'OFFLINE' || connectionState === 'RESTORING';

  // Emergency SMS Fallback Consent & Settings (spec §24-33, §66)
  const [smsConsent, setSmsConsent] = useState(user?.sms_alerts_enabled ?? false);
  const [smsPhone, setSmsPhone] = useState(user?.mobile_number || user?.phone || '');
  const [showSmsConfig, setShowSmsConfig] = useState(false);
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null);
  const [isOfflineCachedRoute, setIsOfflineCachedRoute] = useState(false);

  useEffect(() => {
    if (user?.mobile_number || user?.phone) {
      setSmsPhone(user.mobile_number || user.phone || '');
    }
    if (user?.sms_alerts_enabled !== undefined) {
      setSmsConsent(Boolean(user.sms_alerts_enabled));
    }
  }, [user]);

  // Copilot inline state
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Autocomplete state
  const [originQuery, setOriginQuery] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);

  const [destQuery, setDestQuery] = useState('');
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  const [isLocating, setIsLocating] = useState(false);
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  // Driver Mode Live GPS Tracking derived from GPSContext
  const driverGps = {
    lat: gps.latitude ?? 0,
    lng: gps.longitude ?? 0,
    speedKmh: gps.currentSpeedKmh,
    status: (gps.isTracking && gps.latitude !== null ? 'connected' : (gps.isTracking ? 'searching' : 'not_connected')) as 'connected' | 'not_connected' | 'searching',
    error: gps.permissionStatus === 'denied' ? 'Permission denied' : undefined
  };

  const quickCities = ["Guwahati", "Shillong", "Silchar", "Imphal", "Dimapur", "Bengaluru", "Mangaluru", "Delhi"];

  // Click outside suggestion dropdowns
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (originRef.current && !originRef.current.contains(e.target as Node)) {
        setShowOriginSuggestions(false);
      }
      if (destRef.current && !destRef.current.contains(e.target as Node)) {
        setShowDestSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch base districts, incidents, SACHET disasters, user disasters, and KPIs
  useEffect(() => {
    const loadBase = async () => {
      try {
        const [dList, incList, kpis, userList] = await Promise.all([
          api.getDistricts('All'),
          api.getIncidents('All'),
          api.getDashboardKpis('All'),
          api.getUserReportedDisasters().catch(() => [])
        ]);
        setDistricts(dList || []);
        setIncidents(incList || []);
        setLiveKpis(kpis);
        setUserDisasters(userList || []);
      } catch (err) {
        console.error("Base data fetch error:", err);
      }
    };
    loadBase();
  }, []);

  // Debounced search for Origin
  useEffect(() => {
    if (!originQuery || originQuery.length < 2) {
      setOriginSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchLocations(originQuery, 5);
        setOriginSuggestions(results);
        setShowOriginSuggestions(true);
      } catch (err) {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [originQuery]);

  // Debounced search for Destination
  useEffect(() => {
    if (!destQuery || destQuery.length < 2) {
      setDestSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchLocations(destQuery, 5);
        setDestSuggestions(results);
        setShowDestSuggestions(true);
      } catch (err) {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destQuery]);

  // Track dismissed origin mismatch
  const [dismissedMismatchOrigin, setDismissedMismatchOrigin] = useState<string | null>(null);

  // Haversine distance helper (km)
  const haversineDistKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const originDistanceToGpsKm = (gps.latitude !== null && gps.longitude !== null && routeResult?.origin_lat && routeResult?.origin_lon)
    ? haversineDistKm(gps.latitude, gps.longitude, routeResult.origin_lat, routeResult.origin_lon)
    : 0;

  const showOriginMismatch = gps.latitude !== null &&
    gps.longitude !== null &&
    routeResult &&
    originDistanceToGpsKm > 1.5 &&
    dismissedMismatchOrigin !== origin;

  // Handle GPS location click for Origin input using refined multi-sample acquisition
  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setGpsAcquisitionText('Requesting location permission...');
    setError(null);

    try {
      const fix = await acquireRefinedFix((status, acc) => {
        if (status === 'REQUESTING_LOCATION') {
          setGpsAcquisitionText('Requesting permission...');
        } else if (status === 'ACQUIRING_GPS') {
          setGpsAcquisitionText(acc ? `Acquiring GPS (±${acc}m)...` : 'Acquiring GPS...');
        } else if (status === 'GPS_FOUND') {
          setGpsAcquisitionText(`GPS locked (±${acc}m)`);
        } else if (status === 'GPS_WEAK') {
          setGpsAcquisitionText(`Weak GPS signal (±${acc}m)`);
        }
      }, 6000);

      const lat = fix.latitude;
      const lon = fix.longitude;
      let label = `Current GPS Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

      try {
        const rev = await api.reverseGeocode(lat, lon);
        if (rev && rev.display_name) {
          label = rev.display_name;
        }
      } catch (revErr) {
        console.warn('[GPS] Reverse geocoding failed, using coordinates:', revErr);
      }

      const structLoc: StructuredLocation = {
        label,
        latitude: lat,
        longitude: lon,
        source: 'GPS',
        accuracyMeters: fix.accuracy,
        timestamp: fix.timestamp,
      };

      setOrigin(label);
      setOriginQuery(label);
      setOriginLocation(structLoc);
      setDismissedMismatchOrigin(label);
      setRouteResult(null);

      if (fix.warningMessage) {
        console.warn('[GPS]', fix.warningMessage);
      }

      if (destination.trim()) {
        handleCalculate(label, structLoc);
      }
    } catch (gpsErr: any) {
      setError(gpsErr?.message || 'Failed to acquire device GPS location.');
    } finally {
      setIsLocating(false);
      setGpsAcquisitionText(null);
    }
  };

  const handleRouteFromCurrentGps = async () => {
    handleUseCurrentLocation();
  };

  // Load user ground reports, districts, and incidents
  useEffect(() => {
    const fetchHazards = async () => {
      try {
        const [userRes, distRes, incRes] = await Promise.all([
          api.getUserReportedDisasters(),
          api.getDistricts(),
          api.getIncidents(),
        ]);
        setUserDisasters(userRes || []);
        setDistricts(distRes || []);
        setIncidents(incRes || []);
      } catch (err) {
        console.warn('Hazard data fetch failed:', err);
      }
    };
    fetchHazards();
  }, []);

  // Real GPS tracking for Driver Mode & Navigation HUD bound to GPSContext
  useEffect(() => {
    if (plannerMode === 'driver' || isNavigating) {
      startTracking();
    }
  }, [plannerMode, isNavigating, startTracking]);

  // Recalculate route automatically when travelMode changes only if endpoints exist
  useEffect(() => {
    if (origin.trim() && destination.trim()) {
      handleCalculate();
    }
  }, [travelMode]);

  // Swap Origin and Destination
  const handleSwapLocations = () => {
    const tempOrigin = origin;
    const tempOriginQuery = originQuery;
    const tempOriginLoc = originLocation;
    setOrigin(destination);
    setOriginQuery(destQuery);
    setOriginLocation(destLocation);
    setDestination(tempOrigin);
    setDestQuery(tempOriginQuery);
    setDestLocation(tempOriginLoc);
    setRouteResult(null);
  };

  // Calculate Routes API call with automatic offline cache fallback
  const handleCalculate = async (customOrigin?: string | unknown, customOriginLoc?: StructuredLocation) => {
    const originToUse = typeof customOrigin === 'string' ? customOrigin : origin;
    const originLocToUse = customOriginLoc || originLocation;

    if (!originToUse.trim() || !destination.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    setUnavailableNotice(null);
    try {
      const res: any = await api.calculateSmartRoutes({
        origin: originToUse,
        destination,
        vehicle_type: vehicleType,
        cargo_type: cargoType,
        cargo_weight: cargoWeight,
        travel_mode: travelMode,
        origin_lat: originLocToUse?.latitude ?? undefined,
        origin_lon: originLocToUse?.longitude ?? undefined,
        dest_lat: destLocation?.latitude ?? undefined,
        dest_lon: destLocation?.longitude ?? undefined,
      });

      // Backend returns status: 'unavailable' for non-configured modes
      if (res.available === false || res.status === 'unavailable') {
        setUnavailableNotice(res.notice || res.message || `${travelMode} routing is not available on this corridor.`);
        setRouteResult(null);
      } else if (res.error) {
        setError(res.error);
        setRouteResult(null);
      } else {
        setRouteResult(res);
        setUnavailableNotice(null);
        setIsOfflineCachedRoute(false);
        if (res.disruption_detected) {
          setSelectedStrategy('safest');
        } else {
          setSelectedStrategy('fastest');
        }

        // Cache route to IndexedDB for offline resilience (spec §10, §11)
        try {
          const cacheKey = `${origin.trim()}-${destination.trim()}-${travelMode}`.toLowerCase();
          await cacheRoute({
            id: cacheKey,
            geometry: res.routes?.fastest?.geometry_coordinates || [],
            navigationSteps: res.navigation_steps || [],
            destination: destination.trim(),
            distanceKm: res.routes?.fastest?.distance_km || 0,
            etaFormatted: res.routes?.fastest?.eta_formatted || '',
            routeProvider: res.routes?.fastest?.note || travelMode,
            cachedAt: new Date().toISOString()
          });
        } catch (cErr) {
          console.warn('[OfflineStore] Route cache error:', cErr);
        }
      }
    } catch (err: any) {
      console.warn('[SmartRoutePlanner] API route calculation failed. Checking offline cache...', err);
      // Attempt to load from offline IndexedDB cache (spec §11)
      try {
        const cacheKey = `${origin.trim()}-${destination.trim()}-${travelMode}`.toLowerCase();
        const cached = await getCachedRoute(cacheKey);
        if (cached && cached.geometry && cached.geometry.length > 0) {
          const offlineProfile: RouteProfile = {
            strategy: 'fastest',
            distance_km: cached.distanceKm,
            eta_hours: 1,
            eta_formatted: cached.etaFormatted || 'Cached ETA',
            fuel_cost_inr: 0,
            toll_cost_inr: 0,
            total_cost_inr: 0,
            risk_score: 10,
            reliability_score: 90,
            weather_exposure: 'Cached Weather Baseline',
            geometry_coordinates: cached.geometry,
            hazards_on_route: 0,
            note: `Offline Cached Route (${cached.routeProvider || 'Local Cache'}). Verified corridor preserved.`
          };
          setRouteResult({
            origin,
            origin_geocoded: origin,
            destination,
            destination_geocoded: destination,
            origin_lat: cached.geometry[0]?.[1] || 26.14,
            origin_lon: cached.geometry[0]?.[0] || 91.73,
            dest_lat: cached.geometry[cached.geometry.length - 1]?.[1] || 25.57,
            dest_lon: cached.geometry[cached.geometry.length - 1]?.[0] || 91.88,
            vehicle_type: vehicleType,
            cargo_type: cargoType,
            weather_impact: 'CACHED',
            active_hazards_count: 0,
            route_intersecting_hazards: [],
            navigation_steps: cached.navigationSteps || [],
            disruption_detected: false,
            data_sources: ['OFFLINE_INDEXEDDB_CACHE'],
            travel_mode: travelMode,
            provider_status: 'CACHED',
            routes: {
              fastest: offlineProfile,
              cheapest: offlineProfile,
              safest: offlineProfile,
              reliable: offlineProfile
            }
          });
          setIsOfflineCachedRoute(true);
          setError(null);
          return;
        }
      } catch (cacheLookupErr) {
        console.warn('[OfflineStore] Cache lookup error:', cacheLookupErr);
      }
      setError(err?.response?.data?.detail || 'Failed to calculate route and no offline cache available for this corridor.');
      setRouteResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Start dedicated professional navigation session (spec §4, §5)
  const proceedWithStartNavigation = async (overrideRouteResult?: RealRouteResponse) => {
    setShowMismatchDialog(false);
    const resultToUse = overrideRouteResult || routeResult;
    if (!resultToUse) {
      setError('Please calculate and select a valid route before starting navigation.');
      setNavigationState('ERROR');
      return;
    }

    const activeRouteProfile = resultToUse.routes?.[selectedStrategy] || resultToUse.routes?.fastest;
    const geometry = activeRouteProfile?.geometry_coordinates || [];

    if (!geometry || geometry.length < 2) {
      setError('Selected route geometry is empty or invalid. Please recalculate.');
      setNavigationState('ERROR');
      return;
    }

    console.log('[NavigationPrep] route & GPS ready, initializing navigation session');

    const started = startNavigationSession({
      journeyId: activeJourneyId,
      travelMode,
      geometry,
      navigationSteps: resultToUse.navigation_steps || [],
      distanceKm: activeRouteProfile.distance_km || 0,
      etaMinutes: Math.round((activeRouteProfile.eta_hours || 1) * 60),
      hazards: resultToUse.route_intersecting_hazards || [],
      initialLifecycleState: 'ACTIVE',
    });

    if (!started) {
      return;
    }

    setPlannerMode('driver');
    startTracking();

    if (mapInitTimeoutRef.current) {
      clearTimeout(mapInitTimeoutRef.current);
      mapInitTimeoutRef.current = null;
    }

    setNavigationState('ACTIVE');
    setIsStartingAnyway(false);
    setMapEngineFailed(false);

    try {
      const jId = await startJourney({
        travelMode,
        origin,
        destination,
        originLat: resultToUse.origin_lat,
        originLon: resultToUse.origin_lon,
        destLat: resultToUse.dest_lat,
        destLon: resultToUse.dest_lon,
        routeGeometry: geometry,
        routeProvider: resultToUse.data_sources?.[0] || travelMode,
        routeId: selectedStrategy,
        smsConsent,
        phoneNumber: smsConsent ? (smsPhone || user?.phone) : undefined,
        navigationSteps: resultToUse.navigation_steps,
        distanceKm: activeRouteProfile.distance_km,
        etaFormatted: activeRouteProfile.eta_formatted,
      });

      if (jId) {
        setActiveJourneyId(jId);
        startHeartbeat(
          jId,
          () => gps,
          () => 0.1,
          () => !isOffline
        );
      }
    } catch (jErr) {
      console.warn('[Journey] Failed to start backend journey session:', jErr);
    }
  };

  const handleStartNavigationTrigger = async () => {
    console.log('[NAV] Start navigation requested');
    console.log('[NAV] selectedRoute exists =', !!routeResult);

    if (!routeResult || !routeResult.routes) {
      setError('ROUTE DATA UNAVAILABLE: Please calculate and select a valid route before starting navigation.');
      return;
    }

    const activeRouteProfile = routeResult.routes[selectedStrategy] || routeResult.routes.fastest;
    const geometry = activeRouteProfile?.geometry_coordinates || [];

    console.log('[NAV] route geometry points =', geometry.length);
    console.log('[NAV] origin =', origin);
    console.log('[NAV] destination =', destination);
    console.log('[NAV] GPS accepted =', gps.latitude !== null && gps.longitude !== null);

    if (!geometry || geometry.length < 2) {
      setError('Selected route has invalid geometry. Please recalculate.');
      return;
    }

    // Check if phone GPS location is far from route origin (> 1.5 km) and origin was not set via GPS
    if (
      originLocation?.source !== 'GPS' &&
      gps.latitude !== null &&
      gps.longitude !== null &&
      routeResult.origin_lat &&
      routeResult.origin_lon
    ) {
      const dist = haversineDistKm(gps.latitude, gps.longitude, routeResult.origin_lat, routeResult.origin_lon);
      if (dist > 1.5 && dismissedMismatchOrigin !== origin) {
        setShowMismatchDialog(true);
        return;
      }
    }

    // Clear previous error
    setPrepGpsError(null);
    setIsRoutePreview(false);

    // 1. Permission Check: Only block if permission is explicitly denied (Spec §2)
    if (gps.permissionStatus === 'denied') {
      setPrepGpsError({
        code: 'PERMISSION_DENIED',
        message: 'Location permission is denied in browser settings. Enable precise location to start live navigation, or preview the route.',
      });
      setNavigationState('CHECKING_PERMISSION');
      return;
    }

    // 2. Activate single live location engine
    startTracking();

    // 3. Immediately launch live navigation! (Zero blocking, Google-Maps-style instant open)
    console.log('[NAV] Launching live navigation immediately');
    proceedWithStartNavigation();
  };

  const handleStartRoutePreview = () => {
    console.log('[NAV] Starting in Route Preview Mode (GPS Off)');
    setIsRoutePreview(true);
    setPrepGpsError(null);
    proceedWithStartNavigation();
  };

  const handleRetryGpsInPrep = async () => {
    setPrepGpsError(null);
    setNavigationState('ACQUIRING_LOCATION');
    startTracking();
    try {
      const fix = await acquireRefinedFix((status, curAcc) => {
        if (curAcc) setPrepGpsAccuracy(curAcc);
      }, 4000, true);

      setPrepGpsAccuracy(fix.accuracy);
      setPrepGpsQuality(fix.accuracyQuality);
      setNavigationState('READY');
      proceedWithStartNavigation();
    } catch (err: any) {
      if (gps.latitude !== null && gps.longitude !== null) {
        proceedWithStartNavigation();
      } else {
        setPrepGpsError({
          code: err.gpsErrorCode || 'TIMEOUT',
          message: err.message || 'Unable to acquire reliable GPS signal.',
          recentFix: err.recentFix || null,
        });
      }
    }
  };

  const handleStartAnywayInPrep = () => {
    console.log('[NavigationPrep] startAnyway clicked');
    if (isStartingAnyway) return; // Prevent double click

    // Validate current GPS coordinates from GPSContext or preparation state
    const currentLat = gps.latitude;
    const currentLon = gps.longitude;
    const currentAcc = prepGpsAccuracy ?? gps.accuracy ?? 79;
    const timestamp = gps.timestamp;

    if (
      currentLat === null ||
      currentLon === null ||
      !Number.isFinite(currentLat) ||
      !Number.isFinite(currentLon) ||
      (currentLat === 0 && currentLon === 0) ||
      currentLat < -90 ||
      currentLat > 90 ||
      currentLon < -180 ||
      currentLon > 180
    ) {
      console.warn('[NavigationPrep] Cannot Start Anyway: Invalid GPS coordinates', { currentLat, currentLon });
      setPrepGpsError({
        code: 'GPS_UNAVAILABLE',
        message: 'No valid GPS coordinates available. Please wait for signal or turn on location services.',
      });
      return;
    }

    // Check staleness (> 60s)
    if (timestamp && Date.now() - timestamp > 60000) {
      console.warn('[NavigationPrep] Cannot Start Anyway: Stale GPS fix (>60s old)');
      setPrepGpsError({
        code: 'TIMEOUT',
        message: 'GPS fix is stale (last updated >60 seconds ago). Please refresh GPS before starting navigation.',
      });
      return;
    }

    console.log(`[NavigationPrep] accepted fix: lat ${currentLat}, lon ${currentLon}, accuracy ±${currentAcc}m`);
    setIsStartingAnyway(true);
    setGpsOverrideAccepted(true);
    setPrepGpsError(null);
    setMapEngineFailed(false);

    console.log('[NavigationPrep] Starting navigation immediately from Start Anyway');
    proceedWithStartNavigation();
  };

  const handleNavigationMapReady = () => {
    console.log('[NavigationMap] ready');
    if (mapInitTimeoutRef.current) {
      clearTimeout(mapInitTimeoutRef.current);
      mapInitTimeoutRef.current = null;
    }
    setMapEngineFailed(false);
    setIsStartingAnyway(false);
    onMapReady();
  };

  const handleNavigationMapError = (errMsg: string) => {
    console.warn('[NavigationMap] MapLibre failed, switching seamlessly to Leaflet 2D navigation:', errMsg);
    if (mapInitTimeoutRef.current) {
      clearTimeout(mapInitTimeoutRef.current);
      mapInitTimeoutRef.current = null;
    }
    setMapEngineFailed(false);
    setIsStartingAnyway(false);
    setIsBasic2DMode(true);
    setNavigationState('ACTIVE');
    onMapError(errMsg);
  };

  const handleRetryMapInit = () => {
    setMapEngineFailed(false);
    setIsStartingAnyway(false);
    setIsBasic2DMode(true);
    proceedWithStartNavigation();
  };

  const handleCancelPreparation = () => {
    if (mapInitTimeoutRef.current) {
      clearTimeout(mapInitTimeoutRef.current);
      mapInitTimeoutRef.current = null;
    }
    setIsStartingAnyway(false);
    setGpsOverrideAccepted(false);
    setMapEngineFailed(false);
    setPrepGpsError(null);
    cancelPreparation();
  };

  const handleUseRecentFixInPrep = (fix: { latitude: number; longitude: number; accuracy: number; timestamp: number }) => {
    setPrepGpsError(null);
    setPrepGpsAccuracy(fix.accuracy);
    setNavigationState('INITIALIZING_MAP');
    proceedWithStartNavigation();
  };

  const handleStartFromCurrentLocationDialog = async () => {
    setShowMismatchDialog(false);
    if (gps.latitude === null || gps.longitude === null) {
      handleUseCurrentLocation();
      return;
    }
    const lat = gps.latitude;
    const lon = gps.longitude;
    setLoading(true);
    try {
      let locName = `Current GPS Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
      try {
        const rev = await api.reverseGeocode(lat, lon);
        if (rev && rev.display_name) {
          locName = rev.display_name;
        }
      } catch {
        // fallback to coordinates
      }

      const structLoc: StructuredLocation = {
        label: locName,
        latitude: lat,
        longitude: lon,
        source: 'GPS',
        accuracyMeters: gps.accuracy,
        timestamp: gps.timestamp || Date.now(),
      };

      setOrigin(locName);
      setOriginQuery(locName);
      setOriginLocation(structLoc);
      setDismissedMismatchOrigin(locName);

      const res: any = await api.calculateSmartRoutes({
        origin: locName,
        destination,
        vehicle_type: vehicleType,
        cargo_type: cargoType,
        cargo_weight: cargoWeight,
        travel_mode: travelMode,
        origin_lat: lat,
        origin_lon: lon,
        dest_lat: destLocation?.latitude ?? undefined,
        dest_lon: destLocation?.longitude ?? undefined,
      });

      if (res && res.routes) {
        setRouteResult(res);
        proceedWithStartNavigation(res);
      } else {
        proceedWithStartNavigation();
      }
    } catch (err) {
      console.warn('[Navigation] Start from current location error:', err);
      proceedWithStartNavigation();
    } finally {
      setLoading(false);
    }
  };

  const handleKeepPlannedOriginDialog = () => {
    setShowMismatchDialog(false);
    setDismissedMismatchOrigin(origin);
    proceedWithStartNavigation();
  };

  // Stop navigation session (spec §52)
  const handleStopNavigation = async () => {
    if (mapInitTimeoutRef.current) {
      clearTimeout(mapInitTimeoutRef.current);
      mapInitTimeoutRef.current = null;
    }
    setIsStartingAnyway(false);
    setGpsOverrideAccepted(false);
    setMapEngineFailed(false);
    stopNavigationSession();
    stopHeartbeat();
    const currentId = activeJourneyId || getCurrentJourneyId();
    if (currentId) {
      await finishJourney(currentId);
      setActiveJourneyId(null);
    }
    stopTracking();
    setPlannerMode('operator');
    setNavigationState('IDLE');
  };

  // Restore active journey on load if available (spec §53)
  useEffect(() => {
    restoreActiveJourney().then(restored => {
      if (restored && restored.id) {
        setActiveJourneyId(restored.id);
        console.log('[SmartRoutePlanner] Active journey session found:', restored.id);
      }
    }).catch(() => {});
  }, []);

  const activeProfile: RouteProfile | null = routeResult ? routeResult.routes[selectedStrategy] : null;

  // Polyline coordinates for active profile
  const polylineCoords = activeProfile?.geometry_coordinates || [];
  const polylineWaypoints = polylineCoords.map(c => ({ lat: c[1], lng: c[0] }));

  // Helper to query Grounded AI Copilot with contextual prompt
  const askCopilot = async (question: string) => {
    setCopilotQuery(question);
    setCopilotLoading(true);
    setCopilotAnswer(null);
    try {
      let sachetStatus: any = null;
      let routeDisasterFilter: any = null;
      try {
        sachetStatus = await api.getSachetSyncStatus();
      } catch { /* optional */ }
      const coords = activeProfile?.geometry_coordinates;
      if (coords && coords.length >= 2) {
        try {
          routeDisasterFilter = await api.getRouteDisasters(coords, 12);
        } catch { /* optional */ }
      }
      const res = await api.queryCopilot(question, 'All', 'admin', {
        active_route_name: `${origin} to ${destination} (${selectedStrategy})`,
        vehicle_type: vehicleType,
        travel_mode: travelMode,
        current_speed: navTelemetry.speedKmh,
        gps_accuracy: navTelemetry.accuracyMeters,
        eta: activeProfile?.eta_formatted,
        remaining_distance_km: activeProfile?.distance_km,
        route_risk: activeProfile?.risk_score ?? routeDisasterFilter?.summary?.routeRiskScore,
        hazards: routeDisasterFilter?.routeAlerts || routeResult?.route_intersecting_hazards,
        regional_alerts: routeDisasterFilter?.regionalAlerts || [],
        sachet_status: sachetStatus,
        navigation_state: navTelemetry.isOffRoute ? "OFF_ROUTE" : (isNavigating ? "NAVIGATING" : "PLANNING")
      });
      setCopilotAnswer(res.answer);
    } catch {
      setCopilotAnswer("AI Copilot is processing current corridor telemetry.");
    } finally {
      setCopilotLoading(false);
    }
  };

  // Dedicated Professional Turn-by-Turn Navigation Presentation (spec §1, §3, §4, §12, §42, §46, §48)
  const isNavActive = isNavigating || navigationState === 'ACTIVE';

  if (isNavActive) {
    return (
      <NavigationErrorBoundary
        onReturnToPlanner={handleStopNavigation}
        onSwitchTo2D={() => setIsBasic2DMode(true)}
      >
        <NavigationExperience
          routeResult={routeResult}
          selectedStrategy={selectedStrategy}
          origin={origin}
          destination={destination}
          travelMode={travelMode}
          districts={districts}
          incidents={incidents}
          disasters={disasters}
          userDisasters={userDisasters}
          onEndNavigation={handleStopNavigation}
          onTriggerReroute={async () => {
            setSelectedStrategy('safest');
            const res: any = await api.calculateSmartRoutes({
              origin,
              destination,
              vehicle_type: vehicleType,
              cargo_type: cargoType,
              cargo_weight: cargoWeight,
              travel_mode: travelMode,
              origin_lat: originLocation?.latitude ?? undefined,
              origin_lon: originLocation?.longitude ?? undefined,
              dest_lat: destLocation?.latitude ?? undefined,
              dest_lon: destLocation?.longitude ?? undefined,
            });
            if (res && res.routes) {
              setRouteResult(res);
              const activeR = res.routes.safest || res.routes.fastest;
              updateActiveRoute(
                activeR.geometry_coordinates || [],
                res.navigation_steps || [],
                activeR.distance_km,
                Math.round((activeR.eta_hours || 1) * 60)
              );
            }
          }}
          onReportDisasterSuccess={(newRep) => {
            setUserDisasters(prev => [newRep, ...prev]);
            handleCalculate();
          }}
          onOpenCopilot={(q) => askCopilot(q || `Give an update on the current ${travelMode} route, ETA, and upcoming hazards.`)}
          riskScore={activeProfile?.risk_score ?? 15}
        />
      </NavigationErrorBoundary>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Navigation Preparation Full-Screen Overlay Portal (document.body) */}
      <NavigationPreparationOverlay
        state={navigationState}
        onCancel={handleCancelPreparation}
        gpsAccuracy={gps.accuracy ?? prepGpsAccuracy}
        gpsQuality={gps.gpsQuality ?? prepGpsQuality}
        gpsError={prepGpsError}
        onRetryGps={handleRetryGpsInPrep}
        onStartAnyway={handleStartAnywayInPrep}
        onStartRoutePreview={handleStartRoutePreview}
        onUseRecentFix={handleUseRecentFixInPrep}
        originLabel={origin}
        destinationLabel={destination}
        isStartingAnyway={isStartingAnyway}
        gpsOverrideAccepted={gpsOverrideAccepted}
        mapEngineFailed={mapEngineFailed}
        onRetryMapInit={handleRetryMapInit}
        isGpsStale={gps.timestamp ? Date.now() - gps.timestamp > 60000 : false}
        onRefreshGps={handleUseCurrentLocation}
      />

      {/* Navigation Failure Notice Banner */}
      {navigationError && (
        <div className="p-4 rounded-2xl bg-red-950/80 border border-red-500/80 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-red-300">Navigation Issue</div>
              <div className="text-xs text-slate-200 mt-0.5">{navigationError}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNavigationState('ACTIVE');
              }}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs font-bold transition"
            >
              Basic 2D Mode
            </button>
            <button
              onClick={() => {
                setNavigationError(null);
                setNavigationState('IDLE');
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest font-mono">
              NEXORA AI Multi-Corridor Intelligence
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Smart Logistics Route & Disaster Bypass Engine
          </h1>
        </div>

        {/* Mode Toggles & Disaster Report */}
        <div className="flex items-center gap-2.5">
          {/* Top Report Disaster Button */}
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold shadow-lg transition border border-red-500/40 active:scale-95"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>+ Report Disaster</span>
          </button>

          {/* Operator vs Driver Mode Switch */}
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-700 flex items-center shadow-lg">
            <button
              onClick={() => setPlannerMode('operator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                plannerMode === 'operator'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>OPERATOR MODE</span>
            </button>
            <button
              onClick={() => setPlannerMode('driver')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                plannerMode === 'driver'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>DRIVER MODE</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TRAVEL MODE SELECTOR                                                      */}
      {/* ========================================================================= */}
      <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono mr-1">Travel Mode:</span>
          {(
            [
              { mode: 'car' as const, label: 'Car', icon: <Car className="w-3.5 h-3.5" /> },
              { mode: 'truck' as const, label: 'Heavy Duty Truck', icon: <Truck className="w-3.5 h-3.5" /> },
              { mode: 'walking' as const, label: 'Walking', icon: <Footprints className="w-3.5 h-3.5" /> },
              { mode: 'bicycle' as const, label: 'Bicycle', icon: <Bike className="w-3.5 h-3.5" /> },
              { mode: 'train' as const, label: 'Train', icon: <Train className="w-3.5 h-3.5" /> },
              { mode: 'flight' as const, label: 'Flight', icon: <Plane className="w-3.5 h-3.5" /> },
            ] as { mode: typeof travelMode; label: string; icon: React.ReactNode }[]
          ).map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => { setTravelMode(mode); setUnavailableNotice(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                travelMode === mode
                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>




      {/* ========================================================================= */}
      {/* DRIVER MODE HUD BANNER (Mobile-Friendly)                                 */}
      {/* ========================================================================= */}
      {plannerMode === 'driver' && (
        <div className="bg-slate-900/90 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 flex items-center justify-center">
                {travelMode === 'car' ? <Car className="w-5 h-5" /> :
                 travelMode === 'truck' ? <Truck className="w-5 h-5" /> :
                 travelMode === 'walking' ? <Footprints className="w-5 h-5" /> :
                 travelMode === 'bicycle' ? <Bike className="w-5 h-5" /> :
                 travelMode === 'train' ? <Train className="w-5 h-5" /> :
                 <Plane className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-600 px-2 py-0.5 rounded-full font-mono">
                    {travelMode.toUpperCase()} NAVIGATION HUD
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {driverGps.status === 'connected' ? '🟢 GPS Active' : (driverGps.status === 'searching' ? '🟡 Acquiring Fix' : '⚪ GPS Standby')}
                  </span>
                </div>
                <div className="text-lg font-black text-white mt-0.5">
                  {origin} ➔ {destination}
                </div>
              </div>
            </div>

            {/* GPS Speed & Action Buttons */}
            <div className="flex items-center gap-3">
              <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-center">
                <div className="text-[10px] uppercase font-mono text-slate-400">Current Speed</div>
                <div className="text-xl font-black text-emerald-400 font-mono">
                  {gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'REQUESTING' || gps.gpsStatus === 'REQUESTING_PERMISSION'
                    ? '--'
                    : gps.speedSource === 'STATIONARY' || gps.currentSpeedKmh === 0
                      ? '0 km/h'
                      : gps.currentSpeedKmh !== null
                        ? `${Math.round(gps.currentSpeedKmh)} km/h`
                        : '--'}
                </div>
                <div className="text-[9px] font-mono text-slate-400">
                  {gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'REQUESTING' || gps.gpsStatus === 'REQUESTING_PERMISSION'
                    ? 'ACQUIRING GPS...'
                    : gps.speedSource === 'STATIONARY' || gps.currentSpeedKmh === 0
                      ? '● STATIONARY'
                      : `● ${gps.speedSource}`}
                </div>
              </div>

              {routeResult?.disruption_detected && (
                <button
                  onClick={() => setSelectedStrategy('safest')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Reroute to Safest</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick HUD Metrics */}
          {activeProfile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Remaining Distance</span>
                <strong className="text-base text-white font-mono">{activeProfile.distance_km} km</strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Estimated Duration</span>
                <strong className="text-base text-white font-mono">{activeProfile.eta_formatted}</strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Route Hazards</span>
                <strong className={`text-base font-mono ${activeProfile.hazards_on_route > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {activeProfile.hazards_on_route > 0 ? `${activeProfile.hazards_on_route} Alert(s)` : 'Clear Corridor'}
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Midpoint Weather</span>
                <strong className="text-base text-white font-mono">
                  {routeResult?.weather ? `${routeResult.weather.temperature_c}°C | ${routeResult.weather_impact}` : 'Weather OK'}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ROUTE SEARCH & INPUT CONTROLS                                             */}
      {/* ========================================================================= */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Origin Input */}
          <div className="md:col-span-5 relative" ref={originRef}>
            <label className="text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                FROM
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMapPickTarget((t) => (t === 'origin' ? null : 'origin'))}
                  className={`text-[10px] font-mono ${mapPickTarget === 'origin' ? 'text-emerald-300' : 'text-slate-400 hover:text-sky-300'}`}
                >
                  {mapPickTarget === 'origin' ? 'Click map…' : 'Pick on map'}
                </button>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-mono"
                >
                  <Locate className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'Locating...' : 'Use My GPS'}</span>
                </button>
              </span>
            </label>            <div className="relative">
              <input
                type="text"
                value={originQuery}
                onChange={(e) => {
                  setOriginQuery(e.target.value);
                  setOrigin(e.target.value);
                  setOriginLocation({
                    label: e.target.value,
                    latitude: null,
                    longitude: null,
                    source: 'MANUAL',
                  });
                  setRouteResult(null);
                }}
                onFocus={() => originSuggestions.length > 0 && setShowOriginSuggestions(true)}
                placeholder="Enter starting location or use GPS"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 outline-none"
              />
              <MapPin className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            {/* GPS Live Badge */}
            {originLocation?.source === 'GPS' && originLocation.latitude !== null && originLocation.longitude !== null && (
              <div className="mt-1.5 flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span className="font-bold text-emerald-200">GPS ● LIVE</span>
                  <span className="text-emerald-400/80 truncate">
                    {originLocation.latitude.toFixed(4)}, {originLocation.longitude.toFixed(4)}
                    {originLocation.accuracyMeters != null ? ` (±${Math.round(originLocation.accuracyMeters)}m)` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="ml-2 text-emerald-300 hover:text-white underline text-[9px] uppercase tracking-wider shrink-0 cursor-pointer"
                >
                  [ REFRESH GPS ]
                </button>
              </div>
            )}
            {gpsAcquisitionText && (
              <div className="mt-1 text-[10px] font-mono text-sky-400 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>{gpsAcquisitionText}</span>
              </div>
            )}

            {showOriginSuggestions && originSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50">
                {originSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      const name = s.display_name.split(',')[0];
                      setOrigin(name);
                      setOriginQuery(name);
                      setOriginLocation({
                        label: name,
                        latitude: parseFloat(s.lat) || null,
                        longitude: parseFloat(s.lon) || null,
                        source: 'SEARCH',
                      });
                      setRouteResult(null);
                      setShowOriginSuggestions(false);
                    }}
                    className="p-2.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-0"
                  >
                    <div className="font-semibold">{s.display_name.split(',')[0]}</div>
                    <div className="text-[10px] text-slate-400 truncate">{s.display_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Swap Locations Button (Google Maps Style) */}
          <div className="md:col-span-1 flex items-end justify-center pb-1">
            <button
              type="button"
              onClick={handleSwapLocations}
              title="Swap Origin and Destination"
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 hover:text-white border border-slate-700 hover:border-sky-500/80 shadow-lg transition-all"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Destination Input */}
          <div className="md:col-span-4 relative" ref={destRef}>
            <label className="text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>
                TO
              </span>
              <button
                type="button"
                onClick={() => setMapPickTarget((t) => (t === 'destination' ? null : 'destination'))}
                className={`text-[10px] font-mono ${mapPickTarget === 'destination' ? 'text-red-300' : 'text-slate-400 hover:text-sky-300'}`}
              >
                {mapPickTarget === 'destination' ? 'Click map…' : 'Pick on map'}
              </button>
            </label>
            {recentSearches.length > 0 && (
              <div className="absolute -bottom-6 left-0 right-0 flex gap-1 overflow-x-auto text-[9px] text-slate-500 z-10">
                {recentSearches.slice(0, 4).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="shrink-0 hover:text-sky-300 truncate max-w-[120px]"
                    onClick={() => {
                      setDestination(r);
                      setDestQuery(r);
                      setDestLocation({
                        label: r,
                        latitude: null,
                        longitude: null,
                        source: 'SEARCH',
                      });
                      setRouteResult(null);
                    }}
                  >
                    {r.split(',')[0]}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  setDestination(e.target.value);
                  setDestLocation({
                    label: e.target.value,
                    latitude: null,
                    longitude: null,
                    source: 'MANUAL',
                  });
                  setRouteResult(null);
                }}
                onFocus={() => destSuggestions.length > 0 && setShowDestSuggestions(true)}
                placeholder="Enter destination"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 outline-none"
              />
              <MapPin className="w-4 h-4 text-red-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            {showDestSuggestions && destSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50">
                {destSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      const name = s.display_name.split(',')[0];
                      setDestination(name);
                      setDestQuery(name);
                      setDestLocation({
                        label: name,
                        latitude: parseFloat(s.lat) || null,
                        longitude: parseFloat(s.lon) || null,
                        source: 'SEARCH',
                      });
                      setRouteResult(null);
                      setShowDestSuggestions(false);
                    }}
                    className="p-2.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-0"
                  >
                    <div className="font-semibold">{s.display_name.split(',')[0]}</div>
                    <div className="text-[10px] text-slate-400 truncate">{s.display_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calculate Button */}
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={handleCalculate}
              disabled={loading || !origin.trim() || !destination.trim()}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Compute Routes</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Location Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-400">
          <span className="font-mono text-[10px] uppercase">Quick Select:</span>
          {quickCities.map((city) => (
            <button
              key={city}
              onClick={() => {
                setDestination(city);
                setDestQuery(city);
              }}
              className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
            >
              ➔ {city}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HAZARD INTERSECTION ADVISORY BANNER                                      */}
      {/* ========================================================================= */}
      {routeResult && (
        <>
          {routeResult.disruption_detected ? (
            <div className="p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/80 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-950 px-2 py-0.5 rounded-full border border-amber-600">
                      ⚠️ HAZARD INTERSECTION DETECTED
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">
                      {routeResult.route_intersecting_hazards.length} Active Hazard(s) within corridor
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {routeResult.hazard_warning || "Active disaster alerts intersect primary direct path."}
                  </p>
                  <p className="text-[11px] text-amber-400/90 mt-1">
                    Recommended action: Switch to <strong>Safest</strong> profile for automated disaster avoidance.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStrategy('safest')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shrink-0 shadow-lg"
              >
                Switch to Safest Bypass
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 flex items-center justify-between gap-3 text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>No active disaster alert detected on the selected route corridor.</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                SACHET NDMA & Verified Reports: Checked
              </span>
            </div>
          )}

          {routeResult.route_status_message && (
            <div className="text-[11px] text-slate-400 font-mono px-2">
              ℹ️ {routeResult.route_status_message}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* REAL PHONE GPS VS SELECTED ORIGIN MISMATCH BANNER                         */}
      {/* ========================================================================= */}
      {showOriginMismatch && (
        <div className="p-4 rounded-2xl bg-amber-950/90 border-2 border-amber-500/70 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200 animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              <Compass className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span>Your current GPS location does not match route origin.</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-900/80 text-amber-300 border border-amber-600">
                  {originDistanceToGpsKm.toFixed(1)} km away
                </span>
              </div>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Route was planned from <strong>{origin}</strong>, but your phone/device is currently at{' '}
                <span className="font-mono text-white">
                  {gps.latitude?.toFixed(4)}, {gps.longitude?.toFixed(4)}
                </span>
                .
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={handleRouteFromCurrentGps}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
            >
              <Locate className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
              <span>Route From My Current Location</span>
            </button>
            <button
              onClick={() => setDismissedMismatchOrigin(origin)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium rounded-xl text-xs transition-colors border border-slate-700"
            >
              Keep Selected Origin
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4 STRATEGY COMPARISON CARDS                                               */}
      {/* ========================================================================= */}
      {routeResult?.routes && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Fastest */}
          <div
            onClick={() => setSelectedStrategy('fastest')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              selectedStrategy === 'fastest'
                ? 'bg-sky-950/50 border-sky-400 shadow-xl scale-[1.02]'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Fastest Route
              </span>
              <span className="text-xs font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {routeResult.routes.fastest.eta_formatted}
              </span>
            </div>
            <div className="text-2xl font-black text-white">
              {routeResult.routes.fastest.distance_km} <span className="text-xs text-slate-400 font-normal">km</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
              {(travelMode === 'walking' || travelMode === 'bicycle') ? (
                <>
                  <div>Duration: <strong className="text-white">{routeResult.routes.fastest.eta_formatted}</strong></div>
                  <div>Risk: <strong className={routeResult.routes.fastest.risk_score > 50 ? "text-amber-400" : "text-emerald-400"}>{routeResult.routes.fastest.risk_score}/100</strong></div>
                </>
              ) : travelMode === 'flight' ? (
                <>
                  <div>Air Freight: <strong className="text-white">₹{routeResult.routes.fastest.fuel_cost_inr.toLocaleString()}</strong></div>
                  <div>Toll: <strong className="text-emerald-400">₹0 (None)</strong></div>
                </>
              ) : (
                <>
                  <div>Cost: <strong className="text-white">₹{routeResult.routes.fastest.total_cost_inr.toLocaleString()}</strong></div>
                  <div>Risk: <strong className={routeResult.routes.fastest.risk_score > 50 ? "text-amber-400" : "text-emerald-400"}>{routeResult.routes.fastest.risk_score}/100</strong></div>
                </>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">{routeResult.routes.fastest.note}</p>
          </div>

          {/* Cheapest */}
          <div
            onClick={() => setSelectedStrategy('cheapest')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              selectedStrategy === 'cheapest'
                ? 'bg-sky-950/50 border-sky-400 shadow-xl scale-[1.02]'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                {(travelMode === 'walking' || travelMode === 'bicycle') ? 'Zero-Cost Route' : travelMode === 'flight' ? 'Economy Fare' : 'Cheapest Route'}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {(travelMode === 'walking' || travelMode === 'bicycle') ? 'FREE / ZERO TOLL' : travelMode === 'flight' ? `₹${routeResult.routes.cheapest.total_cost_inr.toLocaleString()} • ZERO ROAD TOLL` : `₹${routeResult.routes.cheapest.total_cost_inr.toLocaleString()}`}
              </span>
            </div>
            <div className="text-2xl font-black text-white">
              {routeResult.routes.cheapest.distance_km} <span className="text-xs text-slate-400 font-normal">km</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
              {(travelMode === 'walking' || travelMode === 'bicycle') ? (
                <>
                  <div>Hazards: <strong className="text-emerald-400">{routeResult.routes.cheapest.hazards_on_route} on path</strong></div>
                  <div>Terrain: <strong className="text-white">{travelMode === 'walking' ? 'Footpath / Trail' : 'Bicycle Lane'}</strong></div>
                </>
              ) : travelMode === 'flight' ? (
                <>
                  <div>Air Freight: <strong className="text-white">₹{routeResult.routes.cheapest.fuel_cost_inr.toLocaleString()}</strong></div>
                  <div>Road Tolls: <strong className="text-emerald-400">₹0 (None)</strong></div>
                </>
              ) : (
                <>
                  <div>Fuel: <strong className="text-white">₹{routeResult.routes.cheapest.fuel_cost_inr.toLocaleString()}</strong></div>
                  <div>Tolls: <strong className="text-white">₹{routeResult.routes.cheapest.toll_cost_inr.toLocaleString()}</strong></div>
                </>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">{routeResult.routes.cheapest.note}</p>
          </div>

          {/* Safest */}
          <div
            onClick={() => setSelectedStrategy('safest')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              selectedStrategy === 'safest'
                ? 'bg-sky-950/50 border-sky-400 shadow-xl scale-[1.02]'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Safest Bypass
              </span>
              <span className="text-xs font-mono font-bold text-teal-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                Risk: {routeResult.routes.safest.risk_score}/100
              </span>
            </div>
            <div className="text-2xl font-black text-white">
              {routeResult.routes.safest.distance_km} <span className="text-xs text-slate-400 font-normal">km</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
              <div>ETA: <strong className="text-white">{routeResult.routes.safest.eta_formatted}</strong></div>
              <div>Hazards: <strong className="text-emerald-400">{routeResult.routes.safest.hazards_on_route} on path</strong></div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">{routeResult.routes.safest.note}</p>
          </div>

          {/* Reliable */}
          <div
            onClick={() => setSelectedStrategy('reliable')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              selectedStrategy === 'reliable'
                ? 'bg-sky-950/50 border-sky-400 shadow-xl scale-[1.02]'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                Most Reliable
              </span>
              <span className="text-xs font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                Score: {routeResult.routes.reliable.reliability_score}%
              </span>
            </div>
            <div className="text-2xl font-black text-white">
              {routeResult.routes.reliable.distance_km} <span className="text-xs text-slate-400 font-normal">km</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
              <div>Cost: <strong className="text-white">₹{routeResult.routes.reliable.total_cost_inr.toLocaleString()}</strong></div>
              <div>ETA: <strong className="text-white">{routeResult.routes.reliable.eta_formatted}</strong></div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">{routeResult.routes.reliable.note}</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GOOGLE MAPS-STYLE ROUTE INFORMATION CARD                                  */}
      {/* ========================================================================= */}
      {routeResult && activeProfile && (
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 shadow-2xl space-y-3.5">
          {/* Header Row: Origin ➔ Destination, Travel Mode, and Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold">
                {travelMode === 'car' ? <Car className="w-5 h-5" /> :
                 travelMode === 'truck' ? <Truck className="w-5 h-5" /> :
                 travelMode === 'walking' ? <Footprints className="w-5 h-5" /> :
                 travelMode === 'bicycle' ? <Bike className="w-5 h-5" /> :
                 travelMode === 'train' ? <Train className="w-5 h-5" /> :
                 <Plane className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 bg-sky-950 px-2 py-0.5 rounded-full border border-sky-600 font-mono">
                    {travelMode.toUpperCase()} NAVIGATION
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Profile: <strong className="text-white capitalize">{selectedStrategy}</strong>
                  </span>
                </div>
                <div className="text-base font-extrabold text-white mt-0.5 flex items-center gap-2">
                  <span>{origin}</span>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                  <span>{destination}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Start Navigation, Recalculate, Reroute, View Details */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (isNavigating) {
                    handleStopNavigation();
                  } else {
                    handleStartNavigationTrigger();
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer ${
                  isNavigating
                    ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20 animate-pulse'
                    : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{isNavigating ? 'Exit Navigation' : 'Start Navigation'}</span>
              </button>

              <button
                onClick={handleCalculate}
                disabled={loading}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Recalculate Route</span>
              </button>

              {routeResult?.disruption_detected && (
                <button
                  onClick={() => setSelectedStrategy('safest')}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Reroute</span>
                </button>
              )}

              <button
                onClick={() => setShowRouteDetails(!showRouteDetails)}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
              >
                <Info className="w-3.5 h-3.5 text-sky-400" />
                <span>{showRouteDetails ? 'Hide Details' : 'View Details'}</span>
              </button>
            </div>
          </div>

          {/* Offline Corridor Banner (if route was restored from IndexedDB) */}
          {isOfflineCachedRoute && (
            <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-500/60 flex items-center gap-2.5 text-xs text-amber-200">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>
                <strong>OFFLINE CACHED CORRIDOR:</strong> Using locally verified route and geometry. Navigation and live device GPS tracking remain fully operational offline.
              </span>
            </div>
          )}

          {/* Emergency Communication / SMS Fallback Settings (spec §24-33, §66) */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sms-consent-checkbox"
                checked={smsConsent}
                onChange={(e) => {
                  setSmsConsent(e.target.checked);
                  if (e.target.checked && !smsPhone) {
                    setSmsPhone(user?.phone || '');
                  }
                }}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-slate-900 w-4 h-4"
              />
              <label htmlFor="sms-consent-checkbox" className="text-slate-300 font-medium cursor-pointer">
                Enable Critical Route SMS Fallback Alerts
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                SERVER RESILIENCE
              </span>
            </div>

            {smsConsent && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">Mobile:</span>
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Distance</span>
              <strong className="text-base text-white font-mono">{activeProfile.distance_km} km</strong>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">ETA</span>
              <strong className="text-base text-sky-400 font-mono">{activeProfile.eta_formatted}</strong>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Current Speed</span>
              <strong className="text-base text-emerald-400 font-mono">
                {gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'REQUESTING' || gps.gpsStatus === 'REQUESTING_PERMISSION'
                  ? '--'
                  : gps.speedSource === 'STATIONARY' || gps.currentSpeedKmh === 0
                    ? '0 km/h'
                    : gps.currentSpeedKmh !== null && gps.currentSpeedKmh !== undefined
                      ? `${Math.round(gps.currentSpeedKmh)} km/h`
                      : '--'}
              </strong>
              <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                {gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'REQUESTING' || gps.gpsStatus === 'REQUESTING_PERMISSION'
                  ? 'ACQUIRING GPS...'
                  : gps.speedSource === 'STATIONARY' || gps.currentSpeedKmh === 0
                    ? '● STATIONARY'
                    : !gps.isTracking
                      ? 'GPS STANDBY'
                      : `● ${gps.speedSource}`}
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Route Risk</span>
              <strong className={`text-base font-mono ${activeProfile.risk_score > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {activeProfile.risk_score}/100
              </strong>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Weather</span>
              <strong className="text-sm text-white font-mono truncate block">
                {routeResult?.weather ? `${routeResult.weather.temperature_c}°C | ${routeResult.weather_impact}` : 'Weather OK'}
              </strong>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Hazards</span>
              <strong className={`text-base font-mono ${activeProfile.hazards_on_route > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {activeProfile.hazards_on_route > 0 ? `${activeProfile.hazards_on_route} Alert(s)` : 'Clear Corridor'}
              </strong>
            </div>
          </div>

          {/* Collapsible Waypoint & Maneuver Details */}
          {showRouteDetails && (
            <div className="pt-2 border-t border-slate-800 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="font-bold text-white uppercase">Turn-by-Turn Corridor Waypoints</span>
                <span>OSRM Routing Engine</span>
              </div>
              {activeProfile.waypoint_names && activeProfile.waypoint_names.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                  {activeProfile.waypoint_names.map((wp: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-[11px]">
                      {i + 1}. {wp}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-slate-400 text-[11px]">Direct corridor via primary national highway.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* NAVIGATION MAP (Single Unified Map Engine with Custom Controls)           */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        {/* Connected Mode Banner for Walking / Bicycle */}
        {routeResult && (travelMode === 'walking' || travelMode === 'bicycle') && (
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/60 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="font-extrabold text-white uppercase font-mono tracking-wider">
                {travelMode.toUpperCase()} NAVIGATION
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                GPS ● LIVE
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                {travelMode === 'walking' ? 'PEDESTRIAN ROUTING ● CONNECTED' : 'CYCLING ROUTING ● CONNECTED'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                ZERO FUEL • ZERO TOLL
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-300">
              Corridor Distance: <strong className="text-white">{routeResult.routes.fastest.distance_km} km</strong> | ETA: <strong className="text-white">{routeResult.routes.fastest.eta_formatted}</strong>
            </div>
          </div>
        )}

        {/* Connected Mode Banner for Flight */}
        {routeResult && travelMode === 'flight' && routeResult.origin_airport && routeResult.dest_airport && (
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-pink-500/60 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-pulse shrink-0" />
              <span className="font-extrabold text-white uppercase font-mono tracking-wider">
                ✈️ FLIGHT NAVIGATION
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-950 text-pink-300 border border-pink-800">
                AVIATION ENGINE ● CONNECTED
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-pink-300 border border-slate-700">
                {routeResult.origin_airport.iata} ➔ {routeResult.dest_airport.iata}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-sky-300 border border-slate-700">
                {routeResult.flight_level || 'FL280'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                ZERO ROAD TOLL
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-300">
              Air Distance: <strong className="text-white">{routeResult.routes.fastest.distance_km} km</strong> | Block Time: <strong className="text-white">{routeResult.routes.fastest.eta_formatted}</strong>
              {routeResult.cruise_speed_kmh && <> | Cruise: <strong className="text-white">{routeResult.cruise_speed_kmh} km/h</strong></>}
            </div>
          </div>
        )}

        {/* Unconfigured / Unavailable Provider State */}
        {unavailableNotice && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 shrink-0 mt-0.5">
                {travelMode === 'walking' ? <Footprints className="w-5 h-5" /> :
                 travelMode === 'bicycle' ? <Bike className="w-5 h-5" /> :
                 travelMode === 'train' ? <Train className="w-5 h-5" /> :
                 travelMode === 'flight' ? <Plane className="w-5 h-5" /> :
                 <Radio className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    {travelMode.toUpperCase()} MODE
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    GPS ACTIVE
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    {travelMode === 'train' || travelMode === 'flight' ? 'PROVIDER: NOT CONFIGURED' : 'ROUTING: UNAVAILABLE'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{unavailableNotice}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Live GPS speed, position tracking, and full-screen Navigation HUD remain fully active.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isNavigating) {
                    handleStopNavigation();
                  } else {
                    handleStartNavigationTrigger();
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-lg cursor-pointer ${
                  isNavigating
                    ? 'bg-emerald-500 text-slate-950 animate-pulse'
                    : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{isNavigating ? 'Exit Navigation' : 'Start Navigation'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTravelMode('car')}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Switch to Car
              </button>
            </div>
          </div>
        )}

        {/* Toggle Speed Telemetry Debugger */}
        <div className="flex items-center justify-between text-xs px-1">
          <button
            type="button"
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="text-[11px] font-mono text-slate-400 hover:text-cyan-400 flex items-center gap-1.5 transition"
          >
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showDebugPanel ? 'Hide GPS Speed Telemetry Debugger' : 'Show GPS Speed Telemetry Debugger'}</span>
          </button>
        </div>

        {/* Development Speed Debug Panel */}
        {showDebugPanel && (
          <div className="p-3.5 rounded-xl bg-slate-950/95 border border-cyan-500/40 font-mono text-xs text-slate-300 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Gauge className="w-4 h-4" />
                GPS SPEED & TELEMETRY DEBUGGER
              </span>
              <span className="text-[10px] text-slate-400">Mode: {travelMode.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Speed (Display)</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {gps.speedSource === 'STATIONARY' ? '0 km/h (Stationary)' : (gps.currentSpeedKmh !== null ? `${gps.currentSpeedKmh} km/h` : 'Unavailable')}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Raw Speed (Hardware)</span>
                <span className="text-white font-bold">
                  {debugTelemetry.rawSpeedMps !== null ? `${debugTelemetry.rawSpeedMps.toFixed(2)} m/s (${Math.round(debugTelemetry.rawSpeedMps * 3.6)} km/h)` : 'null / 0'}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Speed Source</span>
                <span className="text-sky-400 font-bold">{gps.speedSource}</span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Accuracy</span>
                <span className="text-white font-bold">{gps.accuracy ? `±${Math.round(gps.accuracy)}m` : 'N/A'}</span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Plausibility Ceiling</span>
                <span className="text-amber-400 font-bold">{debugTelemetry.plausibilityCeilingKmh} km/h</span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Calculated Speed</span>
                <span className="text-white font-bold">
                  {debugTelemetry.calculatedSpeedKmh !== null ? `${debugTelemetry.calculatedSpeedKmh} km/h` : 'N/A'}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Median Buffer (5 samples)</span>
                <span className="text-violet-300 font-bold">
                  [{debugTelemetry.recentSamples.map(s => Math.round(s)).join(', ')}]
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Tracking State</span>
                <span className={`font-bold ${gps.isTracking ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {gps.isTracking ? '● TRACKING ACTIVE' : '○ IDLE'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
          <div className="absolute top-3 right-3 z-[1100] flex items-center gap-1 bg-slate-950/90 border border-slate-700 rounded-xl p-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => setMapDimension('2d')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${mapDimension === '2d' ? 'bg-sky-500 text-slate-950' : 'text-slate-300'}`}
            >
              2D Map
            </button>
            <button
              type="button"
              onClick={() => { setWebglFailed(false); setMapDimension('3d'); }}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${mapDimension === '3d' ? 'bg-sky-500 text-slate-950' : 'text-slate-300'}`}
            >
              3D View
            </button>
          </div>

          {isNavigating && (
            <NavigationHUD
              isActive={isNavigating}
              onStopNavigation={handleStopNavigation}
              travelMode={travelMode}
              speedKmh={gps.currentSpeedKmh}
              speedSource={gps.speedSource}
              reasonUnavailable={gps.reasonUnavailable}
              totalDistanceKm={activeProfile?.distance_km}
              currentRoadName={routeResult?.navigation_steps?.[0]?.road_name || (travelMode === 'walking' ? 'Pedestrian Walkway' : travelMode === 'bicycle' ? 'Designated Cycle Path' : travelMode === 'train' ? 'Railway Transit Track' : travelMode === 'flight' ? 'Aviation Flight Corridor' : 'Roadway Corridor')}
              nextStep={routeResult?.navigation_steps?.[0] || null}
              distanceToNextStepMeters={routeResult?.navigation_steps?.[0]?.distance_m ?? null}
              remainingDistanceKm={activeProfile?.distance_km ?? 0}
              etaFormatted={activeProfile?.eta_formatted ?? '--'}
              gpsAccuracyMeters={gps.accuracy}
              headingDeg={gps.heading}
              isOffRoute={navTelemetry.isOffRoute}
              offRouteDistanceMeters={navTelemetry.offRouteDistanceMeters}
              onTriggerReroute={() => {
                setSelectedStrategy('safest');
                handleCalculate();
              }}
              intersectingHazards={routeResult?.route_intersecting_hazards || []}
              onReportDisaster={() => setIsReportModalOpen(true)}
              activeStrategy={selectedStrategy}
              gpsStatus={gps.gpsStatus}
            />
          )}

          {(mapDimension === '2d' || webglFailed) ? (
          <MapView
            districts={districts}
            incidents={incidents}
            disasters={disasters}
            userDisasters={userDisasters}
            routes={routeResult?.routes}
            selectedStrategy={selectedStrategy}
            onSelectStrategy={(s) => setSelectedStrategy(s as any)}
            origin={
              (routeResult && isValidCoordinate(routeResult.origin_lat, routeResult.origin_lon))
                ? { lat: Number(routeResult.origin_lat), lng: Number(routeResult.origin_lon), name: origin }
                : null
            }
            destination={
              (routeResult && isValidCoordinate(routeResult.dest_lat, routeResult.dest_lon))
                ? { lat: Number(routeResult.dest_lat), lng: Number(routeResult.dest_lon), name: destination }
                : null
            }
            weather={
              (routeResult?.weather && isValidCoordinate(routeResult.origin_lat, routeResult.origin_lon) && isValidCoordinate(routeResult.dest_lat, routeResult.dest_lon))
                ? {
                    lat: (Number(routeResult.origin_lat) + Number(routeResult.dest_lat)) / 2,
                    lon: (Number(routeResult.origin_lon) + Number(routeResult.dest_lon)) / 2,
                    temperature_c: routeResult.weather.temperature_c,
                    condition_text: routeResult.weather.condition_text,
                    wind_speed_kmh: routeResult.weather.wind_speed_kmh,
                    visibility_km: routeResult.weather.visibility_km,
                    source: routeResult.weather.source,
                  }
                : null
            }
            travelMode={travelMode}
            height="620px"
            center={
              (isValidCoordinate(navTelemetry.lat, navTelemetry.lng))
                ? [Number(navTelemetry.lat), Number(navTelemetry.lng)]
                : (routeResult && isValidCoordinate(routeResult.origin_lat, routeResult.origin_lon) && isValidCoordinate(routeResult.dest_lat, routeResult.dest_lon))
                ? [(Number(routeResult.origin_lat) + Number(routeResult.dest_lat)) / 2, (Number(routeResult.origin_lon) + Number(routeResult.dest_lon)) / 2]
                : (routeResult && isValidCoordinate(routeResult.origin_lat, routeResult.origin_lon))
                ? [Number(routeResult.origin_lat), Number(routeResult.origin_lon)]
                : [26.2006, 92.9376]
            }
            zoom={routeResult ? 8 : 7}
            onReportDisasterClick={() => setIsReportModalOpen(true)}
            isPickingOnMap={isPickingOnMap || mapPickTarget === 'origin' || mapPickTarget === 'destination'}
            pickingCoordinates={pickedCoord}
            onLocationClick={async (lat, lng) => {
              if (mapPickTarget === 'origin' || mapPickTarget === 'destination') {
                try {
                  const rev = await api.reverseGeocode(lat, lng);
                  const name = rev?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                  if (mapPickTarget === 'origin') {
                    setOrigin(name);
                    setOriginQuery(name);
                  } else {
                    setDestination(name);
                    setDestQuery(name);
                  }
                  setRecentSearches((prev) => [name, ...prev.filter((x) => x !== name)].slice(0, 8));
                } catch {
                  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                  if (mapPickTarget === 'origin') {
                    setOrigin(fallback);
                    setOriginQuery(fallback);
                  } else {
                    setDestination(fallback);
                    setDestQuery(fallback);
                  }
                }
                setMapPickTarget(null);
                return;
              }
              if (isPickingOnMap) {
                setPickedCoord({ lat, lng });
                setIsPickingOnMap(false);
                setIsReportModalOpen(true);
              }
            }}
            onGpsTelemetryUpdate={(telemetry) => {
              setNavTelemetry(telemetry);
            }}
          />
          ) : (
            <Map3DView
              origin={
                (routeResult && isValidCoordinate(routeResult.origin_lat, routeResult.origin_lon))
                  ? { lat: Number(routeResult.origin_lat), lng: Number(routeResult.origin_lon), name: origin }
                  : null
              }
              destination={
                (routeResult && isValidCoordinate(routeResult.dest_lat, routeResult.dest_lon))
                  ? { lat: Number(routeResult.dest_lat), lng: Number(routeResult.dest_lon), name: destination }
                  : null
              }
              routeCoordinates={activeProfile?.geometry_coordinates || []}
              incidents={incidents}
              height="620px"
              strategyName={selectedStrategy}
              distanceKm={activeProfile?.distance_km}
              etaFormatted={activeProfile?.eta_formatted}
              onWebGlFail={() => setWebglFailed(true)}
            />
          )}
          {webglFailed && mapDimension === '3d' && (
            <div className="absolute bottom-3 left-3 z-[1100] bg-amber-950/90 border border-amber-700 text-amber-200 text-[10px] px-3 py-1.5 rounded-lg">
              WebGL / 3D unavailable — showing working 2D map. Route and disaster data remain usable.
            </div>
          )}
        </div>
      </div>


      {/* ========================================================================= */}
      {/* OPERATOR MODE: CONTROL ROOM DASHBOARD PANELS                            */}
      {/* ========================================================================= */}
      {plannerMode === 'operator' && (
        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
              Logistics Control Room — Active Telemetry & Impact Panels
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Panel A: Corridor Hazard Card */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Corridor Hazard Card
                </span>
                <span className="text-[10px] font-mono text-slate-400">SACHET NDMA</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Selected Corridor:</span>
                  <span className="text-white font-medium">{origin} ➔ {destination}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Active Hazards on Route:</span>
                  <span className="font-bold text-amber-400">
                    {routeResult?.route_intersecting_hazards.length || 0} Incident(s) Detected
                  </span>
                </div>

                {routeResult?.route_intersecting_hazards && routeResult.route_intersecting_hazards.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                    {routeResult.route_intersecting_hazards.map((h, i) => (
                      <div key={i} className="bg-slate-950 p-2 rounded-lg border border-red-900/40 text-[11px] space-y-0.5">
                        <div className="font-bold text-red-400">{h.type || 'Hazard'} - Severity: {h.severity}</div>
                        <div className="text-slate-300 truncate">{h.title || h.description}</div>
                        <div className="text-[9px] text-slate-500 font-mono">Source: {h.source || 'SACHET'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-[11px] text-emerald-300">
                    Corridor verified clear of reported NDMA alerts.
                  </div>
                )}
              </div>
            </div>

            {/* Panel B: Impact Analysis Panel */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  Impact Analysis Panel
                </span>
                <span className="text-[10px] font-mono text-slate-400">Real DB</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Route Disruption:</span>
                  <strong className={routeResult?.disruption_detected ? 'text-red-400' : 'text-emerald-400'}>
                    {routeResult?.disruption_detected ? 'Elevated Disruption' : 'Normal Flow'}
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Logistics Impact:</span>
                  <strong className="text-white">{routeResult?.weather_impact || 'Low'}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Weather Factor:</span>
                  <strong className="text-white">
                    {routeResult?.weather ? `${routeResult.weather.temperature_c}°C, ${routeResult.weather.condition_text || 'Clear'}` : 'Normal'}
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Disaster Exposure:</span>
                  <strong className={routeResult?.disruption_detected ? 'text-amber-400' : 'text-slate-300'}>
                    {routeResult?.active_hazards_count || 0} Zone(s)
                  </strong>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Accessibility impact assessed against MDoNER terrain vulnerability index.
                </div>
              </div>
            </div>

            {/* Panel C: Risk Card */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Corridor Risk Assessment
                </span>
                <span className="text-[10px] font-mono text-slate-400">Deterministic</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Overall Route Risk:</span>
                  <span className={`text-lg font-black ${
                    (activeProfile?.risk_score || 0) > 50 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {activeProfile?.risk_score || 0} / 100
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full ${
                      (activeProfile?.risk_score || 0) > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${activeProfile?.risk_score || 0}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-slate-300">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase block">Weather Penalty:</span>
                    <strong>{routeResult?.weather_impact === 'Severe' ? '+25' : routeResult?.weather_impact === 'High' ? '+15' : '+0'}</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase block">Disaster Penalty:</span>
                    <strong>{routeResult?.disruption_detected ? `+${(routeResult.route_intersecting_hazards.length || 1) * 15}` : '+0'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel E: AI Copilot Grounded Trigger */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-sky-400" />
                  Grounded AI Copilot
                </span>
                <span className="text-[10px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800">
                  Gemini Grounded
                </span>
              </div>

              <p className="text-xs text-slate-300">
                Ask NEXORA Copilot about corridor hazards, mountain bottleneck workarounds, or disaster bypass logic:
              </p>

              <div className="space-y-1.5">
                <button
                  onClick={() => askCopilot(`Why is the route between ${origin} and ${destination} risky right now?`)}
                  className="w-full text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>"Why is this route risky?"</span>
                  <ArrowUpRight className="w-3 h-3 text-sky-400 shrink-0" />
                </button>
                <button
                  onClick={() => askCopilot(`Which route between ${origin} and ${destination} is safest, and why?`)}
                  className="w-full text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>"Which route is safer?"</span>
                  <ArrowUpRight className="w-3 h-3 text-sky-400 shrink-0" />
                </button>
                <button
                  onClick={() => askCopilot(`What logistics contingency applies if the corridor between ${origin} and ${destination} is blocked by landslides?`)}
                  className="w-full text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>"What if this corridor is blocked?"</span>
                  <ArrowUpRight className="w-3 h-3 text-sky-400 shrink-0" />
                </button>
              </div>

              {/* Inline AI Response */}
              {copilotLoading && (
                <div className="p-3 bg-slate-950 rounded-xl border border-sky-500/30 flex items-center gap-2 text-xs text-sky-300">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Grounding answer on live DB context...</span>
                </div>
              )}

              {copilotAnswer && !copilotLoading && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[10px] text-slate-400">
                    <span className="font-bold text-sky-400">Gemini Grounded Assessment:</span>
                    <button
                      onClick={() => setCopilotAnswer(null)}
                      className="text-slate-400 hover:text-white font-bold"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-slate-200 text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {copilotAnswer}
                  </div>
                </div>
              )}
            </div>

            {/* Panel F: Live Operations Summary (Real Counts) */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Live Operations Summary (Real Database Records)
                </span>
                <span className="text-[10px] font-mono text-slate-400">Zero Demo Counters</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Active Incidents</span>
                  <strong className="text-lg font-black text-red-400">
                    {liveKpis ? liveKpis.active_incidents : incidents.length}
                  </strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">In-Transit Shipments</span>
                  <strong className="text-lg font-black text-sky-400">
                    {liveKpis ? liveKpis.deliveries_in_transit : 0}
                  </strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Logistics Hubs</span>
                  <strong className="text-lg font-black text-teal-400">
                    {liveKpis ? liveKpis.active_logistics_hubs : 0}
                  </strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Avg Accessibility</span>
                  <strong className="text-lg font-black text-amber-400">
                    {liveKpis ? `${liveKpis.average_accessibility_score}/100` : 'Available'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Disaster Modal */}
      <ReportDisasterModal
        isOpen={isReportModalOpen}
        onClose={() => {
          setIsReportModalOpen(false);
          setIsPickingOnMap(false);
        }}
        selectedCoordinates={pickedCoord}
        onActivateMapPick={() => {
          setIsReportModalOpen(false);
          setIsPickingOnMap(true);
        }}
        isPickingOnMap={isPickingOnMap}
        onSuccess={(newRep) => {
          setUserDisasters(prev => [newRep, ...prev]);
          handleCalculate();
        }}
      />

      {/* Route Start Mismatch Compact Dialog (spec §5, §45) */}
      <RouteMismatchDialog
        isOpen={showMismatchDialog}
        onClose={() => setShowMismatchDialog(false)}
        currentCoords={gps.latitude && gps.longitude ? [gps.latitude, gps.longitude] : [0, 0]}
        plannedOriginName={origin}
        differenceKm={originDistanceToGpsKm}
        onStartFromCurrentLocation={handleStartFromCurrentLocationDialog}
        onKeepPlannedOrigin={handleKeepPlannedOriginDialog}
      />
    </div>
  );
};
