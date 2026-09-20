import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Layers, AlertTriangle, Warehouse, Truck, MapPin,
  ShieldAlert, Navigation, Zap, Compass, CheckCircle2,
  Plus, Minus, Crosshair, Maximize2, Minimize2, Check,
  Filter, Eye, Mountain, Waves, CloudLightning, Wind, Activity, RefreshCw
} from 'lucide-react';
import { DistrictData, LogisticsHubData, WarehouseData, IncidentData, RoadData, DisasterAlertData } from '../types';
import {
  DisasterMarkerLeaflet,
  normalizeDisasterGeometry,
  getDisasterCategory,
  getSeverityColor,
  renderDisasterIconComponent
} from './DisasterMarker';

// Map bridge controller
const MapBridge: React.FC<{
  onMapReady: (map: L.Map) => void;
  center: [number, number];
  zoom: number;
  flyToCoord?: [number, number] | null;
  onZoomChange?: (z: number) => void;
}> = ({ onMapReady, center, zoom, flyToCoord, onZoomChange }) => {
  const map = useMap();
  const initialViewSetRef = useRef(false);

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!initialViewSetRef.current) {
      map.setView(center, zoom);
      initialViewSetRef.current = true;
    }
  }, [center, zoom, map]);

  useEffect(() => {
    if (flyToCoord) {
      map.flyTo(flyToCoord, Math.max(map.getZoom(), 11), { duration: 1.5 });
    }
  }, [flyToCoord, map]);

  useEffect(() => {
    if (!onZoomChange) return;
    const handleZoom = () => onZoomChange(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, onZoomChange]);

  return null;
};

