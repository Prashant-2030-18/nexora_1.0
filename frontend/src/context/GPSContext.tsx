import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { GPSState, GPSStatus, SpeedSource, TravelMode } from '../types';

export interface GPSDebugTelemetry {
  sampleCount: number;
  lastLat: number | null;
  lastLng: number | null;
  lastTimestamp: number | null;
  prevLat: number | null;
  prevLng: number | null;
  deltaMeters: number | null;
  deltaSeconds: number | null;
  rawCoordsSpeedMps: number | null;
  rawConvertedKmh: number | null;
  calculatedKmh: number | null;
  smoothedKmh: number | null;
  activeSource: SpeedSource;
  accuracyMeters: number | null;
  modeCeilingKmh: number;
  rawSpeedMps?: number | null;
  calculatedSpeedKmh?: number | null;
  plausibilityCeilingKmh?: number;
  recentSamples: number[];
  rawAccuracy?: number | null;
  filtered?: boolean;
  snapDeltaM?: number;
  rejectedReason?: string;
}

export type GPSQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LOW' | 'VERY_LOW' | 'UNAVAILABLE';

export const classifyGPSQuality = (acc: number | null | undefined): GPSQuality => {
  if (acc === null || acc === undefined || !Number.isFinite(acc)) return 'UNAVAILABLE';
  if (acc <= 10) return 'EXCELLENT';
  if (acc <= 25) return 'GOOD';
  if (acc <= 50) return 'FAIR';
  if (acc <= 100) return 'LOW';
  return 'VERY_LOW';
};

export type GPSAcquisitionStatus =
  | 'IDLE'
  | 'REQUESTING_LOCATION'
  | 'ACQUIRING_GPS'
  | 'GPS_FOUND'
  | 'GPS_WEAK'
  | 'PERMISSION_DENIED'
  | 'GPS_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INSECURE_CONTEXT';

export interface RefinedGPSResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  accuracyQuality: GPSQuality;
  warningMessage?: string;
  isRecentCache?: boolean;
}

export interface GPSContextType {
  gps: GPSState;
  gpsState: GPSState;
  isTracking: boolean;
  selectedTravelMode: TravelMode;
  setSelectedTravelMode: (mode: TravelMode) => void;
  startTracking: () => void;
  stopTracking: () => void;
  getFreshFix: () => Promise<{ latitude: number; longitude: number; accuracy: number }>;
  acquireRefinedFix: (
    onProgress?: (status: GPSAcquisitionStatus, currentAcc?: number) => void,
    maxWaitMs?: number,
    bypassCache?: boolean
  ) => Promise<RefinedGPSResult>;
  debugTelemetry: GPSDebugTelemetry;
}

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
};

// Robust median smoothing across 3-5 speed samples
const calculateMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Mode-aware physical speed ceilings (sanity filter)
const MODE_SPEED_CEILINGS: Record<TravelMode, number> = {
  walking: 18.0,    // 5 m/s (~18 km/h max sprint)
  bicycle: 65.0,    // ~65 km/h downhill racing
  car: 180.0,       // normal highway limits
  truck: 140.0,     // heavy commercial limiter
  train: 260.0,     // rail maximum
  flight: 1150.0,   // commercial subsonic aviation
};

const initialGpsState: GPSState = {
  latitude: null,
  longitude: null,
  accuracy: null,
  accuracyMeters: null,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  headingDegrees: null,
  rawSpeedMps: null,
  rawGpsSpeedMps: null,
  currentSpeedKmh: null,
  speedKmh: null,
  speedSource: 'UNAVAILABLE',
  isMoving: false,
  isStationary: false,
  reasonUnavailable: 'GPS not started',
  selectedTravelMode: 'truck',
  timestamp: null,
  gpsStatus: 'IDLE',
  permissionStatus: 'unknown',
  isTracking: false,
  lastReliableFix: null,
  rawGpsPosition: null,
  snappedPosition: null,
  isOffRoute: false,
  offRouteDistanceMeters: 0,
};

