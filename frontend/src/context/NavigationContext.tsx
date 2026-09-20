import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TravelMode, NavigationStep } from '../types';
import { useGPS } from './GPSContext';
import { voiceNavigation } from '../services/voiceNavigation';
import { isValidCoordinate, cleanPolylineCoords } from '../utils/coordinates';

// Distance helper
const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Find closest point on line segment
const closestPointOnSegment = (
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): [number, number] => {
  const dx = bLng - aLng;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [aLat, aLng];

  const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq));
  return [aLat + t * dy, aLng + t * dx];
};

export type NavigationMapStyle = 'standard' | 'satellite' | 'terrain' | 'night';
export type CameraOrientation = 'heading-up' | 'north-up';

export type NavigationLifecycleState =
  | 'IDLE'
  | 'VALIDATING_ROUTE'
  | 'CHECKING_PERMISSION'
  | 'ACQUIRING_LOCATION'
  | 'GPS_ACCEPTED'
  | 'INITIALIZING_NAV_MAP'
  | 'LOADING_HAZARDS'
  | 'READY'
  | 'ACTIVE'
  | 'REROUTING'
  | 'ERROR'
  | 'CANCELLED'
  | 'ENDED'
  | 'PREPARING'
  | 'ACQUIRING_GPS'
  | 'INITIALIZING_MAP';

export interface RouteGeometryPoint {
  lat: number;
  lng: number;
  cumulativeDistM: number;
}

export interface NavigationContextType {
  navigationState: NavigationLifecycleState;
  setNavigationState: (state: NavigationLifecycleState) => void;
  navigationError: string | null;
  setNavigationError: (err: string | null) => void;
  isBasic2DMode: boolean;
  setIsBasic2DMode: (val: boolean) => void;
  isNavigating: boolean;
  journeyId: string | null;
  travelMode: TravelMode;
  routeGeometry: [number, number][]; // [lat, lng]
  completedGeometry: [number, number][]; // [lat, lng]
  remainingGeometry: [number, number][]; // [lat, lng]
  
  // Real GPS & Snapping
  rawGpsPosition: [number, number] | null;
  snappedPosition: [number, number] | null;
  displayBearing: number;
  isOffRoute: boolean;
  offRouteDistanceMeters: number;
  hasArrived: boolean;

  // Turn-by-Turn Maneuvers
  currentStepIndex: number;
  currentStep: NavigationStep | null;
  nextStep: NavigationStep | null;
  secondNextStep: NavigationStep | null;
  distanceToNextStepMeters: number | null;
  currentRoadName: string;

  // Progress & ETA
  totalDistanceKm: number;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  estimatedArrivalTime: string;
  routeProgressPct: number;

  // Camera & Navigation Controls
  followMode: boolean;
  cameraOrientation: CameraOrientation;
  cameraPitch: number;
  mapStyle: NavigationMapStyle;
  voiceEnabled: boolean;

  // Disaster Awareness
  routeHazards: any[];
  activeHazardAlert: any | null;

  // Fallback Notice
  fallbackNotice: string | null;
  dismissFallbackNotice: () => void;

  // Route Preview Mode (when GPS is offline / unavailable)
  isRoutePreview: boolean;
  setIsRoutePreview: (val: boolean) => void;

  // Actions
  startNavigationSession: (params: {
    journeyId?: string | null;
    travelMode: TravelMode;
    geometry: number[][]; // [lon, lat] from OSRM
    navigationSteps: NavigationStep[];
    distanceKm: number;
    etaMinutes: number;
    hazards?: any[];
    initialLifecycleState?: NavigationLifecycleState;
  }) => boolean;
  stopNavigationSession: () => void;
  onMapReady: () => void;
  onMapError: (error: string) => void;
  recenterCamera: () => void;
  setFollowMode: (follow: boolean) => void;
  toggleCameraOrientation: () => void;
  setMapStyle: (style: NavigationMapStyle) => void;
  toggleVoice: () => void;
  updateActiveRoute: (geometry: number[][], navigationSteps: NavigationStep[], distanceKm: number, etaMinutes: number) => void;
  dismissHazardAlert: () => void;
  cancelPreparation: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { gps } = useGPS();

