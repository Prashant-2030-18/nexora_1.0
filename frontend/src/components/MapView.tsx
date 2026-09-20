import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import {
  Layers, AlertTriangle, Warehouse as WarehouseIcon, Truck, MapPin,
  ShieldAlert, Navigation, Zap, Compass, CheckCircle2, Search,
  Locate, Crosshair, CloudRain, Shield, Info, Maximize2, Minimize2,
  RefreshCw, Plus, Minus, Check, Eye, EyeOff, Radio, Fuel, Clock, Route
} from 'lucide-react';
import { DistrictData, LogisticsHubData, WarehouseData, IncidentData, RoadData, DisasterAlertData, UserDisasterReport, TravelMode } from '../types';
import { api } from '../services/api';
import { useGPS } from '../context/GPSContext';
import { GoogleMapPane } from './GoogleMapPane';
import { DisasterMarkerLeaflet, normalizeDisasterGeometry } from './DisasterMarker';
import { isValidCoordinate, cleanPolylineCoords, DEFAULT_MAP_CENTER } from '../utils/coordinates';

// Map controller to provide programatic API access (flyTo, zoomIn, zoomOut, fullscreen)
// Map controller to provide programmatic API access and pan detection
const MapBridge: React.FC<{
  onMapReady: (map: L.Map) => void;
  center: [number, number];
  zoom: number;
  flyToCoord?: [number, number] | null;
  onUserPan?: () => void;
}> = ({ onMapReady, center, zoom, flyToCoord, onUserPan }) => {
  const map = useMap();
  const initialViewSetRef = useRef(false);

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!initialViewSetRef.current) {
      const safeCenter: [number, number] = (center && isValidCoordinate(center[0], center[1]))
        ? center
        : DEFAULT_MAP_CENTER;
      try {
        map.setView(safeCenter, zoom);
      } catch (err) {
        console.warn('[MapBridge] setView failed:', err);
      }
      initialViewSetRef.current = true;
    }
  }, [center, zoom, map]);

  useEffect(() => {
    if (flyToCoord && isValidCoordinate(flyToCoord[0], flyToCoord[1])) {
      try {
        map.flyTo(flyToCoord, 12, { duration: 1.5 });
      } catch (err) {
        console.warn('[MapBridge] flyTo failed:', err);
      }
    }
  }, [flyToCoord, map]);

  useEffect(() => {
    if (!onUserPan) return;
    const handleDragStart = () => {
      onUserPan();
    };
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, onUserPan]);

  return null;
};

// Map click handler
const MapClickHandler: React.FC<{
  onMapClick?: (lat: number, lng: number) => void;
}> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
};

const MapZoomWatcher: React.FC<{ onZoom: (z: number) => void }> = ({ onZoom }) => {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    const handler = () => onZoom(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoom]);
  return null;
};

// Clean Leaflet marker creation
const createDivIcon = (color: string, emoji: string, size = 30, pulse = false) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        position: relative;
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${Math.floor(size * 0.52)}px;
        color: white;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      ">
        ${pulse ? `<span style="
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid ${color};
          animation: pulse-ring 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        "></span>` : ''}
        <span>${emoji}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const originIcon = createDivIcon('#10b981', '🟢', 32, true);
const destIcon = createDivIcon('#ef4444', '🏁', 32, true);
const gpsIcon = createDivIcon('#0284c7', '🧭', 28, true);