// Custom SVG Icons for Non-Disaster Features
const createCustomIcon = (color: string, iconHtml: string, size = 30) => {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        font-size: 14px;
      ">
        ${iconHtml}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const hubIcon = createCustomIcon('#0284c7', '📦', 28);
const coldWarehouseIcon = createCustomIcon('#0d9488', '❄️', 26);
const standardWarehouseIcon = createCustomIcon('#64748b', '🏬', 24);
const districtGoodIcon = createCustomIcon('#10b981', '📍', 22);
const districtModerateIcon = createCustomIcon('#f59e0b', '📍', 22);
const districtCriticalIcon = createCustomIcon('#ef4444', '📍', 22);
const gpsIcon = createCustomIcon('#0284c7', '🧭', 28);

export interface GisMapProps {
  districts?: DistrictData[];
  hubs?: LogisticsHubData[];
  warehouses?: WarehouseData[];
  incidents?: IncidentData[];
  disasters?: DisasterAlertData[];
  selectedDisasterId?: number | string | null;
  roads?: RoadData[];
  activeRouteWaypoints?: { lat: number; lng: number; name?: string }[];
  bypassRouteWaypoints?: { lat: number; lng: number; name?: string }[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  autoFitDisasters?: boolean;
  loading?: boolean;
  onDistrictSelect?: (district: DistrictData) => void;
  onDisasterSelect?: (disaster: DisasterAlertData) => void;
  onLocationClick?: (lat: number, lng: number) => void;
}

export const GisMap: React.FC<GisMapProps> = ({
  districts = [],
  hubs = [],
  warehouses = [],
  incidents = [],
  disasters = [],
  selectedDisasterId = null,
  roads = [],
  activeRouteWaypoints = [],
  bypassRouteWaypoints = [],
  center = [26.2006, 92.9376], // Central NER
  zoom = 7,
  height = '560px',
  autoFitDisasters = false,
  loading = false,
  onDistrictSelect,
  onDisasterSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);

  // Basemap style: Dark Command, Standard Map, Satellite Imagery
  const [basemap, setBasemap] = useState<'dark' | 'standard' | 'satellite'>('standard');
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  // Layer toggles
  const [showDistricts, setShowDistricts] = useState(true);
  const [showHubs, setShowHubs] = useState(true);
  const [showWarehouses, setShowWarehouses] = useState(true);
  const [showDisasters, setShowDisasters] = useState(true);
  const [showRiskHeatmap, setShowRiskHeatmap] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [clusterAtLowZoom, setClusterAtLowZoom] = useState(true);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [showFiltersBar, setShowFiltersBar] = useState(false);

  // GPS Locate
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Normalize all incoming active disasters
  const normalizedDisasterList = useMemo(() => {
    return disasters.map((d) => {
      const geom = normalizeDisasterGeometry(d);
      const cat = getDisasterCategory(d.event || d.disaster_type || d.event_type);
      const sev = (d.severity || d.raw_severity || 'UNKNOWN').toUpperCase();
      return {
        raw: d,
        geom,
        category: cat,
        severity: sev,
      };
    });
  }, [disasters]);

  const totalActiveDisasters = normalizedDisasterList.length;
  const mappedDisasters = useMemo(() => {
    return normalizedDisasterList.filter(
      (d) => d.geom.hasValidLocation && d.geom.latitude !== null && d.geom.longitude !== null
    );
  }, [normalizedDisasterList]);
  const unmappedDisasters = useMemo(() => {
    return normalizedDisasterList.filter(
      (d) => !d.geom.hasValidLocation || d.geom.latitude === null || d.geom.longitude === null
    );
  }, [normalizedDisasterList]);

  // Filtered by type and severity
  const filteredDisasters = useMemo(() => {
    return mappedDisasters.filter((item) => {
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      const matchesSeverity =
        severityFilter === 'ALL' || item.severity.includes(severityFilter);
      return matchesCategory && matchesSeverity;
    });
  }, [mappedDisasters, categoryFilter, severityFilter]);

  // Counts per disaster type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: mappedDisasters.length,
      LANDSLIDE: 0,
      FLOOD: 0,
      THUNDERSTORM: 0,
      CYCLONE: 0,
      EARTHQUAKE: 0,
      FIRE: 0,
      'HEAVY RAIN': 0,
      HEATWAVE: 0,
      DROUGHT: 0,
      TSUNAMI: 0,
      OTHER: 0,
    };
    mappedDisasters.forEach((d) => {
      if (counts[d.category] !== undefined) {
        counts[d.category]++;
      } else {
        counts.OTHER++;
      }
    });
    return counts;
  }, [mappedDisasters]);

  // Handle Fit to All Disasters
  const handleFitAllDisasters = () => {
    if (!mapInstance || mappedDisasters.length === 0) return;
    const pts = mappedDisasters.map(
      (d) => [d.geom.latitude!, d.geom.longitude!] as [number, number]
    );
    const bounds = L.latLngBounds(pts);
    mapInstance.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 });
  };

  // Auto-fit disasters only on initial mount/data arrival (never on subsequent 30s refreshes)
  const hasAutoFittedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoFittedRef.current && mapInstance && mappedDisasters.length > 0) {
      if (autoFitDisasters) {
        handleFitAllDisasters();
      }
      hasAutoFittedRef.current = true;
    }
  }, [mapInstance, mappedDisasters.length, autoFitDisasters]);

  // Focus on selected disaster
  useEffect(() => {
    if (!selectedDisasterId || !mapInstance) return;
    const target = mappedDisasters.find(
      (d) => String(d.raw.id) === String(selectedDisasterId) || String(d.raw.identifier) === String(selectedDisasterId)
    );
    if (target && target.geom.latitude && target.geom.longitude) {
      mapInstance.flyTo([target.geom.latitude, target.geom.longitude], 12, { duration: 1.2 });
    }
  }, [selectedDisasterId, mapInstance, mappedDisasters]);

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

  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setFlyToTarget([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Basemap Tile Providers
  const getTileConfig = () => {
    switch (basemap) {
      case 'satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
          className: '',
        };
      case 'standard':
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          className: '',
        };
      case 'dark':
      default:
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | NEXORA Dark Theme',
          className: 'osm-dark-tiles',
        };
    }
  };

  const tileConfig = getTileConfig();
  const routePositions = activeRouteWaypoints.map((w) => [w.lat, w.lng] as [number, number]);
  const bypassPositions = bypassRouteWaypoints.map((w) => [w.lat, w.lng] as [number, number]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col font-sans select-none ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none' : ''
      }`}
      style={{ height: isFullscreen ? '100vh' : height }}
    >
      {/* Top Floating Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-xs font-mono text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span className="text-sky-400 font-bold">NEXORA GIS</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 font-bold">ACTIVE DISASTERS: {totalActiveDisasters}</span>
          <span className="text-slate-500 text-[11px]">(Mapped: {mappedDisasters.length})</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Quick Fit All Disasters Button */}
          <button
            onClick={handleFitAllDisasters}
            title="Fit Map to All Active Disasters"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border shadow-xl bg-slate-900/90 text-red-300 border-red-500/40 hover:bg-red-950 hover:text-white text-xs font-bold transition-all"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Show All Disasters</span>
            <span className="sm:hidden">Fit ({mappedDisasters.length})</span>
          </button>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFiltersBar(!showFiltersBar)}
            title="Filter Disasters by Type & Severity"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
              showFiltersBar || categoryFilter !== 'ALL' || severityFilter !== 'ALL'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {(categoryFilter !== 'ALL' || severityFilter !== 'ALL') && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
            )}
          </button>

          {/* Map Style Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowStyleMenu(!showStyleMenu);
                setShowLayersMenu(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                showStyleMenu
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Style</span>
            </button>

            {showStyleMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-1 z-[1100] animate-in fade-in">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1 font-mono">
                  SELECT MAP STYLE
                </div>
                <button
                  onClick={() => { setBasemap('standard'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
                    basemap === 'standard' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>Standard Map</span>
                  {basemap === 'standard' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setBasemap('satellite'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
                    basemap === 'satellite' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>Satellite Imagery</span>
                  {basemap === 'satellite' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setBasemap('dark'); setShowStyleMenu(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
                    basemap === 'dark' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>Dark Command</span>
                  {basemap === 'dark' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Layers Toggle */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLayersMenu(!showLayersMenu);
                setShowStyleMenu(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border shadow-xl text-xs font-bold transition-all ${
                showLayersMenu
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Layers</span>
            </button>

            {showLayersMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-2 z-[1100] animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono text-[10px] uppercase text-slate-400">
                  <span className="font-bold text-white">GIS Intelligence Layers</span>
                  <span>Live DB</span>
                </div>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showDisasters}
                      onChange={(e) => setShowDisasters(e.target.checked)}
                      className="rounded border-slate-700 text-red-500 focus:ring-0"
                    />
                    <span className="font-bold text-red-300">Active Disasters</span>
                  </div>
                  <span className="text-[10px] font-mono text-red-400 font-bold bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800">
                    {totalActiveDisasters}
                  </span>
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showRiskHeatmap}
                      onChange={(e) => setShowRiskHeatmap(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>Disaster Zones Buffer</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400">Buffer</span>
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={clusterAtLowZoom}
                      onChange={(e) => setClusterAtLowZoom(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Cluster (Low Zoom)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">z&lt;9</span>
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showDistricts}
                      onChange={(e) => setShowDistricts(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Districts & Scores</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">{districts.length}</span>
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showHubs}
                      onChange={(e) => setShowHubs(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Logistics Hubs</span>
                  </div>
                  <span className="text-[10px] font-mono text-sky-400">{hubs.length}</span>
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showWarehouses}
                      onChange={(e) => setShowWarehouses(e.target.checked)}
                      className="rounded border-slate-700 text-teal-500 focus:ring-0"
                    />
                    <span>Warehouses & Cold Units</span>
                  </div>
                  <span className="text-[10px] font-mono text-teal-400">{warehouses.length}</span>
                </label>

                <div className="flex items-center justify-between opacity-50 text-slate-400">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" disabled checked={false} />
                    <span>Railheads</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">Data unavailable</span>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-2 rounded-xl backdrop-blur-md border shadow-xl bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Part 9: Active Disaster Telemetry Overlay */}
      <div className="absolute top-14 left-3 z-[1000] pointer-events-auto bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-xl border border-red-500/40 shadow-2xl text-xs font-mono space-y-1 max-w-[280px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            <span className="font-bold text-white text-[11px] uppercase tracking-wide">
              ACTIVE DISASTERS
            </span>
          </div>
          <span className="text-red-400 font-extrabold text-sm">{totalActiveDisasters}</span>
        </div>
        <div className="text-[10px] text-slate-300 flex items-center justify-between border-t border-slate-800/80 pt-1">
          <span className="text-emerald-400 font-medium">Mapped: {mappedDisasters.length}</span>
          <span className="text-slate-600">|</span>
          <span className={unmappedDisasters.length > 0 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
            Location unavailable: {unmappedDisasters.length}
          </span>
        </div>
      </div>

      {/* Part 11 & 12: Disaster Type & Severity Filter Pills */}
      {showFiltersBar && (
        <div className="absolute top-28 left-3 right-3 z-[1000] pointer-events-auto bg-slate-900/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-700 shadow-2xl space-y-2 animate-in fade-in">
          {/* Disaster Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono shrink-0 mr-1">
              Event:
            </span>
            {[
              { id: 'ALL', label: `ALL (${typeCounts.ALL})` },
              ...(typeCounts.LANDSLIDE > 0 ? [{ id: 'LANDSLIDE', label: `Landslide (${typeCounts.LANDSLIDE})` }] : []),
              ...(typeCounts.FLOOD > 0 ? [{ id: 'FLOOD', label: `Flood (${typeCounts.FLOOD})` }] : []),
              ...(typeCounts.THUNDERSTORM > 0 ? [{ id: 'THUNDERSTORM', label: `Thunderstorm (${typeCounts.THUNDERSTORM})` }] : []),
              ...(typeCounts.CYCLONE > 0 ? [{ id: 'CYCLONE', label: `Cyclone (${typeCounts.CYCLONE})` }] : []),
              ...(typeCounts.EARTHQUAKE > 0 ? [{ id: 'EARTHQUAKE', label: `Earthquake (${typeCounts.EARTHQUAKE})` }] : []),
              ...(typeCounts['HEAVY RAIN'] > 0 ? [{ id: 'HEAVY RAIN', label: `Heavy Rain (${typeCounts['HEAVY RAIN']})` }] : []),
              ...(typeCounts.OTHER > 0 ? [{ id: 'OTHER', label: `Other (${typeCounts.OTHER})` }] : []),
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setCategoryFilter(item.id)}
                className={`px-2 py-1 rounded-lg font-semibold shrink-0 transition-all ${
                  categoryFilter === item.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Severity Filter Pills */}
          <div className="flex items-center gap-1.5 border-t border-slate-800 pt-1.5 text-[11px]">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono shrink-0 mr-1">
              Severity:
            </span>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  severityFilter === sev
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Part 24: Map Legend */}
      <div className="absolute bottom-6 left-3 z-[1000] pointer-events-auto bg-slate-900/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 shadow-2xl text-[10px] text-slate-300 space-y-1.5 hidden md:block">
        <div className="font-bold text-white uppercase tracking-wider text-[9px] font-mono border-b border-slate-800 pb-1">
          ACTIVE DISASTER INTEL
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
            <span>Critical/High</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Medium</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Low</span>
          </span>
        </div>
        <div className="text-[9px] text-slate-400 font-mono pt-0.5 border-t border-slate-800/60 flex items-center gap-2">
          <span>Source: NDMA SACHET</span>
          <span>•</span>
          <span>CAP 1.2</span>
        </div>
      </div>

      {/* Bottom-Right Zoom & Locate Stack */}
      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col items-center gap-2 pointer-events-auto">
        <button
          onClick={handleLocateMe}
          title="Locate Me (GPS)"
          className={`p-2.5 rounded-xl backdrop-blur-md border shadow-2xl transition-all ${
            gpsLocation
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
              : 'bg-slate-900/90 text-sky-400 border-slate-700/80 hover:bg-slate-800 hover:text-sky-300'
          }`}
        >
          <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
        </button>

        <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden divide-y divide-slate-800">
          <button
            onClick={() => mapInstance?.zoomIn()}
            title="Zoom In"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapInstance?.zoomOut()}
            title="Zoom Out"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Part 22: Loading State Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1100] bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
          <RefreshCw className="w-7 h-7 text-red-400 animate-spin" />
          <span className="text-xs font-bold text-white tracking-wider font-mono uppercase">
            LOADING LIVE DISASTER DATA...
          </span>
        </div>
      )}

      {/* Map Container */}
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <MapBridge
          onMapReady={setMapInstance}
          center={center}
          zoom={zoom}
          flyToCoord={flyToTarget}
          onZoomChange={setCurrentZoom}
        />

        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          className={tileConfig.className}
        />

        {gpsLocation && (
          <Marker position={[gpsLocation.lat, gpsLocation.lng]} icon={gpsIcon}>
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-sky-400">Current Device Location</div>
                <div>Accuracy: ±{Math.round(gpsLocation.accuracy)}m</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* District Markers with Accessibility Scores */}
        {showDistricts &&
          districts.map((district) => {
            const score = district.accessibility_score;
            const icon =
              score >= 70
                ? districtGoodIcon
                : score >= 45
                ? districtModerateIcon
                : districtCriticalIcon;
            return (
              <Marker
                key={`dist-${district.id}`}
                position={[district.latitude, district.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => onDistrictSelect && onDistrictSelect(district),
                }}
              >
                <Popup>
                  <div className="p-1 space-y-1 text-xs">
                    <div className="font-bold text-sm text-slate-100 flex items-center justify-between gap-3">
                      <span>{district.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          score >= 70
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : score >= 45
                            ? 'bg-amber-950 text-amber-300 border border-amber-700'
                            : 'bg-red-950 text-red-300 border border-red-700'
                        }`}
                      >
                        {score}/100
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 space-y-0.5 pt-1 border-t border-slate-700/60">
                      <div>Road Connectivity: <strong>{district.road_connectivity}/100</strong></div>
                      <div>Highway Access: <strong>{district.highway_access}/100</strong></div>
                      <div>Railway Access: <strong>{district.railway_access}/100</strong></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Logistics Hubs */}
        {showHubs &&
          hubs.map((hub) => (
            <Marker key={`hub-${hub.id}`} position={[hub.latitude, hub.longitude]} icon={hubIcon}>
              <Popup>
                <div className="p-1 text-xs space-y-1">
                  <div className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-sky-400" />
                    <span>{hub.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <div>State: <strong>{hub.state}</strong> | District: <strong>{hub.district}</strong></div>
                    <div>Capacity: <strong>{hub.capacity.toLocaleString()} MT</strong></div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Warehouses */}
        {showWarehouses &&
          warehouses.map((wh) => (
            <Marker
              key={`wh-${wh.id}`}
              position={[wh.latitude, wh.longitude]}
              icon={wh.cold_storage ? coldWarehouseIcon : standardWarehouseIcon}
            >
              <Popup>
                <div className="p-1 text-xs space-y-1">
                  <div className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                    <Warehouse className="w-4 h-4 text-teal-400" />
                    <span>{wh.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <div>Type: <strong>{wh.cold_storage ? 'Cold Storage Facility' : 'Standard Warehouse'}</strong></div>
                    <div>Capacity: <strong>{wh.capacity.toLocaleString()} MT</strong></div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* PART 3 & 13: LIVE OFFICIAL SACHET NDMA DISASTERS LAYER (WITH CLUSTERING AT LOW ZOOM) */}
        {showDisasters &&
          (() => {
            const shouldCluster = clusterAtLowZoom && currentZoom < 8 && filteredDisasters.length > 8;

            if (shouldCluster) {
              const cellSize = 1.0; // 1 degree cell grid
              const buckets = new Map<string, typeof filteredDisasters>();
              filteredDisasters.forEach((d) => {
                const key = `${Math.floor(d.geom.latitude! / cellSize)}_${Math.floor(d.geom.longitude! / cellSize)}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push(d);
              });

              return Array.from(buckets.entries()).map(([key, group]) => {
                const clat = group.reduce((s, g) => s + g.geom.latitude!, 0) / group.length;
                const clon = group.reduce((s, g) => s + g.geom.longitude!, 0) / group.length;

                if (group.length === 1) {
                  return (
                    <DisasterMarkerLeaflet
                      key={`single-disaster-${group[0].raw.id || group[0].raw.identifier}`}
                      alert={group[0].raw}
                      showZone={showRiskHeatmap}
                      isSelected={
                        String(group[0].raw.id) === String(selectedDisasterId) ||
                        String(group[0].raw.identifier) === String(selectedDisasterId)
                      }
                      onSelect={(alert) => onDisasterSelect && onDisasterSelect(alert)}
                    />
                  );
                }

                const clusterIcon = L.divIcon({
                  className: 'nexora-disaster-cluster-icon',
                  html: `
                    <div style="
                      background: radial-gradient(circle, #ea580c 0%, #b91c1c 80%);
                      color: #ffffff;
                      border: 2px solid #fef08a;
                      border-radius: 9999px;
                      width: 38px;
                      height: 38px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-weight: 800;
                      font-family: monospace;
                      font-size: 13px;
                      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
                      cursor: pointer;
                    ">
                      ${group.length}
                    </div>
                  `,
                  iconSize: [38, 38],
                  iconAnchor: [19, 19],
                });

                return (
                  <Marker
                    key={`cluster-${key}`}
                    position={[clat, clon]}
                    icon={clusterIcon}
                    eventHandlers={{
                      click: () => {
                        mapInstance?.setView([clat, clon], Math.min(14, currentZoom + 2));
                      },
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 p-1">
                        <div className="font-bold text-white">
                          {group.length} Active Disasters in this Area
                        </div>
                        <div className="text-[10px] text-slate-300">
                          Click to zoom in and inspect individual hazards.
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              });
            }

            // High zoom or unclustered: render every single disaster marker with official Lucide icons
            return filteredDisasters.map((item) => (
              <DisasterMarkerLeaflet
                key={`disaster-${item.raw.id || item.raw.identifier}`}
                alert={item.raw}
                showZone={showRiskHeatmap}
                isSelected={
                  String(item.raw.id) === String(selectedDisasterId) ||
                  String(item.raw.identifier) === String(selectedDisasterId)
                }
                onSelect={(alert) => onDisasterSelect && onDisasterSelect(alert)}
              />
            ));
          })()}

        {/* Polylines */}
        {routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#0284c7', weight: 4, opacity: 0.85 }}
          />
        )}
        {bypassPositions.length > 0 && (
          <Polyline
            positions={bypassPositions}
            pathOptions={{ color: '#10b981', weight: 4, dashArray: '6, 8', opacity: 0.9 }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default GisMap;