  const [navigationState, setNavigationState] = useState<NavigationLifecycleState>('IDLE');
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [isBasic2DMode, setIsBasic2DMode] = useState<boolean>(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [isRoutePreview, setIsRoutePreview] = useState<boolean>(false);
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('truck');
  const consecutiveOffRouteCountRef = useRef<number>(0);

  const isNavigating = navigationState === 'ACTIVE' || navigationState === 'REROUTING';

  // Precomputed Route Geometry with Cumulative Distances
  const [rawRouteCoords, setRawRouteCoords] = useState<[number, number][]>([]); // [lat, lng]
  const [routeDistancePoints, setRouteDistancePoints] = useState<RouteGeometryPoint[]>([]);
  const [navigationSteps, setNavigationSteps] = useState<NavigationStep[]>([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [routeDurationMin, setRouteDurationMin] = useState(0);

  // Dynamic Route Tracking State
  const [snappedPosition, setSnappedPosition] = useState<[number, number] | null>(null);
  const [rawGpsPosition, setRawGpsPosition] = useState<[number, number] | null>(null);
  const [displayBearing, setDisplayBearing] = useState<number>(0);
  const [isOffRoute, setIsOffRoute] = useState<boolean>(false);
  const [offRouteDistanceMeters, setOffRouteDistanceMeters] = useState<number>(0);
  const [hasArrived, setHasArrived] = useState<boolean>(false);

  // Maneuvers
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [distanceToNextStepMeters, setDistanceToNextStepMeters] = useState<number | null>(null);

  // Progress along route in meters (monotonically non-decreasing with hysteresis)
  const currentProgressMRef = useRef<number>(0);
  const [routeProgressPct, setRouteProgressPct] = useState<number>(0);
  const [remainingDistanceKm, setRemainingDistanceKm] = useState<number>(0);
  const [remainingDurationMinutes, setRemainingDurationMinutes] = useState<number>(0);
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState<string>('--');

  // Camera & Style Controls
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>('heading-up');
  const [mapStyle, setMapStyle] = useState<NavigationMapStyle>('standard');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(!voiceNavigation.getIsMuted());

  // Hazards
  const [routeHazards, setRouteHazards] = useState<any[]>([]);
  const [activeHazardAlert, setActiveHazardAlert] = useState<any | null>(null);
  const alertedHazardsRef = useRef<Set<string>>(new Set());

  // Step threshold announcement tracker
  const announcedStepsRef = useRef<Map<number, { announced1km?: boolean; announced300m?: boolean; announcedNow?: boolean }>>(new Map());

  // 1. Build Precomputed Geometry with Cumulative Distances
  const buildRoutePoints = useCallback((coords: [number, number][]): RouteGeometryPoint[] => {
    if (coords.length === 0) return [];
    const pts: RouteGeometryPoint[] = [{ lat: coords[0][0], lng: coords[0][1], cumulativeDistM: 0 }];
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const dist = haversineMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      total += dist;
      pts.push({ lat: coords[i][0], lng: coords[i][1], cumulativeDistM: total });
    }
    return pts;
  }, []);

  // 2. Start Navigation Session with Validation
  const startNavigationSession = useCallback((params: {
    journeyId?: string | null;
    travelMode: TravelMode;
    geometry: number[][]; // [lon, lat] from OSRM
    navigationSteps: NavigationStep[];
    distanceKm: number;
    etaMinutes: number;
    hazards?: any[];
    initialLifecycleState?: NavigationLifecycleState;
  }): boolean => {
    const validCoords = (params.geometry || []).filter(
      pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
    );

    if (validCoords.length < 2) {
      console.warn('[NAVIGATION] Invalid route geometry provided to startNavigationSession');
      setNavigationError('Route geometry is empty or invalid. Please calculate and select a valid route.');
      setNavigationState('ERROR');
      return false;
    }

    // Transform [lon, lat] -> [lat, lng]
    const latLngs: [number, number][] = validCoords.map(pt => [pt[1], pt[0]]);
    const pts = buildRoutePoints(latLngs);

    setJourneyId(params.journeyId || null);
    setTravelMode(params.travelMode);
    setRawRouteCoords(latLngs);
    setRouteDistancePoints(pts);
    setNavigationSteps(params.navigationSteps || []);
    setTotalDistanceKm(params.distanceKm || 0);
    setRouteDurationMin(params.etaMinutes || 0);
    setRouteHazards(params.hazards || []);

    currentProgressMRef.current = 0;
    setCurrentStepIndex(0);
    setHasArrived(false);
    setIsOffRoute(false);
    setFollowMode(true);
    setCameraOrientation('heading-up');
    alertedHazardsRef.current.clear();
    announcedStepsRef.current.clear();
    setNavigationError(null);

    // Set initial real phone GPS fix immediately if available, or fall back to route start
    if (isValidCoordinate(gps.latitude, gps.longitude)) {
      setRawGpsPosition([Number(gps.latitude), Number(gps.longitude)]);
      setSnappedPosition([Number(gps.latitude), Number(gps.longitude)]);
    } else if (latLngs.length > 0 && isValidCoordinate(latLngs[0][0], latLngs[0][1])) {
      setSnappedPosition([latLngs[0][0], latLngs[0][1]]);
    }

    const nextState = params.initialLifecycleState || 'ACTIVE';
    console.log(`[NAVIGATION] route_valid=true mode=${params.travelMode} pts=${pts.length} nextState=${nextState}`);
    setNavigationState(nextState);
    return true;
  }, [buildRoutePoints, gps.latitude, gps.longitude]);

  // 3. Map Ready & Error Handlers
  const onMapReady = useCallback(() => {
    console.log('[NAV_MAP] READY');
    // Ensure state is ACTIVE and never downgrade to READY (which would unmount NavigationExperience and cause blinking)
    setNavigationState('ACTIVE');
    console.log('[NAV] state = ACTIVE');
    voiceNavigation.speak(`Navigation ready. Follow the highlighted route.`);
  }, []);

  const cancelPreparation = useCallback(() => {
    console.log('[NAV] Preparation cancelled by user');
    setNavigationState('CANCELLED');
    setNavigationError(null);
    setTimeout(() => {
      setNavigationState('IDLE');
    }, 150);
  }, []);

  const dismissFallbackNotice = useCallback(() => {
    setFallbackNotice(null);
  }, []);

  const onMapError = useCallback((errorMsg: string) => {
    console.warn('[NAV_MAP_ERROR] Map error received:', errorMsg);
    // If not already in basic 2D mode, automatically switch to Leaflet standard navigation
    if (!isBasic2DMode) {
      console.log('[NAV_MAP] Seamlessly falling back to Leaflet 2D standard navigation');
      setIsBasic2DMode(true);
      setFallbackNotice('Advanced navigation map unavailable. Using standard navigation map.');
      setNavigationState('ACTIVE');
      return;
    }
    // Only set terminal ERROR state if basic 2D map also failed
    console.error('[NAV_MAP_TERMINAL_ERROR] Both map engines failed:', errorMsg);
    setNavigationError(errorMsg || 'Navigation map failed to initialize.');
    setNavigationState('ERROR');
  }, [isBasic2DMode]);

  // 4. Stop Navigation Session
  const stopNavigationSession = useCallback(() => {
    setNavigationState('ENDED');
    setTimeout(() => {
      setNavigationState('IDLE');
    }, 150);
    setFollowMode(true);
    setHasArrived(false);
    setIsBasic2DMode(false);
    setFallbackNotice(null);
    setIsRoutePreview(false);
    consecutiveOffRouteCountRef.current = 0;
  }, []);

  // 4. Update Active Route (when rerouted)
  const updateActiveRoute = useCallback((
    geometry: number[][],
    steps: NavigationStep[],
    distanceKm: number,
    etaMinutes: number
  ) => {
    const latLngs: [number, number][] = (geometry || []).map(pt => [pt[1], pt[0]]);
    const pts = buildRoutePoints(latLngs);

    setRawRouteCoords(latLngs);
    setRouteDistancePoints(pts);
    setNavigationSteps(steps || []);
    setTotalDistanceKm(distanceKm);
    setRouteDurationMin(etaMinutes);
    currentProgressMRef.current = 0;
    setCurrentStepIndex(0);
    setIsOffRoute(false);
    alertedHazardsRef.current.clear();
    announcedStepsRef.current.clear();

    voiceNavigation.announceReroute();
  }, [buildRoutePoints]);

  // 5. GPS Integration, Snapping, Progress, and Maneuver Progression
  useEffect(() => {
    const isTrackingActive =
      isNavigating ||
      navigationState === 'INITIALIZING_MAP' ||
      navigationState === 'INITIALIZING_NAV_MAP' ||
      navigationState === 'READY';

    if (!isTrackingActive || !isValidCoordinate(gps.latitude, gps.longitude)) {
      if (isValidCoordinate(gps.latitude, gps.longitude)) {
        setRawGpsPosition([Number(gps.latitude), Number(gps.longitude)]);
      }
      return;
    }

    const lat = Number(gps.latitude);
    const lng = Number(gps.longitude);
    setRawGpsPosition([lat, lng]);

    // Bearing resolution: device heading > last known
    if (gps.heading !== null && gps.heading !== undefined && !gps.isStationary) {
      setDisplayBearing(gps.heading);
    }

    if (routeDistancePoints.length < 2) {
      setSnappedPosition([lat, lng]);
      return;
    }

    // ── Find closest point on active route polyline (Spec §9 & §10) ──────────
    const currentAcc = gps.accuracy ?? 25;
    const baseSnap = travelMode === 'walking' ? 14 : travelMode === 'bicycle' ? 22 : 32;
    let snapThresholdMeters: number;
    if (currentAcc <= 15) {
      snapThresholdMeters = baseSnap;
    } else if (currentAcc <= 60) {
      snapThresholdMeters = baseSnap + (currentAcc * 0.35); // e.g. 32 + 21 = 53m
    } else if (currentAcc <= 120) {
      snapThresholdMeters = baseSnap + (currentAcc * 0.25); // e.g. 32 + 25 = 57m
    } else {
      // Very low confidence (> 120m): do not force snap to roads
      snapThresholdMeters = 0;
    }

    let minDistanceMeters = Infinity;
    let bestPoint: [number, number] = [lat, lng];
    let bestSegmentIndex = 0;
    let bestSegmentProgressM = 0;

    for (let i = 0; i < routeDistancePoints.length - 1; i++) {
      const p1 = routeDistancePoints[i];
      const p2 = routeDistancePoints[i + 1];
      const candidate = closestPointOnSegment(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
      const dist = haversineMeters(lat, lng, candidate[0], candidate[1]);

      if (dist < minDistanceMeters) {
        minDistanceMeters = dist;
        bestPoint = candidate;
        bestSegmentIndex = i;
        const subDist = haversineMeters(p1.lat, p1.lng, candidate[0], candidate[1]);
        bestSegmentProgressM = p1.cumulativeDistM + subDist;
      }
    }

    setOffRouteDistanceMeters(Math.round(minDistanceMeters));

    // Snapping & Confidence-based Off-Route Evaluation (Spec §9, §10, §24)
    if (minDistanceMeters <= snapThresholdMeters) {
      setSnappedPosition(bestPoint);
      setIsOffRoute(false);
      consecutiveOffRouteCountRef.current = 0;

      // Monotonic route progress (avoids jumping backwards unless rerouted)
      if (bestSegmentProgressM >= currentProgressMRef.current - 15) {
        currentProgressMRef.current = Math.max(currentProgressMRef.current, bestSegmentProgressM);
      }
    } else {
      // Outside snap tolerance: use raw GPS honestly
      setSnappedPosition([lat, lng]);

      // Only count as true deviation if sample is relatively reliable (accuracy <= 100m)
      if (currentAcc <= 100) {
        consecutiveOffRouteCountRef.current += 1;
      }

      // Require 2-3 consecutive confirmed samples before declaring true OFF ROUTE
      if (consecutiveOffRouteCountRef.current >= 2) {
        setIsOffRoute(true);
      } else {
        setIsOffRoute(false); // 1 sample = possible deviation, do not trigger false reroute
      }
    }

    // ── Remaining distance and arrival time ──────────────────────────────────
    const totalMeters = (totalDistanceKm || 0) * 1000;
    const progressM = currentProgressMRef.current;
    const remainingM = Math.max(0, totalMeters - progressM);
    const remKm = Math.round((remainingM / 1000) * 10) / 10;
    setRemainingDistanceKm(remKm);

    const progressPct = totalMeters > 0 ? Math.min(100, Math.round((progressM / totalMeters) * 100)) : 0;
    setRouteProgressPct(progressPct);

    // Calculate arrival clock time
    const speedKmh = (gps.currentSpeedKmh && gps.currentSpeedKmh > 5) ? gps.currentSpeedKmh : (travelMode === 'walking' ? 4.5 : travelMode === 'bicycle' ? 15 : 45);
    const estHoursRemaining = remKm / Math.max(5, speedKmh);
    const estMinRemaining = Math.max(1, Math.round(estHoursRemaining * 60));
    setRemainingDurationMinutes(estMinRemaining);

    const arrivalDate = new Date(Date.now() + estMinRemaining * 60 * 1000);
    setEstimatedArrivalTime(arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Check Destination Arrival (< 40m remaining)
    if (remainingM <= 40 && !hasArrived) {
      setHasArrived(true);
      voiceNavigation.announceArrival();
      return;
    }

    // ── Maneuver step countdown & advancement ────────────────────────────────
    if (navigationSteps.length > 0) {
      let stepIdx = currentStepIndex;
      const currentStepObj = navigationSteps[stepIdx];

      if (currentStepObj?.location) {
        const stepDist = haversineMeters(bestPoint[0], bestPoint[1], currentStepObj.location[0], currentStepObj.location[1]);
        setDistanceToNextStepMeters(Math.round(stepDist));

        // Advance step if within 25m or passed
        if (stepDist <= 25 && stepIdx < navigationSteps.length - 1) {
          stepIdx += 1;
          setCurrentStepIndex(stepIdx);
        }

        // Voice announcements at key thresholds (1km, 300m, now)
        const stepState = announcedStepsRef.current.get(stepIdx) || {};
        if (stepDist <= 1050 && stepDist > 800 && !stepState.announced1km) {
          stepState.announced1km = true;
          announcedStepsRef.current.set(stepIdx, stepState);
          voiceNavigation.announceManeuver(stepDist, currentStepObj.instruction, currentStepObj.road_name);
        } else if (stepDist <= 350 && stepDist > 150 && !stepState.announced300m) {
          stepState.announced300m = true;
          announcedStepsRef.current.set(stepIdx, stepState);
          voiceNavigation.announceManeuver(stepDist, currentStepObj.instruction, currentStepObj.road_name);
        } else if (stepDist <= 50 && !stepState.announcedNow) {
          stepState.announcedNow = true;
          announcedStepsRef.current.set(stepIdx, stepState);
          voiceNavigation.announceManeuver(stepDist, currentStepObj.instruction, currentStepObj.road_name);
        }
      } else {
        setDistanceToNextStepMeters(null);
      }
    }

    // ── Disaster Hazard Corridor Detection ahead ─────────────────────────────
    if (routeHazards && routeHazards.length > 0) {
      for (const hazard of routeHazards) {
        const hLat = hazard.latitude || hazard.lat;
        const hLon = hazard.longitude || hazard.lon || hazard.lng;
        if (hLat && hLon) {
          const distToHazardMeters = haversineMeters(bestPoint[0], bestPoint[1], hLat, hLon);
          const hazardKey = `${hazard.id || hazard.identifier || hazard.headline}`;

          // If hazard is within 15 km ahead on the corridor and not yet alerted
          if (distToHazardMeters < 15000 && !alertedHazardsRef.current.has(hazardKey)) {
            alertedHazardsRef.current.add(hazardKey);
            setActiveHazardAlert({
              ...hazard,
              distanceKmAhead: Math.round((distToHazardMeters / 1000) * 10) / 10,
            });
            voiceNavigation.announceHazard(
              hazard.event_type || hazard.disaster_type || 'Road Hazard',
              distToHazardMeters / 1000
            );
            break;
          }
        }
      }
    }
  }, [
    isNavigating,
    gps.latitude,
    gps.longitude,
    gps.heading,
    gps.currentSpeedKmh,
    gps.isStationary,
    routeDistancePoints,
    totalDistanceKm,
    travelMode,
    navigationSteps,
    currentStepIndex,
    hasArrived,
    routeHazards
  ]);

  // 6. Split Route Geometry into Completed (Subdued) and Remaining (Vibrant)
  const { completedGeometry, remainingGeometry } = useMemo(() => {
    if (rawRouteCoords.length < 2 || !snappedPosition) {
      return { completedGeometry: [], remainingGeometry: rawRouteCoords };
    }

    const currentProgressM = currentProgressMRef.current;
    const completed: [number, number][] = [];
    const remaining: [number, number][] = [];

    let splitIndex = 0;
    for (let i = 0; i < routeDistancePoints.length; i++) {
      if (routeDistancePoints[i].cumulativeDistM <= currentProgressM) {
        completed.push([routeDistancePoints[i].lat, routeDistancePoints[i].lng]);
        splitIndex = i;
      } else {
        break;
      }
    }

    // Add current snapped location to bridge the split seamlessly
    completed.push(snappedPosition);
    remaining.push(snappedPosition);

    for (let i = splitIndex + 1; i < rawRouteCoords.length; i++) {
      remaining.push(rawRouteCoords[i]);
    }

    return { completedGeometry: completed, remainingGeometry: remaining };
  }, [rawRouteCoords, routeDistancePoints, snappedPosition]);

  // 7. Dynamic Camera Pitch based on speed
  const cameraPitch = useMemo(() => {
    const speed = gps.currentSpeedKmh || 0;
    if (gps.isStationary || speed < 5) return 40;
    if (speed < 40) return 50;
    return 60; // Highway / high-speed tilted view
  }, [gps.currentSpeedKmh, gps.isStationary]);

  // 8. Control Actions
  const recenterCamera = useCallback(() => {
    setFollowMode(true);
    setCameraOrientation('heading-up');
  }, []);

  const toggleCameraOrientation = useCallback(() => {
    setCameraOrientation(prev => prev === 'heading-up' ? 'north-up' : 'heading-up');
  }, []);

  const toggleVoice = useCallback(() => {
    const nextMuted = voiceNavigation.toggleMute();
    setVoiceEnabled(!nextMuted);
  }, []);

  const dismissHazardAlert = useCallback(() => {
    setActiveHazardAlert(null);
  }, []);

  // Step accessors
  const currentStep = navigationSteps[currentStepIndex] || null;
  const nextStep = navigationSteps[currentStepIndex + 1] || null;
  const secondNextStep = navigationSteps[currentStepIndex + 2] || null;
  const currentRoadName = currentStep?.road_name || 'Active Corridor';

  const contextValue: NavigationContextType = {
    navigationState,
    setNavigationState,
    navigationError,
    setNavigationError,
    isBasic2DMode,
    setIsBasic2DMode,
    isNavigating,
    journeyId,
    travelMode,
    routeGeometry: rawRouteCoords,
    completedGeometry,
    remainingGeometry,
    rawGpsPosition,
    snappedPosition,
    displayBearing,
    isOffRoute,
    offRouteDistanceMeters,
    hasArrived,
    currentStepIndex,
    currentStep,
    nextStep,
    secondNextStep,
    distanceToNextStepMeters,
    currentRoadName,
    totalDistanceKm,
    remainingDistanceKm,
    remainingDurationMinutes,
    estimatedArrivalTime,
    routeProgressPct,
    followMode,
    cameraOrientation,
    cameraPitch,
    mapStyle,
    voiceEnabled,
    routeHazards,
    activeHazardAlert,
    fallbackNotice,
    dismissFallbackNotice,
    isRoutePreview,
    setIsRoutePreview,
    startNavigationSession,
    stopNavigationSession,
    onMapReady,
    onMapError,
    recenterCamera,
    setFollowMode,
    toggleCameraOrientation,
    setMapStyle,
    toggleVoice,
    updateActiveRoute,
    dismissHazardAlert,
    cancelPreparation,
  };

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
};