const getModeDivIcon = (mode: TravelMode, heading?: number | null) => {
  const iconEmojiMap: Record<TravelMode, string> = {
    car: '🚗',
    truck: '🚛',
    walking: '🚶',
    bicycle: '🚲',
    train: '🚆',
    flight: '✈️'
  };
  const colorMap: Record<TravelMode, string> = {
    car: '#0284c7',
    truck: '#0284c7',
    walking: '#10b981',
    bicycle: '#0d9488',
    train: '#8b5cf6',
    flight: '#ec4899'
  };
  const emoji = iconEmojiMap[mode] || '🧭';
  const color = colorMap[mode] || '#0284c7';
  const rotation = heading !== null && heading !== undefined ? `transform: rotate(${heading}deg);` : '';

  return L.divIcon({
    className: 'custom-gps-icon',
    html: `
      <div style="
        position: relative;
        background-color: ${color};
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: white;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 14px rgba(0,0,0,0.6);
        ${rotation}
      ">
        <span style="
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid ${color};
          animation: pulse-ring 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        "></span>
        <span>${emoji}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const hubIcon = createDivIcon('#0284c7', '📦', 28);
const coldWhIcon = createDivIcon('#0d9488', '❄️', 26);
const standardWhIcon = createDivIcon('#475569', '🏬', 24);
const criticalIncidentIcon = createDivIcon('#dc2626', '⚠️', 34, true);
const highIncidentIcon = createDivIcon('#ea580c', '⚠️', 30, true);
const moderateIncidentIcon = createDivIcon('#f59e0b', '⚠️', 26);
const sachetAlertIcon = createDivIcon('#dc2626', '🛡️', 32, true);
const userDisasterIcon = createDivIcon('#ea580c', '⚠️', 30, true);
const userApprovedDisasterIcon = createDivIcon('#059669', '📢', 30, true);
const userCorroboratedDisasterIcon = createDivIcon('#0284c7', '🛡️', 30, false);
const userPendingDisasterIcon = createDivIcon('#d97706', '📝', 28, false);
const pickMarkerIcon = createDivIcon('#f59e0b', '📍', 34, true);
const weatherIcon = createDivIcon('#0ea5e9', '⛅', 28);
const districtIcon = (score: number) => {
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
  return createDivIcon(color, '📍', 22);
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getClosestPointOnPolyline = (lat: number, lng: number, polyline: [number, number][]): { closestPoint: [number, number]; distanceMeters: number } => {
  if (!polyline || polyline.length === 0) return { closestPoint: [lat, lng], distanceMeters: 999999 };
  let minDistanceMeters = Infinity;
  let bestPoint: [number, number] = [lat, lng];

  for (let i = 0; i < polyline.length; i++) {
    const pt = polyline[i];
    const distM = haversineKm(lat, lng, pt[0], pt[1]) * 1000;
    if (distM < minDistanceMeters) {
      minDistanceMeters = distM;
      bestPoint = pt;
    }
  }
  return { closestPoint: bestPoint, distanceMeters: minDistanceMeters };
};

export interface MapCandidateRoute {
  strategy: 'fastest' | 'cheapest' | 'safest' | 'reliable' | string;
  name?: string;
  distance_km: number;
  eta_formatted: string;
  total_cost_inr?: number;
  risk_score: number;
  hazards_on_route?: number;
  geometry_coordinates: number[][]; // [lon, lat]
  color?: string;
}

export interface MapViewProps {
  districts?: DistrictData[];
  hubs?: LogisticsHubData[];
  warehouses?: WarehouseData[];
  incidents?: IncidentData[];
  disasters?: DisasterAlertData[];
  userDisasters?: UserDisasterReport[];
  roads?: RoadData[];
  routes?: {
    fastest?: MapCandidateRoute;
    cheapest?: MapCandidateRoute;
    safest?: MapCandidateRoute;
    reliable?: MapCandidateRoute;
    [key: string]: any;
  };
  activeRouteWaypoints?: { lat: number; lng: number; name?: string }[];
  selectedStrategy?: string;
  onSelectStrategy?: (strategy: string) => void;
  origin?: { lat: number; lng: number; name?: string } | null;
  destination?: { lat: number; lng: number; name?: string } | null;
  weather?: {
    lat: number;
    lon: number;
    temperature_c?: number;
    condition_text?: string;
    wind_speed_kmh?: number;
    visibility_km?: number;
    source?: string;
  } | null;
  center?: [number, number];
  zoom?: number;
  height?: string;
  loading?: boolean;
  error?: string | null;
  onDistrictSelect?: (district: DistrictData) => void;
  onLocationClick?: (lat: number, lng: number) => void;
  travelMode?: string;
  onReportDisasterClick?: () => void;
  isPickingOnMap?: boolean;
  pickingCoordinates?: { lat: number; lng: number } | null;
  pickingRadiusKm?: number;
  onGpsTelemetryUpdate?: (telemetry: {
    speedKmh: number | null;
    speedSource: 'LIVE GPS' | 'CALCULATED FROM GPS' | 'SIMULATED' | 'UNAVAILABLE';
    headingDeg: number | null;
    accuracyMeters: number | null;
    lat: number;
    lng: number;
    isOffRoute: boolean;
    offRouteDistanceMeters: number;
  }) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  districts = [],
  hubs = [],
  warehouses = [],
  incidents = [],
  disasters = [],
  userDisasters = [],
  roads = [],
  routes,
  activeRouteWaypoints = [],
  selectedStrategy = 'fastest',
  onSelectStrategy,
  origin,
  destination,
  weather,
  center = [26.2006, 92.9376],
  zoom = 7,
  height = '580px',
  loading = false,
  error = null,
  onDistrictSelect,
  onLocationClick,
  travelMode = 'truck',
  onReportDisasterClick,
  isPickingOnMap = false,
  pickingCoordinates = null,
  pickingRadiusKm = 8,
  onGpsTelemetryUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Guaranteed safe center that NEVER passes [undefined, undefined] or [NaN, NaN] to Leaflet
  const safeMapCenter: [number, number] = React.useMemo(() => {
    if (center && isValidCoordinate(center[0], center[1])) return center;
    if (origin && isValidCoordinate(origin.lat, origin.lng)) return [origin.lat, origin.lng];
    if (destination && isValidCoordinate(destination.lat, destination.lng)) return [destination.lat, destination.lng];
    return DEFAULT_MAP_CENTER;
  }, [center, origin, destination]);

  // A. Map Style
  const [basemap, setBasemap] = useState<'dark' | 'standard' | 'satellite' | 'terrain'>('standard');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [providerLabel, setProviderLabel] = useState('OpenStreetMap');
  const googleMapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
  const mapProvider: 'google' | 'osm' = googleMapsKey && String(googleMapsKey).length > 10 ? 'google' : 'osm';
  const [googleFailed, setGoogleFailed] = useState(false);
  const useGoogle = mapProvider === 'google' && !googleFailed;

  // B. Map Layers Panel
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({
    districts: true,
    hubs: true,
    railheads: false, // honest 'Data unavailable'
    warehouses: true,
    incidents: true, // administrative closures
    sachetAlerts: true,
    userReports: true,
    disasterZones: true,
    weather: true,
    routes: true,
    altRoutes: true,
    gpsVehicle: true,
  });
  const [mapBearing, setMapBearing] = useState(0);
  const [clusterAtLowZoom, setClusterAtLowZoom] = useState(true);
  const [mapZoomLevel, setMapZoomLevel] = useState(7);

  // H. Route Options Modal
  const [showRouteOptions, setShowRouteOptions] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<[number, number] | null>(null);

  // G. Live GPS Telemetry from Unified GPSContext
  const { gps, startTracking, stopTracking, selectedTravelMode: contextTravelMode } = useGPS();
  const effectiveTravelMode: TravelMode = (travelMode as TravelMode) || contextTravelMode || 'truck';
  const [gpsLocation, setGpsLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    speed?: number | null;
    heading?: number | null;
    timestamp: number;
  } | null>(null);
  const [isFollowMode, setIsFollowMode] = useState<boolean>(true);

  // Follow mode: smoothly pan map to live GPS without forcibly resetting zoom or bearing
  useEffect(() => {
    if (!isFollowMode || !mapInstance || !gpsLocation) return;
    if (isValidCoordinate(gpsLocation.lat, gpsLocation.lng)) {
      try {
        mapInstance.panTo([gpsLocation.lat, gpsLocation.lng], { animate: true, duration: 0.5 });
      } catch (err) {
        console.warn('[MapView] panTo failed:', err);
      }
    }
  }, [isFollowMode, mapInstance, gpsLocation?.lat, gpsLocation?.lng]);

  // Handle Fullscreen
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        mapInstance?.invalidateSize();
      }, 250);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [mapInstance]);

  // Handle Zoom In / Zoom Out
  const handleZoomIn = () => {
    mapInstance?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstance?.zoomOut();
  };

  const handleRecenter = () => {
    setIsFollowMode(true);
    if (!mapInstance) return;
    if (gpsLocation && isValidCoordinate(gpsLocation.lat, gpsLocation.lng)) {
      try {
        if (mapInstance.getZoom() < 13) {
          mapInstance.flyTo([gpsLocation.lat, gpsLocation.lng], 15, { duration: 0.6 });
        } else {
          mapInstance.panTo([gpsLocation.lat, gpsLocation.lng], { animate: true, duration: 0.5 });
        }
      } catch (err) {
        console.warn('[MapView] recenter GPS failed:', err);
      }
      return;
    }
    if (origin && isValidCoordinate(origin.lat, origin.lng)) {
      try {
        mapInstance.flyTo([origin.lat, origin.lng], 11, { duration: 0.8 });
      } catch (err) {
        console.warn('[MapView] recenter origin failed:', err);
      }
      return;
    }
    if (destination && isValidCoordinate(destination.lat, destination.lng)) {
      try {
        mapInstance.flyTo([destination.lat, destination.lng], 11, { duration: 0.8 });
      } catch (err) {
        console.warn('[MapView] recenter destination failed:', err);
      }
    }
  };

  const handleResetCompass = () => {
    if (!mapInstance) return;
    setMapBearing(0);
    // Leaflet default has no rotate unless plugin — reset view north-up
    mapInstance.setView(mapInstance.getCenter(), mapInstance.getZoom());
  };

  const handleFitRoute = () => {
    if (!mapInstance) return;
    const currentRoute = routes?.[selectedStrategy];
    const coords = currentRoute?.geometry_coordinates;
    const validLatLngs = cleanPolylineCoords(coords);
    if (validLatLngs.length > 1) {
      try {
        mapInstance.fitBounds(L.latLngBounds(validLatLngs), { padding: [48, 48], maxZoom: 12 });
        return;
      } catch (err) {
        console.warn('[MapView] fitBounds route failed:', err);
      }
    }
    const hasOrigin = origin && isValidCoordinate(origin.lat, origin.lng);
    const hasDest = destination && isValidCoordinate(destination.lat, destination.lng);
    if (hasOrigin && hasDest) {
      try {
        mapInstance.fitBounds(L.latLngBounds([[origin.lat, origin.lng], [destination.lat, destination.lng]]), { padding: [48, 48] });
      } catch (err) {
        console.warn('[MapView] fitBounds origin-dest failed:', err);
      }
    }
  };

  const handleFitHazards = () => {
    if (!mapInstance) return;
    const pts: [number, number][] = [];
    (disasters || []).forEach((al) => {
      const geom = normalizeDisasterGeometry(al);
      if (geom.hasValidLocation && isValidCoordinate(geom.latitude, geom.longitude)) {
        pts.push([geom.latitude!, geom.longitude!]);
      }
    });
    (userDisasters || []).forEach((u) => {
      if (isValidCoordinate(u.latitude, u.longitude)) pts.push([u.latitude, u.longitude]);
    });
    (incidents || []).forEach((inc) => {
      if (isValidCoordinate(inc.latitude, inc.longitude)) pts.push([inc.latitude, inc.longitude]);
    });
    if (pts.length === 0) return;
    try {
      mapInstance.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 11 });
    } catch (err) {
      console.warn('[MapView] fitHazards failed:', err);
    }
  };

  // E. Locate Me / Real GPS toggle via GPSContext
  const handleRequestGps = useCallback(() => {
    if (gps.isTracking) {
      stopTracking();
    } else {
      startTracking();
      if (isValidCoordinate(gps.latitude, gps.longitude)) {
        setFlyToTarget([Number(gps.latitude), Number(gps.longitude)]);
      }
    }
  }, [gps.isTracking, gps.latitude, gps.longitude, startTracking, stopTracking]);

  // Synchronize GPSContext state into local map marker & calculate snapping / off-route
  useEffect(() => {
    if (!gps.isTracking || !isValidCoordinate(gps.latitude, gps.longitude)) {
      if (!gps.isTracking) {
        setGpsLocation(null);
      }
      return;
    }

    const latitude = Number(gps.latitude);
    const longitude = Number(gps.longitude);
    const accuracy = gps.accuracy ?? 10;
    const heading = gps.heading;
    const speedVal = gps.currentSpeedKmh;
    const speedSrc = gps.speedSource;

    let displayLat = latitude;
    let displayLng = longitude;
    let isOffRoute = false;
    let offRouteDistM = 0;

    const currentRoute = routes?.[selectedStrategy];
    const isRoadMode = effectiveTravelMode === 'car' || effectiveTravelMode === 'truck';
    const isPedestrianBike = effectiveTravelMode === 'walking' || effectiveTravelMode === 'bicycle';

    if (currentRoute?.geometry_coordinates && currentRoute.geometry_coordinates.length > 1) {
      const polyPositions = cleanPolylineCoords(currentRoute.geometry_coordinates);
      if (polyPositions.length > 1) {
        const snap = getClosestPointOnPolyline(latitude, longitude, polyPositions);
        offRouteDistM = snap.distanceMeters;

        const snapThreshold = isRoadMode ? 35 : (isPedestrianBike ? 15 : 0);
        const offRouteThreshold = effectiveTravelMode === 'walking'
          ? 30
          : effectiveTravelMode === 'bicycle'
            ? 40
            : isRoadMode
              ? 80
              : 999999;

        if (snapThreshold > 0 && snap.distanceMeters <= snapThreshold && isValidCoordinate(snap.closestPoint[0], snap.closestPoint[1])) {
          displayLat = snap.closestPoint[0];
          displayLng = snap.closestPoint[1];
        }

        if (snap.distanceMeters > offRouteThreshold) {
          isOffRoute = true;
        }
      }
    }

    if (isValidCoordinate(displayLat, displayLng)) {
      setGpsLocation({
        lat: displayLat,
        lng: displayLng,
        accuracy,
        speed: speedVal,
        heading: heading || null,
        timestamp: gps.timestamp || Date.now(),
      });
    }

    if (onGpsTelemetryUpdate && isValidCoordinate(displayLat, displayLng)) {
      onGpsTelemetryUpdate({
        speedKmh: speedVal,
        speedSource: (speedSrc === 'STATIONARY' ? 'LIVE GPS' : (speedSrc as any)),
        headingDeg: heading || null,
        accuracyMeters: accuracy,
        lat: displayLat,
        lng: displayLng,
        isOffRoute,
        offRouteDistanceMeters: offRouteDistM,
      });
    }
  }, [
    gps.isTracking,
    gps.latitude,
    gps.longitude,
    gps.accuracy,
    gps.heading,
    gps.currentSpeedKmh,
    gps.speedSource,
    gps.timestamp,
    routes,
    selectedStrategy,
    onGpsTelemetryUpdate,
    effectiveTravelMode
  ]);

  // Search geocoder
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchLocations(searchQuery, 5);
        setSearchResults(results);
      } catch (err) {
        // silent
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const parsePolyline = (coords: number[][]): [number, number][] => {
    if (!coords || !Array.isArray(coords)) return [];
    return coords.map((c) => [c[1], c[0]]);
  };

  // Basemap Tile Providers — Google only when key configured; otherwise honest OSM/Esri
  useEffect(() => {
    if (useGoogle) setProviderLabel('Google Maps');
    else if (basemap === 'satellite') setProviderLabel('Satellite');
    else if (basemap === 'terrain') setProviderLabel('Terrain');
    else setProviderLabel('OpenStreetMap');
  }, [basemap, useGoogle]);

  const getTileConfig = () => {
    switch (basemap) {
      case 'satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
          className: '',
        };
      case 'terrain':
        return {
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap',
          className: '',
        };
      case 'dark':
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          className: 'osm-dark-tiles',
        };
      case 'standard':
      default:
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          className: 'osm-standard-tiles',
        };
    }
  };

  const tileConfig = getTileConfig();
  const fallbackWaypoints: [number, number][] = activeRouteWaypoints.map((w) => [w.lat, w.lng]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col font-sans select-none ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none' : ''
      }`}
      style={{ height: isFullscreen ? '100vh' : height }}
    >
      {/* Pick on Map Active Status Banner */}
      {isPickingOnMap && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto bg-amber-500 text-slate-950 font-black px-4 py-2 rounded-xl shadow-2xl border-2 border-slate-950 flex items-center gap-2.5 text-xs uppercase tracking-wider animate-bounce">
          <MapPin className="w-4 h-4 text-slate-950 fill-current" />
          <span>CLICK ON MAP TO SELECT INCIDENT LOCATION</span>
          {pickingCoordinates && (
            <span className="font-mono text-[11px] bg-slate-950 text-amber-300 px-2 py-0.5 rounded font-bold normal-case">
              {pickingCoordinates.lat.toFixed(6)}, {pickingCoordinates.lng.toFixed(6)}
            </span>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TOP FLOATING SEARCH & CONTROLS TOOLBAR                                     */}
      {/* ========================================================================= */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Search Box */}
        <div className="relative pointer-events-auto w-72 max-w-[calc(100%-120px)] sm:w-80">
          <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-2xl">
            <Search className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Indian/global city or hub..."
              className="bg-transparent text-xs text-white placeholder-slate-400 outline-none w-full"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ×
              </button>
            )}
            {isSearching && <RefreshCw className="w-3 h-3 text-sky-400 animate-spin shrink-0" />}
          </div>

          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto z-50">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setFlyToTarget([item.latitude, item.longitude]);
                    setSearchQuery(item.display_name.split(',')[0]);
                    setSearchResults([]);
                  }}
                  className="px-3 py-2 text-xs text-slate-200 hover:bg-sky-950/60 hover:text-sky-300 cursor-pointer border-b border-slate-800/60 last:border-0"
                >
                  <div className="font-semibold">{item.display_name.split(',')[0]}</div>
                  <div className="text-[10px] text-slate-400 truncate">{item.display_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top-Right Quick Action Group */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Disaster Report Trigger */}
          {onReportDisasterClick && (
            <button
              onClick={onReportDisasterClick}
              title="Report Ground Disaster / Hazard"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                isPickingOnMap
                  ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                  : 'bg-gradient-to-r from-red-600/90 to-amber-600/90 hover:from-red-500 hover:to-amber-500 text-white border-red-500/50'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">{isPickingOnMap ? 'Click on Map...' : '+ Report Disaster'}</span>
              <span className="sm:hidden">{isPickingOnMap ? 'Picking' : '+ Report'}</span>
            </button>
          )}

          {/* A. Map Style Trigger Button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowStyleMenu(!showStyleMenu);
                setShowLayersPanel(false);
                setShowRouteOptions(false);
              }}
              title="Select Map Style"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                showStyleMenu
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Map Style</span>
            </button>

            {/* Floating Map Style Selector */}
            {showStyleMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-2 z-[1100] animate-in fade-in">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 font-mono">
                  SELECT MAP STYLE
                </div>
                <button
                  onClick={() => { setBasemap('standard'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    basemap === 'standard'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>Standard Map</span>
                  {basemap === 'standard' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setBasemap('satellite'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    basemap === 'satellite'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>Satellite Imagery</span>
                  {basemap === 'satellite' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setBasemap('terrain'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    basemap === 'terrain'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>Terrain</span>
                  {basemap === 'terrain' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setBasemap('dark'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    basemap === 'dark'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>Dark (readable)</span>
                  {basemap === 'dark' && <Check className="w-3.5 h-3.5" />}
                </button>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                  Provider: {providerLabel}
                  {useGoogle ? ' (Google Maps JS)' : ' · OSM fallback'}
                </div>
              </div>
            )}
          </div>

          {/* B. Map Layers Trigger Button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLayersPanel(!showLayersPanel);
                setShowStyleMenu(false);
                setShowRouteOptions(false);
              }}
              title="GIS Active Layers"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                showLayersPanel
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Layers</span>
            </button>

            {/* Floating GIS Layer Panel */}
            {showLayersPanel && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-2 z-[1100] animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white flex items-center gap-1.5 font-mono uppercase text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    GIS Intelligence Layers
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Live DB</span>
                </div>

                {/* 1. Districts & Accessibility */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.districts}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, districts: e.target.checked }))}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Districts & Accessibility</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                    {districts.length > 0 ? `${districts.length}` : 'Live'}
                  </span>
                </label>

                {/* 2. Logistics Hubs */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.hubs}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, hubs: e.target.checked }))}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Logistics Hubs</span>
                  </div>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800">
                    {hubs.length}
                  </span>
                </label>

                {/* 3. Railheads */}
                <div className="flex items-center justify-between p-1.5 rounded-lg opacity-60 text-slate-400">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled
                      checked={false}
                      className="rounded border-slate-700 text-slate-500"
                    />
                    <span>Railheads</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                    Data unavailable
                  </span>
                </div>

                {/* 4. Cold Storage & Warehouses */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.warehouses}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, warehouses: e.target.checked }))}
                      className="rounded border-slate-700 text-teal-500 focus:ring-0"
                    />
                    <span>Cold Storage & Warehouses</span>
                  </div>
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800">
                    {warehouses.length}
                  </span>
                </label>

                {/* 5. Official SACHET */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.sachetAlerts}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, sachetAlerts: e.target.checked }))}
                      className="rounded border-slate-700 text-red-500 focus:ring-0"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                      <span>Official SACHET Alerts</span>
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                    {disasters?.length || 0}
                  </span>
                </label>

                {/* 5b. User reports */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.userReports}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, userReports: e.target.checked }))}
                      className="rounded border-slate-700 text-orange-500 focus:ring-0"
                    />
                    <span>User-Reported Disasters</span>
                  </div>
                  <span className="text-[10px] font-mono text-orange-400 bg-orange-950/60 px-1.5 py-0.5 rounded border border-orange-800">
                    {userDisasters?.length || 0}
                  </span>
                </label>

                {/* 5c. Administrative closures */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.incidents}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, incidents: e.target.checked }))}
                      className="rounded border-slate-700 text-red-500 focus:ring-0"
                    />
                    <span>Road Closures (Admin)</span>
                  </div>
                  <span className="text-[10px] font-mono text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800">
                    {incidents?.length || 0}
                  </span>
                </label>

                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={clusterAtLowZoom}
                      onChange={(e) => setClusterAtLowZoom(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Cluster markers (low zoom)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">z&lt;9</span>
                </label>

                {/* 6. Disaster Vulnerability Zones */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.disasterZones}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, disasterZones: e.target.checked }))}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>Disaster Vulnerability Zones</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                    Buffer
                  </span>
                </label>

                {/* 7. Weather Overlay */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.weather}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, weather: e.target.checked }))}
                      className="rounded border-slate-700 text-sky-400 focus:ring-0"
                    />
                    <span>Weather Overlay</span>
                  </div>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800">
                    {weather ? `${weather.temperature_c}°C` : 'Live'}
                  </span>
                </label>

                {/* 8. Selected Route */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.routes}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, routes: e.target.checked }))}
                      className="rounded border-slate-700 text-sky-400 focus:ring-0"
                    />
                    <span>Selected Route (OSRM)</span>
                  </div>
                  <span className="text-[10px] font-mono text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800 uppercase">
                    {selectedStrategy}
                  </span>
                </label>

                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.altRoutes}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, altRoutes: e.target.checked }))}
                      className="rounded border-slate-700 text-slate-400 focus:ring-0"
                    />
                    <span>Alternative Routes</span>
                  </div>
                </label>

                {/* 9. Live GPS Vehicle */}
                <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layerVisibility.gpsVehicle}
                      onChange={(e) => setLayerVisibility(v => ({ ...v, gpsVehicle: e.target.checked }))}
                      className="rounded border-slate-700 text-emerald-400 focus:ring-0"
                    />
                    <span>Live GPS Vehicle</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                    {gpsLocation ? 'Active' : 'Standby'}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* H. Route Options Button (if routes present) */}
          {routes && Object.keys(routes).length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowRouteOptions(!showRouteOptions);
                  setShowStyleMenu(false);
                  setShowLayersPanel(false);
                }}
                title="Route Strategy Options"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                  showRouteOptions
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline capitalize">{selectedStrategy}</span>
              </button>

              {showRouteOptions && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-1.5 z-[1100] animate-in fade-in">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 font-mono">
                    ROUTE ALTERNATIVES
                  </div>
                  {['fastest', 'cheapest', 'safest', 'reliable'].map((strat) => {
                    const r = routes[strat];
                    if (!r) return null;
                    return (
                      <button
                        key={strat}
                        onClick={() => {
                          onSelectStrategy && onSelectStrategy(strat);
                          setShowRouteOptions(false);
                        }}
                        className={`w-full text-left p-2 rounded-xl transition-all border ${
                          selectedStrategy === strat
                            ? 'bg-sky-950 border-sky-500/80 text-white'
                            : 'border-transparent text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold capitalize">{strat}</span>
                          <span className="font-mono text-sky-400">{r.eta_formatted}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.distance_km} km | Risk: {r.risk_score}/100
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* F. Fullscreen Toggle */}
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-2 rounded-xl backdrop-blur-md border shadow-xl bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM-RIGHT FLOATING CONTROLS (Google Maps Style Stack)                 */}
      {/* ========================================================================= */}
      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col items-center gap-2 pointer-events-auto">
        <button
          onClick={handleFitRoute}
          title="Fit route to screen"
          className="p-2.5 rounded-xl backdrop-blur-md border shadow-2xl bg-slate-900/90 text-sky-300 border-slate-700/80 hover:bg-slate-800"
        >
          <Route className="w-4 h-4" />
        </button>
        <button
          onClick={handleFitHazards}
          title="Fit hazards to screen"
          className="p-2.5 rounded-xl backdrop-blur-md border shadow-2xl bg-slate-900/90 text-amber-300 border-slate-700/80 hover:bg-slate-800"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
        <button
          onClick={handleRecenter}
          title="Recenter"
          className="p-2.5 rounded-xl backdrop-blur-md border shadow-2xl bg-slate-900/90 text-emerald-300 border-slate-700/80 hover:bg-slate-800"
        >
          <Locate className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetCompass}
          title="Compass / North up"
          className="p-2.5 rounded-xl backdrop-blur-md border shadow-2xl bg-slate-900/90 text-teal-300 border-slate-700/80 hover:bg-slate-800"
        >
          <Compass className="w-4 h-4" style={{ transform: `rotate(${-mapBearing}deg)` }} />
        </button>
        {/* E. Locate Me Button */}
        <button
          onClick={handleRequestGps}
          title="Locate Me (Current GPS)"
          className={`p-2.5 rounded-xl backdrop-blur-md border shadow-2xl transition-all ${
            gps.isTracking
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
              : 'bg-slate-900/90 text-sky-400 border-slate-700/80 hover:bg-slate-800 hover:text-sky-300'
          }`}
        >
          <Crosshair className={`w-4 h-4 ${gps.isTracking && !gpsLocation ? 'animate-spin' : ''}`} />
        </button>

        {/* C & D. Zoom Controls (+ / -) */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden divide-y divide-slate-800">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Recenter Button when panned away from GPS */}
      {!isFollowMode && gpsLocation && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1001] bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black px-4 py-2 rounded-full shadow-2xl border-2 border-slate-950 flex items-center gap-2 text-xs uppercase tracking-wider transition-all pointer-events-auto cursor-pointer animate-in fade-in"
        >
          <Locate className="w-4 h-4 text-slate-950 stroke-[2.5]" />
          <span>RECENTER</span>
        </button>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM-LEFT LIVE GPS VEHICLE HUD STATUS PILL                              */}
      {/* ========================================================================= */}
      {gpsLocation && layerVisibility.gpsVehicle && (
        <div className="absolute bottom-4 left-3 z-[1000] bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-emerald-500/60 text-xs shadow-2xl space-y-0.5 pointer-events-auto animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold text-white uppercase tracking-wider text-[10px] font-mono">{effectiveTravelMode} Live GPS</span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">
              {gps.speedSource === 'STATIONARY' || gpsLocation.speed === 0
                ? '0 km/h (Stationary)'
                : gpsLocation.speed !== null && gpsLocation.speed !== undefined && gpsLocation.speed > 0
                  ? `${gpsLocation.speed} km/h`
                  : gps.gpsStatus === 'ACQUIRING'
                    ? '-- (Acquiring)'
                    : '0 km/h (Stationary)'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
            <span>{gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}</span>
            <span>±{Math.round(gpsLocation.accuracy)}m</span>
            {gpsLocation.heading !== null && <span>Heading: {Math.round(gpsLocation.heading)}°</span>}
          </div>
        </div>
      )}

      {/* BOTTOM DATA SOURCE INTEGRITY BADGES — keep clear of right control stack */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] hidden md:flex items-center gap-2 pointer-events-auto bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-[10px] font-mono shadow-2xl text-slate-300 max-w-[min(90vw,640px)] overflow-x-auto">
        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
          <Radio className="w-3 h-3" />
          {gps.isTracking ? 'LIVE GPS' : 'GPS STANDBY'}
        </span>
        <span className="text-slate-600">•</span>
        <span className="text-violet-300">MAP: {providerLabel}</span>
        <span className="text-slate-600">•</span>
        <span className="text-sky-400">WEATHER: OPEN-METEO</span>
        <span className="text-slate-600">•</span>
        <span className="text-red-400">ALERTS: NDMA SACHET / CITIZEN</span>
        <span className="text-slate-600">•</span>
        <span className="text-cyan-400">ROUTING: OSRM</span>
        {clusterAtLowZoom && mapZoomLevel < 9 && (
          <>
            <span className="text-slate-600">•</span>
            <span className="text-amber-300">CLUSTER ON (z{mapZoomLevel})</span>
          </>
        )}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1100] bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <span className="text-sm font-bold text-slate-200 tracking-wide">
            Calculating OSRM Geometry & Intersecting Hazards...
          </span>
        </div>
      )}

      {/* Error Banner */}
      {error && !loading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-red-950/95 border border-red-500/60 p-3 rounded-xl text-xs text-red-200 flex items-center gap-2 shadow-2xl">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* MAP: Google Maps when key configured; otherwise Leaflet + OSM (never claim OSM is Google) */}
      {useGoogle ? (
        <GoogleMapPane
          apiKey={String(googleMapsKey)}
          center={center}
          zoom={zoom}
          height="100%"
          mapTypeId={basemap === 'satellite' ? 'satellite' : basemap === 'terrain' ? 'terrain' : 'roadmap'}
          origin={origin}
          destination={destination}
          routeCoordinates={routes?.[selectedStrategy]?.geometry_coordinates || []}
          onMapClick={onLocationClick}
          onUnavailable={(reason) => {
            setGoogleFailed(true);
            setProviderLabel('OpenStreetMap');
            console.warn('[NEXORA] Google Maps unavailable, using OSM:', reason);
          }}
        />
      ) : (
      <MapContainer
        center={safeMapCenter}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        className="w-full h-full"
      >
        <MapBridge
          onMapReady={setMapInstance}
          center={safeMapCenter}
          zoom={zoom}
          flyToCoord={flyToTarget}
          onUserPan={() => setIsFollowMode(false)}
        />
        <MapClickHandler onMapClick={onLocationClick} />
        <MapZoomWatcher onZoom={setMapZoomLevel} />

        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          className={tileConfig.className}
        />

        {/* 9. Live GPS Multi-Modal Marker */}
        {layerVisibility.gpsVehicle && gpsLocation && isValidCoordinate(gpsLocation.lat, gpsLocation.lng) && (
          <>
            <Marker position={[gpsLocation.lat, gpsLocation.lng]} icon={getModeDivIcon(effectiveTravelMode, gpsLocation.heading)}>
              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-sky-400 flex items-center gap-1 uppercase">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{effectiveTravelMode} GPS Position</span>
                  </div>
                  <div>Accuracy: ±{Math.round(gpsLocation.accuracy)} meters</div>
                  <div>
                    Speed: {gps.speedSource === 'STATIONARY'
                      ? '0 km/h (Stationary)'
                      : gpsLocation.speed !== null && gpsLocation.speed !== undefined
                        ? `${gpsLocation.speed} km/h`
                        : '0 km/h (Stationary)'}
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Source: <strong className="text-white font-mono">{gps.speedSource}</strong>
                  </div>
                  {gpsLocation.heading !== null && <div>Heading: {Math.round(gpsLocation.heading)}°</div>}
                  <div className="text-[10px] text-slate-400">
                    Updated: {new Date(gpsLocation.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[gpsLocation.lat, gpsLocation.lng]}
              radius={gpsLocation.accuracy}
              pathOptions={{ color: '#0284c7', fillColor: '#0284c7', fillOpacity: 0.15, weight: 1 }}
            />
          </>
        )}

        {/* Origin Marker */}
        {origin && isValidCoordinate(origin.lat, origin.lng) && (
          <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1">
                  <span>🟢</span> Origin
                </div>
                <div className="font-medium text-white">{origin.name || 'Origin Location'}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destination && isValidCoordinate(destination.lat, destination.lng) && (
          <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-red-400 flex items-center gap-1">
                  <span>🏁</span> Destination
                </div>
                <div className="font-medium text-white">{destination.name || 'Destination Location'}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 8. Selected Route Polylines */}
        {layerVisibility.routes && routes && (
          <>
            {routes.safest && routes.safest.geometry_coordinates && (selectedStrategy === 'safest' || layerVisibility.altRoutes) && (
              <Polyline
                positions={parsePolyline(routes.safest.geometry_coordinates)}
                eventHandlers={{
                  click: () => onSelectStrategy && onSelectStrategy('safest'),
                }}
                pathOptions={{
                  color: '#14b8a6',
                  weight: selectedStrategy === 'safest' ? 6 : 3,
                  opacity: selectedStrategy === 'safest' ? 0.95 : 0.45,
                  dashArray: selectedStrategy === 'safest' ? undefined : '5, 8',
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-teal-400">Safest Bypass Route</div>
                    <div>Distance: {routes.safest.distance_km} km</div>
                    <div>Duration: {routes.safest.eta_formatted}</div>
                    <div>Risk Score: {routes.safest.risk_score}/100</div>
                    <div className="text-[10px] text-slate-400">
                      Hazards: {routes.safest.hazards_on_route || 0}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            )}

            {routes.cheapest && routes.cheapest.geometry_coordinates && (selectedStrategy === 'cheapest' || layerVisibility.altRoutes) && (
              <Polyline
                positions={parsePolyline(routes.cheapest.geometry_coordinates)}
                eventHandlers={{
                  click: () => onSelectStrategy && onSelectStrategy('cheapest'),
                }}
                pathOptions={{
                  color: '#10b981',
                  weight: selectedStrategy === 'cheapest' ? 6 : 3,
                  opacity: selectedStrategy === 'cheapest' ? 0.95 : 0.4,
                  dashArray: selectedStrategy === 'cheapest' ? undefined : '4, 8',
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-emerald-400">Cheapest Economy Route</div>
                    <div>Distance: {routes.cheapest.distance_km} km</div>
                    <div>Duration: {routes.cheapest.eta_formatted}</div>
                    <div>Est. Cost: ₹{routes.cheapest.total_cost_inr?.toLocaleString() || 'N/A'}</div>
                  </div>
                </Popup>
              </Polyline>
            )}

            {routes.reliable && routes.reliable.geometry_coordinates && (selectedStrategy === 'reliable' || layerVisibility.altRoutes) && (
              <Polyline
                positions={parsePolyline(routes.reliable.geometry_coordinates)}
                eventHandlers={{
                  click: () => onSelectStrategy && onSelectStrategy('reliable'),
                }}
                pathOptions={{
                  color: '#f59e0b',
                  weight: selectedStrategy === 'reliable' ? 6 : 3,
                  opacity: selectedStrategy === 'reliable' ? 0.95 : 0.4,
                  dashArray: selectedStrategy === 'reliable' ? undefined : '5, 8',
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-amber-400">Balanced / Reliable Route</div>
                    <div>Distance: {routes.reliable.distance_km} km</div>
                    <div>Duration: {routes.reliable.eta_formatted}</div>
                    <div>Risk Score: {routes.reliable.risk_score}/100</div>
                  </div>
                </Popup>
              </Polyline>
            )}

            {routes.fastest && routes.fastest.geometry_coordinates && (selectedStrategy === 'fastest' || layerVisibility.altRoutes) && (
              <Polyline
                positions={parsePolyline(routes.fastest.geometry_coordinates)}
                eventHandlers={{
                  click: () => onSelectStrategy && onSelectStrategy('fastest'),
                }}
                pathOptions={{
                  color: '#38bdf8',
                  weight: selectedStrategy === 'fastest' ? 6 : 3,
                  opacity: selectedStrategy === 'fastest' ? 0.95 : 0.45,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-sky-400">Fastest Primary Route</div>
                    <div>Distance: {routes.fastest.distance_km} km</div>
                    <div>Duration: {routes.fastest.eta_formatted}</div>
                    <div>Risk Score: {routes.fastest.risk_score}/100</div>
                    <div>Hazards on path: {routes.fastest.hazards_on_route || 0}</div>
                  </div>
                </Popup>
              </Polyline>
            )}
          </>
        )}

        {layerVisibility.routes && (!routes || Object.keys(routes).length === 0) && fallbackWaypoints.length > 1 && (
          <Polyline
            positions={fallbackWaypoints}
            pathOptions={{ color: '#38bdf8', weight: 5, opacity: 0.9 }}
          />
        )}

        {/* 5. NDMA SACHET Verified Disasters — cluster at low zoom */}
        {layerVisibility.sachetAlerts && disasters && (() => {
          const points: { al: (typeof disasters)[0]; lat: number; lon: number; radiusMeters: number }[] = [];
          disasters.forEach((al) => {
            const geom = normalizeDisasterGeometry(al);
            if (geom.hasValidLocation && geom.latitude !== null && geom.longitude !== null) {
              points.push({ al, lat: geom.latitude, lon: geom.longitude, radiusMeters: geom.radiusMeters });
            }
          });
          const shouldCluster = clusterAtLowZoom && mapZoomLevel < 9 && points.length > 6;
          if (shouldCluster) {
            const cell = 0.8;
            const buckets = new Map<string, typeof points>();
            points.forEach((p) => {
              const key = `${Math.floor(p.lat / cell)}_${Math.floor(p.lon / cell)}`;
              if (!buckets.has(key)) buckets.set(key, []);
              buckets.get(key)!.push(p);
            });
            return Array.from(buckets.entries()).map(([key, group]) => {
              const clat = group.reduce((s, g) => s + g.lat, 0) / group.length;
              const clon = group.reduce((s, g) => s + g.lon, 0) / group.length;
              if (group.length === 1) {
                return (
                  <DisasterMarkerLeaflet
                    key={`sachet-single-${group[0].al.id || group[0].al.identifier}`}
                    alert={group[0].al}
                    showZone={layerVisibility.disasterZones}
                  />
                );
              }
              const clusterIcon = L.divIcon({
                className: 'nexora-disaster-cluster-icon',
                html: `<div style="background:radial-gradient(circle, #ea580c 0%, #b91c1c 80%);color:#fff;border:2px solid #fef08a;border-radius:999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font:800 12px monospace;box-shadow:0 4px 12px rgba(0,0,0,0.6);">${group.length}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
              });
              return (
                <Marker
                  key={`cluster-${key}`}
                  position={[clat, clon]}
                  icon={clusterIcon}
                  eventHandlers={{ click: () => mapInstance?.setView([clat, clon], Math.min(14, mapZoomLevel + 2)) }}
                >
                  <Popup>
                    <div className="text-xs text-white font-bold">{group.length} official SACHET alerts</div>
                    <div className="text-[10px] text-slate-300">Click to zoom in for individual markers</div>
                  </Popup>
                </Marker>
              );
            });
          }
          return points.map(({ al }) => (
            <DisasterMarkerLeaflet
              key={`sachet-${al.id || al.identifier}`}
              alert={al}
              showZone={layerVisibility.disasterZones}
            />
          ));
        })()}

        {/* 6. User-Reported Citizen / Operator Ground Disasters Layer */}
        {layerVisibility.userReports && userDisasters && userDisasters.map((rep) => {
          if (!rep.latitude || !rep.longitude) return null;
          const radiusMeters = (rep.radiusKm || rep.radius_km || 5) * 1000;
          const isCritical = rep.severity?.toUpperCase() === 'CRITICAL';
          const vStatus = (rep.verification_status || 'AI_REVIEW').toUpperCase();
          const rawStatus = (rep.status || 'PENDING').toUpperCase();

          const isSachetCorroborated = vStatus === 'SACHET_CORROBORATED' || rawStatus === 'CORROBORATED';
          const isApproved = vStatus === 'AI_SUPPORTED' || vStatus === 'AI_VERIFIED' || (['APPROVED', 'VERIFIED', 'ACTIVE'].includes(rawStatus) && !['AI_REJECTED', 'AI_UNSUPPORTED', 'AI_REVIEW', 'SACHET_CORROBORATED'].includes(vStatus));
          const isRejected = vStatus === 'AI_REJECTED' || vStatus === 'AI_UNSUPPORTED' || rawStatus === 'REJECTED';
          const isPending = !isApproved && !isSachetCorroborated && !isRejected;

          // Exclude rejected reports from map
          if (isRejected) return null;

          const evUrl = rep.evidence_url || rep.image_url || rep.evidenceUrl;
          const confPct = Math.round(((rep.ai_confidence !== undefined ? rep.ai_confidence : rep.confidence) || 0.7) * 100);

          const markerIcon = isSachetCorroborated
            ? userCorroboratedDisasterIcon
            : isApproved
            ? userApprovedDisasterIcon
            : userPendingDisasterIcon;

          const badgeText = isSachetCorroborated
            ? 'OFFICIAL ALERT CORROBORATED'
            : isApproved
            ? 'AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)'
            : 'UNCONFIRMED CITIZEN REPORT';

          const badgeClass = isSachetCorroborated
            ? 'bg-sky-500 text-slate-950 font-bold'
            : isApproved
            ? 'bg-emerald-500 text-slate-950 font-bold'
            : 'bg-amber-500 text-slate-950 font-bold';

          return (
            <React.Fragment key={`user-rep-${rep.id}`}>
              <Marker
                position={[rep.latitude, rep.longitude]}
                icon={markerIcon}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 max-w-sm">
                    <div className="flex items-center justify-between">
                      <span className={`font-extrabold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-mono ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">{rep.severity}</span>
                    </div>
                    <div className="font-bold text-white text-sm">{rep.type || rep.disaster_type || rep.hazard_type} Hazard</div>
                    <div className="text-slate-200 font-medium text-xs">{rep.location_name}</div>
                    <p className="text-[11px] text-slate-300">{rep.description}</p>
                    
                    {/* AI Verification Metrics */}
                    <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">AI Confidence:</span>
                        <strong className={isApproved ? 'text-emerald-400' : isSachetCorroborated ? 'text-sky-400' : 'text-amber-400'}>{confPct}%</strong>
                      </div>
                      {rep.corroborated_sachet_identifier && (
                        <div className="text-[10px] text-sky-400 font-mono">
                          Corroborates NDMA SACHET: {rep.corroborated_sachet_identifier}
                        </div>
                      )}
                      {((rep.corroboration_count && rep.corroboration_count > 1) || (rep.unique_evidence_count && rep.unique_evidence_count > 0)) && (
                        <div className="text-[10px] text-sky-400 font-mono">
                          Corroborated by {rep.corroboration_count || 1} independent reports ({rep.unique_evidence_count || (evUrl ? 1 : 0)} unique photos)
                        </div>
                      )}
                      {rep.ai_reason && (
                        <div className="text-[10px] text-slate-400 leading-tight">
                          {rep.ai_reason.split('|')[0]}
                        </div>
                      )}
                    </div>

                    {/* Evidence Photo Preview */}
                    {evUrl ? (
                      <div className="pt-1">
                        <img
                          src={evUrl}
                          alt="Field Evidence"
                          className="w-full h-24 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-90"
                          onClick={() => window.open(evUrl, '_blank')}
                        />
                        <span className="text-[10px] text-sky-400 block mt-0.5 font-medium">Field Photo Evidence Attached</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 italic pt-0.5 font-mono">
                        No evidence photo provided
                      </div>
                    )}

                    {(rep.estimatedRoadImpact || rep.road_impact) && (
                      <div className="text-[11px] text-amber-200">
                        <strong>Road Impact:</strong> {rep.estimatedRoadImpact || rep.road_impact}
                      </div>
                    )}
                    <div className="pt-1 text-[10px] text-slate-400 font-mono border-t border-slate-800 flex items-center justify-between">
                      <span>Reported by: {rep.reportedBy || rep.reported_by || rep.reporter_name || 'Citizen'}</span>
                      <span>Radius: {rep.radiusKm || rep.radius_km || 5} km</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
              {layerVisibility.disasterZones && (
                <Circle
                  center={[rep.latitude, rep.longitude]}
                  radius={radiusMeters}
                  pathOptions={{
                    color: isSachetCorroborated ? '#0284c7' : isApproved ? (isCritical ? '#ea580c' : '#059669') : '#d97706',
                    fillColor: isSachetCorroborated ? '#0284c7' : isApproved ? (isCritical ? '#ea580c' : '#059669') : '#d97706',
                    fillOpacity: 0.14,
                    weight: isApproved || isSachetCorroborated ? 2 : 1.5,
                    dashArray: isApproved || isSachetCorroborated ? undefined : '5, 5',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Interactive Placement Mode (Preview Pin & Impact Buffer) */}
        {isPickingOnMap && pickingCoordinates && isValidCoordinate(pickingCoordinates.lat, pickingCoordinates.lng) && (
          <>
            <Marker position={[pickingCoordinates.lat, pickingCoordinates.lng]} icon={pickMarkerIcon}>
              <Popup>
                <div className="text-xs space-y-1 text-white">
                  <div className="font-bold text-amber-400">Selected Ground Coordinates</div>
                  <div>Lat: {pickingCoordinates.lat.toFixed(5)}</div>
                  <div>Lon: {pickingCoordinates.lng.toFixed(5)}</div>
                  <div>Radius Buffer: {pickingRadiusKm || 8} km</div>
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[pickingCoordinates.lat, pickingCoordinates.lng]}
              radius={(pickingRadiusKm || 8) * 1000}
              pathOptions={{
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.22,
                weight: 2,
                dashArray: '6, 6',
              }}
            />
          </>
        )}

        {/* Existing Incidents & Vulnerability Zones */}
        {layerVisibility.incidents &&
          incidents.map((inc) => {
            if (!isValidCoordinate(inc.latitude, inc.longitude)) return null;
            const isCritical = inc.severity?.toLowerCase() === 'critical';
            const isHigh = inc.severity?.toLowerCase() === 'high';
            const icon = isCritical ? criticalIncidentIcon : isHigh ? highIncidentIcon : moderateIncidentIcon;

            return (
              <React.Fragment key={inc.id || inc.title}>
                <Marker position={[inc.latitude, inc.longitude]} icon={icon}>
                  <Popup>
                    <div className="text-xs space-y-1 max-w-xs">
                      <div className="flex items-center gap-1.5 font-bold text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{inc.type} Incident</span>
                      </div>
                      <div className="font-semibold text-white">{inc.title}</div>
                      <p className="text-[11px] text-slate-300">{inc.description}</p>
                      <div className="pt-1 text-[10px] text-slate-400 font-mono">
                        Source: {(inc as any).source || 'SACHET NDMA'} | Severity: {inc.severity}
                      </div>
                    </div>
                  </Popup>
                </Marker>

                {layerVisibility.disasterZones && (
                  <Circle
                    center={[inc.latitude, inc.longitude]}
                    radius={isCritical ? 15000 : isHigh ? 10000 : 6000}
                    pathOptions={{
                      color: isCritical ? '#ef4444' : '#f59e0b',
                      fillColor: isCritical ? '#ef4444' : '#f59e0b',
                      fillOpacity: 0.15,
                      weight: 1,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

        {/* 7. Weather Overlay */}
        {layerVisibility.weather && weather && isValidCoordinate(weather.lat, weather.lon) && (
          <Marker position={[weather.lat, weather.lon]} icon={weatherIcon}>
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5" />
                  Midpoint Weather
                </div>
                <div>Condition: {weather.condition_text || 'Clear'}</div>
                <div>Temperature: {weather.temperature_c}°C</div>
                {weather.wind_speed_kmh !== undefined && <div>Wind: {weather.wind_speed_kmh} km/h</div>}
                {weather.visibility_km !== undefined && <div>Visibility: {weather.visibility_km} km</div>}
                <div className="text-[10px] text-slate-400 font-mono pt-1">
                  Source: {weather.source || 'Open-Meteo / OpenWeatherMap'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 2. Logistics Hubs */}
        {layerVisibility.hubs &&
          hubs
            .filter((hub) => isValidCoordinate(hub.latitude, hub.longitude))
            .map((hub) => (
              <Marker key={hub.id} position={[hub.latitude, hub.longitude]} icon={hubIcon}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-sky-400 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" />
                      <span>{hub.name}</span>
                    </div>
                    <div>State: {hub.state} | District: {hub.district}</div>
                    <div>Capacity: {hub.capacity} MT | Utilization: {hub.utilization}%</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Coord: {hub.latitude.toFixed(3)}, {hub.longitude.toFixed(3)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

        {/* 4. Warehouses & Cold Storage */}
        {layerVisibility.warehouses &&
          warehouses
            .filter((wh) => isValidCoordinate(wh.latitude, wh.longitude))
            .map((wh) => (
              <Marker
                key={wh.id}
                position={[wh.latitude, wh.longitude]}
                icon={wh.cold_storage ? coldWhIcon : standardWhIcon}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className={`font-bold flex items-center gap-1 ${wh.cold_storage ? 'text-teal-400' : 'text-slate-300'}`}>
                      <WarehouseIcon className="w-3.5 h-3.5" />
                      <span>{wh.name}</span>
                    </div>
                    <div>Type: {wh.cold_storage ? 'Cold Storage Unit' : 'Standard Warehouse'}</div>
                    <div>Capacity: {wh.capacity} MT | Inventory: {wh.current_inventory} MT</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Status: {wh.status}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

        {/* 1. Districts & Accessibility */}
        {layerVisibility.districts &&
          districts
            .filter((d) => isValidCoordinate(d.latitude, d.longitude))
            .map((d) => (
              <Marker
                key={d.id}
                position={[d.latitude, d.longitude]}
                icon={districtIcon(d.accessibility_score)}
                eventHandlers={{
                  click: () => onDistrictSelect && onDistrictSelect(d),
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-white flex items-center justify-between">
                      <span>{d.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Score: {d.accessibility_score}/100
                      </span>
                    </div>
                    <div>Road: {d.road_connectivity}/100 | Highway: {d.highway_access}/100</div>
                    <div>Terrain difficulty: {d.terrain_score}/100</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Lat/Lon: {d.latitude.toFixed(3)}, {d.longitude.toFixed(3)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
      </MapContainer>
      )}

      {/* Floating Recenter GPS button when user pans away from vehicle during GPS tracking */}
      {gpsLocation && !isFollowMode && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-16 right-4 z-[1001] pointer-events-auto bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black px-4 py-2.5 rounded-xl shadow-2xl border-2 border-slate-900 flex items-center gap-2 text-xs transition-all active:scale-95 animate-in fade-in"
          title="Recenter Map on Live GPS Position"
        >
          <Crosshair className="w-4 h-4 text-slate-950 stroke-[3]" />
          <span>Recenter GPS</span>
        </button>
      )}
    </div>
  );
};

export default MapView;