const initialDebug: GPSDebugTelemetry = {
  sampleCount: 0,
  lastLat: null,
  lastLng: null,
  lastTimestamp: null,
  prevLat: null,
  prevLng: null,
  deltaMeters: null,
  deltaSeconds: null,
  rawCoordsSpeedMps: null,
  rawConvertedKmh: null,
  calculatedKmh: null,
  smoothedKmh: null,
  activeSource: 'UNAVAILABLE',
  accuracyMeters: null,
  modeCeilingKmh: 140.0,
  rawSpeedMps: null,
  calculatedSpeedKmh: null,
  plausibilityCeilingKmh: 140.0,
  recentSamples: [],
};

const GPSContext = createContext<GPSContextType | undefined>(undefined);

export const GPSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gpsState, setGpsState] = useState<GPSState>(initialGpsState);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode>('truck');
  const [debugTelemetry, setDebugTelemetry] = useState<GPSDebugTelemetry>(initialDebug);

  const watchIdRef = useRef<number | null>(null);
  const historyFixesRef = useRef<Array<{ lat: number; lng: number; timestamp: number; accuracy: number }>>([]);
  const recentSpeedsRef = useRef<number[]>([]);
  const sampleCountRef = useRef<number>(0);
  const travelModeRef = useRef<TravelMode>(selectedTravelMode);
  const lastSpeedRef = useRef<number | null>(null);
  const lastSpeedSourceRef = useRef<SpeedSource>('UNAVAILABLE');
  const lastHeadingRef = useRef<number | null>(null);
  const gpsStateRef = useRef<GPSState>(initialGpsState);

  useEffect(() => {
    gpsStateRef.current = gpsState;
  }, [gpsState]);

  // Keep ref synchronized with state to avoid re-binding watchPosition
  useEffect(() => {
    travelModeRef.current = selectedTravelMode;
  }, [selectedTravelMode]);

  // Query browser permission status if supported
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          const perm = result.state as 'granted' | 'prompt' | 'denied';
          setGpsState(prev => ({
            ...prev,
            permissionStatus: perm,
            gpsStatus: perm === 'denied' ? 'DENIED' : prev.gpsStatus,
          }));
          result.onchange = () => {
            const nextPerm = result.state as 'granted' | 'prompt' | 'denied';
            setGpsState(prev => ({
              ...prev,
              permissionStatus: nextPerm,
              gpsStatus: nextPerm === 'denied' ? 'DENIED' : prev.gpsStatus,
            }));
          };
        })
        .catch(() => {
          // Ignore unsupported permission queries
        });
    }
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    historyFixesRef.current = [];
    recentSpeedsRef.current = [];
    sampleCountRef.current = 0;
    lastSpeedRef.current = null;
    lastSpeedSourceRef.current = 'UNAVAILABLE';
    lastHeadingRef.current = null;

    setGpsState(prev => ({
      ...prev,
      isTracking: false,
      gpsStatus: prev.gpsStatus === 'DENIED' ? 'DENIED' : 'IDLE',
      speedSource: 'UNAVAILABLE',
      currentSpeedKmh: null,
      speedKmh: null,
      rawSpeedMps: null,
      isStationary: false,
      isMoving: false,
      reasonUnavailable: 'Navigation stopped',
    }));
  }, []);

  const handlePositionUpdate = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
    const timestamp = pos.timestamp || Date.now();
    sampleCountRef.current += 1;

    const currentMode = travelModeRef.current;
    const ceilingKmh = MODE_SPEED_CEILINGS[currentMode] || 140.0;

    // ── POSITION QUALITY FILTER (Spec §7) ──────────────────────────────────
    // 1. Timestamp Freshness Check (reject stale cache > 45s old)
    if (timestamp < Date.now() - 45000) {
      console.warn('[GPS] Discarding stale cached fix (>45s old)', timestamp);
      return;
    }

    // 2. Coarse Network / Cellular Jump Rejection (> 1500m or > 600m when recent good fix <= 100m exists)
    const lastFix = historyFixesRef.current.length > 0
      ? historyFixesRef.current[historyFixesRef.current.length - 1]
      : null;

    if (accuracy > 1500 || (accuracy > 600 && lastFix && lastFix.accuracy <= 100 && (timestamp - lastFix.timestamp) < 15000)) {
      console.warn('[GPS] Discarding coarse cell/Wi-Fi jump fix', accuracy);
      return;
    }

    // 3. Unrealistic Teleportation Jump Check
    if (lastFix) {
      const dt = Math.max(0.1, (timestamp - lastFix.timestamp) / 1000);
      const jumpMeters = haversineMeters(lastFix.lat, lastFix.lng, latitude, longitude);
      const impliedKmh = (jumpMeters / dt) * 3.6;

      const maxPlausibleKmh = currentMode === 'walking' ? 30 : currentMode === 'bicycle' ? 85 : 220;
      if (dt < 4.0 && impliedKmh > maxPlausibleKmh) {
        console.warn(`[GPS] Rejecting impossible position jump: ${Math.round(jumpMeters)}m in ${dt.toFixed(1)}s (${Math.round(impliedKmh)} km/h exceeds ${maxPlausibleKmh} km/h limit)`);
        setDebugTelemetry(prev => ({
          ...prev,
          sampleCount: sampleCountRef.current,
          lastLat: lastFix.lat,
          lastLng: lastFix.lng,
          accuracyMeters: Math.round(accuracy),
          activeSource: 'UNAVAILABLE',
        }));
        return;
      }
    }

    // ── BEST-AVAILABLE-FIX LOGIC (Spec §8) ─────────────────────────────────
    // If previous fix was high precision (<= 25m) and new sample is significantly degraded (> 100m) within 4s:
    // keep using previous coordinate for vehicle marker positioning while waiting for a better fix.
    let displayLat = latitude;
    let displayLng = longitude;
    if (lastFix && lastFix.accuracy <= 25 && accuracy > 100 && (timestamp - lastFix.timestamp) < 4000) {
      displayLat = lastFix.lat;
      displayLng = lastFix.lng;
    }

    let computedSpeedMps: number | null = null;
    let computedSpeedKmh: number | null = null;
    let source: SpeedSource = 'UNAVAILABLE';
    let isMoving: boolean = false;
    let isStationary: boolean = false;
    let reasonUnavailable: string | null = null;
    let deltaM: number | null = null;
    let deltaS: number | null = null;
    let fallbackKmh: number | null = null;
    let computedHeading: number | null = (heading !== null && heading !== undefined && Number.isFinite(heading) && heading >= 0)
      ? Math.round(heading)
      : null;

    // ── 1. PRIORITY 1: HARDWARE / DEVICE GPS SPEED ───────────────────────────
    if (speed !== null && speed !== undefined && Number.isFinite(speed) && speed >= 0) {
      const rawKmh = speed * 3.6;

      // Check stationary threshold (< 0.35 m/s = ~1.2 km/h)
      if (speed < 0.35) {
        computedSpeedMps = 0;
        computedSpeedKmh = 0;
        source = 'STATIONARY';
        isStationary = true;
        isMoving = false;
        reasonUnavailable = null;
      } else if (rawKmh <= ceilingKmh) {
        computedSpeedMps = speed;
        computedSpeedKmh = rawKmh;
        source = 'DEVICE_GPS';
        isStationary = false;
        isMoving = true;
        reasonUnavailable = null;
      } else {
        // Discard impossible GPS spike
        computedSpeedMps = null;
        computedSpeedKmh = null;
        source = 'UNAVAILABLE';
        isStationary = false;
        isMoving = false;
        reasonUnavailable = `GPS speed spike rejected (${Math.round(rawKmh)} km/h exceeds ${currentMode} limit ${ceilingKmh} km/h)`;
      }
    } else {
      // ── 2. PRIORITY 2: FALLBACK SPEED FROM CONSECUTIVE GPS SAMPLES ─────────
      // Scan backward for an anchor fix at least 0.7s to 5.0s in the past
      const history = historyFixesRef.current;
      let anchorFix: { lat: number; lng: number; timestamp: number; accuracy: number } | null = null;

      for (let i = history.length - 1; i >= 0; i--) {
        const dt = (timestamp - history[i].timestamp) / 1000;
        if (dt >= 0.7 && dt <= 5.0) {
          anchorFix = history[i];
          break;
        }
      }

      if (anchorFix) {
        deltaS = (timestamp - anchorFix.timestamp) / 1000;
        deltaM = haversineMeters(anchorFix.lat, anchorFix.lng, latitude, longitude);

        // Adaptive noise threshold based on accuracy bounds
        const noiseThreshold = Math.max(3.5, Math.min(accuracy, anchorFix.accuracy) * 0.35);

        if (deltaM <= noiseThreshold) {
          // Stationary: repeated samples with displacement below noise threshold
          computedSpeedMps = 0;
          computedSpeedKmh = 0;
          source = 'STATIONARY';
          isStationary = true;
          isMoving = false;
          reasonUnavailable = null;
        } else {
          // Genuine movement detected
          const calculatedMps = deltaM / deltaS;
          const calculatedKmh = calculatedMps * 3.6;
          fallbackKmh = calculatedKmh;

          if (calculatedKmh <= ceilingKmh) {
            computedSpeedMps = calculatedMps;
            computedSpeedKmh = calculatedKmh;
            source = 'CALCULATED_GPS';
            isStationary = false;
            isMoving = calculatedKmh >= 1.0;
            reasonUnavailable = null;

            // If hardware heading is unavailable, derive bearing from movement
            if (computedHeading === null && deltaM >= 4.0) {
              computedHeading = Math.round(calculateBearing(anchorFix.lat, anchorFix.lng, latitude, longitude));
            }
          } else {
            computedSpeedMps = null;
            computedSpeedKmh = null;
            source = 'UNAVAILABLE';
            isStationary = false;
            isMoving = false;
            reasonUnavailable = `Displacement speed (${Math.round(calculatedKmh)} km/h) exceeds ${currentMode} limit`;
          }
        }
      } else if (history.length > 0) {
        // Immediate previous fix was < 0.7s ago
        const prevFix = history[history.length - 1];
        const quickDeltaM = haversineMeters(prevFix.lat, prevFix.lng, latitude, longitude);
        if (accuracy <= 35 && quickDeltaM < 2.0) {
          computedSpeedMps = 0;
          computedSpeedKmh = 0;
          source = 'STATIONARY';
          isStationary = true;
          isMoving = false;
          reasonUnavailable = null;
        } else {
          const priorSpeed = lastSpeedRef.current;
          if (priorSpeed !== null && priorSpeed !== undefined) {
            computedSpeedKmh = priorSpeed;
            source = lastSpeedSourceRef.current === 'STATIONARY' ? 'STATIONARY' : 'CALCULATED_GPS';
            isStationary = computedSpeedKmh === 0;
            isMoving = (computedSpeedKmh || 0) >= 1.0;
            reasonUnavailable = 'Sampling next position...';
          } else if (accuracy <= 25) {
            computedSpeedMps = 0;
            computedSpeedKmh = 0;
            source = 'STATIONARY';
            isStationary = true;
            isMoving = false;
            reasonUnavailable = null;
          } else {
            computedSpeedMps = null;
            computedSpeedKmh = null;
            source = 'SPEED_UNAVAILABLE';
            isStationary = false;
            isMoving = false;
            reasonUnavailable = 'Sampling next position to determine speed...';
          }
        }
      } else {
        // First fix ever received
        if (accuracy <= 30) {
          computedSpeedMps = 0;
          computedSpeedKmh = 0;
          source = 'STATIONARY';
          isStationary = true;
          isMoving = false;
          reasonUnavailable = null;
        } else {
          computedSpeedMps = null;
          computedSpeedKmh = null;
          source = 'SPEED_UNAVAILABLE';
          isStationary = false;
          isMoving = false;
          reasonUnavailable = 'Acquiring consecutive GPS fix to calculate speed...';
        }
      }
    }

    // ── 3. SPEED SMOOTHING (3-5 sample rolling median) ────────────────────────
    let finalSpeedKmh: number | null = computedSpeedKmh;
    if (source === 'STATIONARY') {
      recentSpeedsRef.current = [0];
      finalSpeedKmh = 0;
      isMoving = false;
      isStationary = true;
    } else if (source === 'UNAVAILABLE' || source === 'SPEED_UNAVAILABLE') {
      finalSpeedKmh = null;
      isMoving = false;
      isStationary = false;
    } else if (computedSpeedKmh !== null) {
      recentSpeedsRef.current.push(computedSpeedKmh);
      if (recentSpeedsRef.current.length > 5) {
        recentSpeedsRef.current.shift();
      }
      const medianVal = calculateMedian(recentSpeedsRef.current);
      if (currentMode === 'walking' || currentMode === 'bicycle') {
        finalSpeedKmh = Math.round(medianVal * 10) / 10;
      } else {
        finalSpeedKmh = Math.round(medianVal);
      }
      computedSpeedMps = finalSpeedKmh / 3.6;
      isMoving = finalSpeedKmh >= 0.8;
      isStationary = finalSpeedKmh < 0.8;
      if (isStationary) {
        finalSpeedKmh = 0;
        source = 'STATIONARY';
      }
    }

    // Invariant guard: if speed is null, source must NEVER be CALCULATED_GPS or DEVICE_GPS
    if (finalSpeedKmh === null) {
      source = 'SPEED_UNAVAILABLE';
      isMoving = false;
      isStationary = false;
    } else if (finalSpeedKmh === 0) {
      source = 'STATIONARY';
      isMoving = false;
      isStationary = true;
    }

    lastSpeedRef.current = finalSpeedKmh;
    lastSpeedSourceRef.current = source;

    // Preserve heading when stationary to prevent wild spinning
    const finalHeading = computedHeading !== null
      ? computedHeading
      : lastHeadingRef.current;

    if (computedHeading !== null && isMoving) {
      lastHeadingRef.current = computedHeading;
    }

    // Append to history buffer (cap at 15 items)
    historyFixesRef.current.push({ lat: latitude, lng: longitude, timestamp, accuracy });
    if (historyFixesRef.current.length > 15) {
      historyFixesRef.current.shift();
    }

    const prevFix = historyFixesRef.current.length > 1
      ? historyFixesRef.current[historyFixesRef.current.length - 2]
      : null;

    // Update debug telemetry
    setDebugTelemetry({
      sampleCount: sampleCountRef.current,
      lastLat: latitude,
      lastLng: longitude,
      lastTimestamp: timestamp,
      prevLat: prevFix?.lat || null,
      prevLng: prevFix?.lng || null,
      deltaMeters: deltaM !== null ? Math.round(deltaM * 10) / 10 : null,
      deltaSeconds: deltaS !== null ? Math.round(deltaS * 10) / 10 : null,
      rawCoordsSpeedMps: speed !== null && speed !== undefined ? Math.round(speed * 100) / 100 : null,
      rawConvertedKmh: speed !== null && speed !== undefined ? Math.round(speed * 3.6 * 10) / 10 : null,
      calculatedKmh: fallbackKmh !== null ? Math.round(fallbackKmh * 10) / 10 : null,
      smoothedKmh: finalSpeedKmh,
      activeSource: source,
      accuracyMeters: Math.round(accuracy),
      modeCeilingKmh: ceilingKmh,
      rawSpeedMps: computedSpeedMps,
      calculatedSpeedKmh: fallbackKmh,
      plausibilityCeilingKmh: ceilingKmh,
      recentSamples: [...recentSpeedsRef.current],
    });

    const currentGpsStatus: GPSStatus = accuracy > 75 ? 'WEAK' : 'LIVE';
    const quality = classifyGPSQuality(accuracy);
    const sourceLabel = (finalSpeedKmh === null || source === 'SPEED_UNAVAILABLE' || source === 'UNAVAILABLE')
      ? 'SPEED UNAVAILABLE'
      : source === 'DEVICE_GPS'
        ? 'LIVE GPS'
        : source === 'CALCULATED_GPS'
          ? 'CALCULATED GPS'
          : source === 'STATIONARY'
            ? 'STATIONARY'
            : 'SPEED UNAVAILABLE';

    setGpsState(prev => ({
      ...prev,
      latitude: displayLat,
      longitude: displayLng,
      accuracy: Math.round(accuracy),
      accuracyMeters: Math.round(accuracy),
      gpsQuality: quality,
      source: sourceLabel,
      altitude: altitude !== null && Number.isFinite(altitude) ? Math.round(altitude) : null,
      altitudeAccuracy: altitudeAccuracy !== null && Number.isFinite(altitudeAccuracy) ? Math.round(altitudeAccuracy) : null,
      heading: finalHeading,
      headingDegrees: finalHeading,
      rawSpeedMps: computedSpeedMps,
      rawGpsSpeedMps: speed !== null && speed !== undefined ? Math.round(speed * 100) / 100 : null,
      currentSpeedKmh: finalSpeedKmh,
      speedKmh: finalSpeedKmh,
      speedSource: source,
      isMoving,
      isStationary,
      reasonUnavailable,
      selectedTravelMode: currentMode,
      timestamp,
      gpsStatus: currentGpsStatus,
      isTracking: true,
      lastReliableFix: accuracy <= 50 ? { latitude, longitude, timestamp, accuracy: Math.round(accuracy) } : prev.lastReliableFix,
      rawGpsPosition: [displayLat, displayLng],
    }));
  }, []);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    let status: GPSStatus = 'UNAVAILABLE';
    let perm: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';

    if (err.code === err.PERMISSION_DENIED) {
      status = 'DENIED';
      perm = 'denied';
    }
    setGpsState(prev => ({
      ...prev,
      gpsStatus: status,
      permissionStatus: perm,
      currentSpeedKmh: null,
      speedKmh: null,
      rawSpeedMps: null,
      speedSource: 'UNAVAILABLE',
      isStationary: false,
      isMoving: false,
      reasonUnavailable: err.message || 'GPS signal unavailable',
    }));
  }, []);

  const startTracking = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsState(prev => ({ ...prev, gpsStatus: 'UNAVAILABLE', reasonUnavailable: 'Geolocation API not supported' }));
      return;
    }

    // Ensure strictly ONE active watcher across React re-renders
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    historyFixesRef.current = [];
    recentSpeedsRef.current = [];
    sampleCountRef.current = 0;

    setGpsState(prev => ({
      ...prev,
      gpsStatus: prev.permissionStatus === 'granted' ? 'ACQUIRING' : 'REQUESTING_PERMISSION',
      isTracking: true,
      currentSpeedKmh: null,
      speedKmh: null,
      speedSource: 'UNAVAILABLE',
      reasonUnavailable: 'Locating device...',
    }));
    setIsTracking(true);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handlePositionError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000,
        }
      );
    } catch (e) {
      console.error('[GPSContext] Failed to start watchPosition:', e);
      setGpsState(prev => ({ ...prev, gpsStatus: 'UNAVAILABLE', isTracking: false, reasonUnavailable: 'Failed to access device GPS' }));
      setIsTracking(false);
    }
  }, [handlePositionUpdate, handlePositionError]);

  // Clean unmount on window / page unload
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // One-shot high accuracy fix for Citizen Portal and Forms
  const getFreshFix = useCallback((): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }

      // If we already have a recent live fix (< 3s old), use it directly
      if (
        gpsState.latitude !== null &&
        gpsState.longitude !== null &&
        gpsState.timestamp &&
        Date.now() - gpsState.timestamp < 3000
      ) {
        resolve({
          latitude: gpsState.latitude,
          longitude: gpsState.longitude,
          accuracy: gpsState.accuracy || 10,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const acc = Math.round(pos.coords.accuracy);

          setGpsState(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            timestamp: pos.timestamp,
            gpsStatus: 'LIVE',
          }));

          resolve({ latitude: lat, longitude: lng, accuracy: acc });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
      );
    });
  }, [gpsState]);

  // Multi-sample refined GPS acquisition (5-8s refinement window)
  // Multi-sample refined GPS acquisition with fast-first strategy and background refinement
  const acquireRefinedFix = useCallback((
    onProgress?: (status: GPSAcquisitionStatus, currentAcc?: number) => void,
    maxWaitMs: number = 5000,
    bypassCache: boolean = false
  ): Promise<RefinedGPSResult> => {
    return new Promise((resolve, reject) => {
      // Step 1: Check shared GPSContext fast-path (age <= 60s, valid coordinates, accuracy <= 100m)
      if (!bypassCache) {
        const cached = gpsStateRef.current;
        if (
          cached &&
          cached.latitude !== null &&
          cached.longitude !== null &&
          cached.timestamp &&
          Date.now() - cached.timestamp <= 60000 &&
          cached.accuracy !== null &&
          cached.accuracy <= 350
        ) {
          const acc = Math.round(cached.accuracy);
          const quality = classifyGPSQuality(acc);
          onProgress?.('GPS_FOUND', acc);
          resolve({
            latitude: cached.latitude,
            longitude: cached.longitude,
            accuracy: acc,
            timestamp: cached.timestamp,
            accuracyQuality: quality,
            isRecentCache: true,
          });
          return;
        }
      }

      if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        onProgress?.('INSECURE_CONTEXT');
        const err = new Error('Live GPS requires HTTPS on mobile devices.');
        (err as any).gpsErrorCode = 'INSECURE_CONTEXT';
        reject(err);
        return;
      }

      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        onProgress?.('GPS_UNAVAILABLE');
        const err = new Error('Geolocation is not supported by this browser.');
        (err as any).gpsErrorCode = 'GPS_UNAVAILABLE';
        reject(err);
        return;
      }

      onProgress?.('REQUESTING_LOCATION');

      let isDone = false;
      let tempWatchId: number | null = null;
      let bestFix: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null = null;

      const finishWithBest = () => {
        if (isDone) return;
        isDone = true;
        if (tempWatchId !== null) {
          navigator.geolocation.clearWatch(tempWatchId);
          tempWatchId = null;
        }

        if (!bestFix) {
          onProgress?.('TIMEOUT');
          const err = new Error('GPS request timed out before acquiring a fix.');
          (err as any).gpsErrorCode = 'TIMEOUT';
          const lastFix = gpsStateRef.current;
          if (lastFix && lastFix.latitude !== null && lastFix.longitude !== null && lastFix.timestamp && Date.now() - lastFix.timestamp <= 300000) {
            (err as any).recentFix = {
              latitude: lastFix.latitude,
              longitude: lastFix.longitude,
              accuracy: lastFix.accuracy,
              timestamp: lastFix.timestamp,
            };
          }
          reject(err);
          return;
        }

        const lat = parseFloat(bestFix.latitude.toFixed(6));
        const lng = parseFloat(bestFix.longitude.toFixed(6));
        const acc = Math.round(bestFix.accuracy);
        const quality = classifyGPSQuality(acc);

        let warning: string | undefined;
        if (quality === 'LOW') {
          warning = `GPS accuracy is ±${acc}m (low). Navigation will proceed while improving signal.`;
        } else if (quality === 'VERY_LOW') {
          warning = `GPS accuracy is currently ±${acc}m. Move outdoors or near a window for better signal.`;
        }

        onProgress?.(acc <= 100 ? 'GPS_FOUND' : 'GPS_WEAK', acc);

        setGpsState(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          accuracyMeters: acc,
          timestamp: bestFix!.timestamp,
          gpsStatus: acc > 100 ? 'WEAK' : 'LIVE',
          rawGpsPosition: [lat, lng],
        }));

        resolve({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          timestamp: bestFix.timestamp,
          accuracyQuality: quality,
          warningMessage: warning,
          isRecentCache: false,
        });
      };

      // Bounded timeout: 5-6s max so user is never trapped
      const timerId = setTimeout(finishWithBest, maxWaitMs);

      // Fast first fix attempt
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isDone) return;
          bestFix = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          onProgress?.('ACQUIRING_GPS', Math.round(pos.coords.accuracy));

          // If first fix is USABLE or better (<= 350m, e.g. ±107m), finish immediately!
          if (pos.coords.accuracy <= 350) {
            clearTimeout(timerId);
            finishWithBest();
            return;
          }

          // Otherwise, start brief refinement watcher for remaining seconds
          tempWatchId = navigator.geolocation.watchPosition(
            (watchPos) => {
              if (isDone) return;
              const curAcc = watchPos.coords.accuracy;
              onProgress?.('ACQUIRING_GPS', Math.round(curAcc));
              if (!bestFix || curAcc < bestFix.accuracy) {
                bestFix = {
                  latitude: watchPos.coords.latitude,
                  longitude: watchPos.coords.longitude,
                  accuracy: curAcc,
                  timestamp: watchPos.timestamp,
                };
              }
              // As soon as fix becomes usable (<= 350m), proceed immediately!
              if (curAcc <= 350) {
                clearTimeout(timerId);
                finishWithBest();
              }
            },
            () => {
              clearTimeout(timerId);
              finishWithBest();
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: maxWaitMs }
          );
        },
        (err) => {
          clearTimeout(timerId);
          if (isDone) return;
          isDone = true;
          if (err.code === err.PERMISSION_DENIED) {
            onProgress?.('PERMISSION_DENIED');
            const e = new Error('Location permission required. Please allow device location access to navigate.');
            (e as any).gpsErrorCode = 'PERMISSION_DENIED';
            reject(e);
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            onProgress?.('GPS_UNAVAILABLE');
            const e = new Error('Device location unavailable. Check that GPS / Location Services are switched on.');
            (e as any).gpsErrorCode = 'POSITION_UNAVAILABLE';
            reject(e);
          } else {
            onProgress?.('TIMEOUT');
            const e = new Error('GPS request timed out. Please check signal and retry.');
            (e as any).gpsErrorCode = 'TIMEOUT';
            const lastFix = gpsStateRef.current;
            if (lastFix && lastFix.latitude !== null && lastFix.longitude !== null && lastFix.timestamp && Date.now() - lastFix.timestamp <= 300000) {
              (e as any).recentFix = {
                latitude: lastFix.latitude,
                longitude: lastFix.longitude,
                accuracy: lastFix.accuracy,
                timestamp: lastFix.timestamp,
              };
            }
            reject(e);
          }
        },
        { enableHighAccuracy: true, timeout: 4500, maximumAge: 10000 }
      );
    });
  }, []);

  return (
    <GPSContext.Provider
      value={{
        gps: gpsState,
        gpsState,
        isTracking,
        selectedTravelMode,
        setSelectedTravelMode,
        startTracking,
        stopTracking,
        getFreshFix,
        acquireRefinedFix,
        debugTelemetry,
      }}
    >
      {children}
    </GPSContext.Provider>
  );
};

export const useGPS = (): GPSContextType => {
  const context = useContext(GPSContext);
  if (!context) {
    throw new Error('useGPS must be used within a GPSProvider');
  }
  return context;
};
