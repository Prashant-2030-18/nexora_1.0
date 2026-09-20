import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type MapLibreMap = maplibregl.Map;
type MapLibreMarker = maplibregl.Marker;

import { useNavigation, NavigationMapStyle } from '../../context/NavigationContext';
import { useGPS } from '../../context/GPSContext';
import { createVehicleDOMElement, updateVehicleDOMRotation } from './NavigationVehicleMarker';
import { NavigationManeuverCard } from './NavigationManeuverCard';
import { NavigationBottomBar } from './NavigationBottomBar';
import { NavigationControls } from './NavigationControls';
import { NavigationHazardBanner } from './NavigationHazardBanner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { isValidCoordinate, cleanGeoJsonCoords, DEFAULT_MAPLIBRE_CENTER } from '../../utils/coordinates';

interface NavigationMapProps {
  onEndNavigation: () => void;
  onOpenCopilot: () => void;
  onReportDisaster: () => void;
  onTriggerReroute: () => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  riskScore?: number;
}

export const NavigationMap: React.FC<NavigationMapProps> = ({
  onEndNavigation,
  onOpenCopilot,
  onReportDisaster,
  onTriggerReroute,
  onReady,
  onError,
  riskScore = 15,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const vehicleMarkerRef = useRef<MapLibreMarker | null>(null);
  const vehicleElementRef = useRef<HTMLElement | null>(null);
  const disasterMarkersRef = useRef<MapLibreMarker[]>([]);
  const isInitializingRef = useRef<boolean>(false);

  const {
    travelMode,
    completedGeometry,
    remainingGeometry,
    snappedPosition,
    displayBearing,
    followMode,
    cameraOrientation,
    cameraPitch,
    mapStyle,
    routeHazards,
    distanceToNextStepMeters,
    hasArrived,
    setFollowMode,
  } = useNavigation();

  const { gps } = useGPS();
  const [mapReady, setMapReady] = useState(false);
  const [isMeasuringContainer, setIsMeasuringContainer] = useState(true);

  // 1. Generate MapLibre Style Specification for selected Basemap
  // Default is Standard (CARTO Voyager / OSM tiles with open CORS, zero API key requirement)
  const getStyleSpec = useCallback((style: NavigationMapStyle): any => {
    let tileUrls = [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    ];
    let attribution = '&copy; CARTO &copy; OpenStreetMap contributors';
    let maxzoom = 19;

    if (style === 'satellite') {
      tileUrls = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
      attribution = 'Tiles &copy; Esri, Maxar';
    } else if (style === 'terrain') {
      tileUrls = ['https://tile.opentopomap.org/{z}/{x}/{y}.png'];
      attribution = '&copy; OpenTopoMap';
      maxzoom = 17;
    } else if (style === 'night') {
      tileUrls = ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'];
      attribution = '&copy; CARTO, OpenStreetMap';
    }

    return {
      version: 8,
      sources: {
        'basemap-tiles': {
          type: 'raster',
          tiles: tileUrls,
          tileSize: 256,
          attribution,
          maxzoom,
        },
      },
      layers: [
        {
          id: 'basemap-layer',
          type: 'raster',
          source: 'basemap-tiles',
          minzoom: 0,
          maxzoom,
        },
      ],
    };
  }, []);

  // 2. Initialize MapLibre GL Map Instance only after container is attached and visible
  useEffect(() => {
    console.log('[NAV_MAP] component mounted');

    if (mapInstanceRef.current || isInitializingRef.current) {
      console.log('[NAV_MAP] map instance already active or initializing');
      return;
    }

    if (!mapContainerRef.current) {
      console.warn('[NAV_MAP] map container ref is null');
      return;
    }
    console.log('[NAV_MAP] container found');

    // Check WebGL capability via standard HTML5 Canvas context probe
    const isSupported = (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch (e: any) {
        console.error('[NAV_MAP_ERROR] WebGL context probe error:', e?.message, e?.stack);
        return false;
      }
    })();

    console.log('[NAV_MAP] WebGL supported =', isSupported);

    if (!isSupported) {
      console.error('[NAV_MAP_ERROR] WebGL is not supported on this device/browser');
      onError?.('WebGL is not supported on your browser or device.');
      return;
    }

    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let animFrameId: number | null = null;

    const startMapCreation = (w: number, h: number) => {
      if (mapInstanceRef.current || isInitializingRef.current || !mapContainerRef.current) return;
      isInitializingRef.current = true;
      setIsMeasuringContainer(false);

      console.log(`[NAV_MAP] container width = ${w}`);
      console.log(`[NAV_MAP] container height = ${h}`);
      console.log(`[NAV_MAP] creating MapLibre instance`);
      console.log(`[NAV_MAP] style = ${mapStyle}`);

      // Initial center: Real phone GPS -> snapped position -> route start -> default
      let initialCenter: [number, number] = DEFAULT_MAPLIBRE_CENTER;
      if (isValidCoordinate(gps.latitude, gps.longitude)) {
        initialCenter = [Number(gps.longitude), Number(gps.latitude)];
      } else if (snappedPosition && isValidCoordinate(snappedPosition[0], snappedPosition[1])) {
        initialCenter = [Number(snappedPosition[1]), Number(snappedPosition[0])];
      } else if (remainingGeometry.length > 0 && isValidCoordinate(remainingGeometry[0][0], remainingGeometry[0][1])) {
        initialCenter = [Number(remainingGeometry[0][1]), Number(remainingGeometry[0][0])];
      }

      let map: MapLibreMap;
      try {
        map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: getStyleSpec(mapStyle),
          center: initialCenter,
          zoom: 16.5,
          pitch: 50,
          bearing: (gps.heading && !gps.isStationary) ? gps.heading : 0,
          attributionControl: false,
        });
        mapInstanceRef.current = map;
        console.log('[NAV_MAP] map instance created');
      } catch (createErr: any) {
        console.error('[NAV_MAP_ERROR] MapLibre creation failed:', createErr?.message);
        if (createErr?.stack) console.error(createErr.stack);
        isInitializingRef.current = false;
        onError?.(createErr?.message || 'Failed to initialize MapLibre GL instance.');
        return;
      }

      // 6-second timeout safety guard: if MapLibre load doesn't fire, fallback cleanly
      initTimer = setTimeout(() => {
        if (!mapReady) {
          console.warn('[NAV_MAP] Map load timed out after 6s. Triggering Leaflet fallback.');
          onError?.('MapLibre load timed out.');
        }
      }, 6000);

      // Listen to map errors
      map.on('error', (errEvt: any) => {
        console.warn('[NAV_MAP_WARN]', errEvt);
        if (errEvt?.error?.status === 401 || errEvt?.error?.status === 403) {
          console.error('[NAV_MAP_ERROR] Basemap tile provider denied access:', errEvt?.error?.message);
          onError?.('Basemap tile provider denied access.');
        }
      });

      // Once map is loaded: add route source, layers, and GPS marker
      map.once('load', () => {
        if (initTimer) clearTimeout(initTimer);
        console.log('[NAV_MAP] load event');
        console.log('[NAV_MAP] style loaded');

        try {
          map.resize();
        } catch { /* ignore */ }

        // Filter and normalize coordinates for GeoJSON: [longitude, latitude]
        const validCoords: [number, number][] = (remainingGeometry || [])
          .map(c => {
            if (!Array.isArray(c) || c.length < 2) return null;
            const lat = Number(c[0]);
            const lng = Number(c[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            return [lng, lat] as [number, number];
          })
          .filter((c): c is [number, number] => c !== null);

        // Completed route source
        map.addSource('completed-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        });

        map.addLayer({
          id: 'completed-route-casing',
          type: 'line',
          source: 'completed-route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0f172a',
            'line-width': 8,
            'line-opacity': 0.6,
          },
        });

        map.addLayer({
          id: 'completed-route-inner',
          type: 'line',
          source: 'completed-route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#475569',
            'line-width': 5,
            'line-opacity': 0.7,
          },
        });

        // Remaining active route source
        console.log('[NAV_MAP] adding route source');
        map.addSource('remaining-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: validCoords,
            },
          },
        });
        console.log('[NAV_MAP] route source added');

        map.addLayer({
          id: 'remaining-route-casing',
          type: 'line',
          source: 'remaining-route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0369a1',
            'line-width': 10,
            'line-opacity': 0.85,
          },
        });

        map.addLayer({
          id: 'remaining-route-inner',
          type: 'line',
          source: 'remaining-route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 6,
            'line-opacity': 0.95,
          },
        });
        console.log('[NAV_MAP] route layer added');

        // Add Live Vehicle Marker (Real phone GPS position)
        const el = createVehicleDOMElement(travelMode);
        vehicleElementRef.current = el;
        const marker = new maplibregl.Marker({
          element: el,
          rotationAlignment: 'map',
        })
          .setLngLat(initialCenter)
          .addTo(map);

        vehicleMarkerRef.current = marker;
        console.log('[NAV_MAP] GPS marker added');

        setMapReady(true);
        console.log('[NAV_MAP] READY');
        onReady?.();
      });

      // User manual drag pauses follow mode
      const handleDragStart = () => {
        setFollowMode(false);
      };
      map.on('dragstart', handleDragStart);

      const handleResize = () => {
        mapInstanceRef.current?.resize();
      };
      window.addEventListener('resize', handleResize);
    };

    // Wait one layout/animation frame to guarantee valid container dimensions (Spec §4)
    animFrameId = requestAnimationFrame(() => {
      if (!mapContainerRef.current) return;
      const w = mapContainerRef.current.clientWidth;
      const h = mapContainerRef.current.clientHeight;

      if (w > 0 && h > 0) {
        startMapCreation(w, h);
      } else {
        // Retry on next frame or fallback size
        console.log(`[NAV_MAP] Container initial dimensions 0x0, waiting next frame...`);
        requestAnimationFrame(() => {
          if (!mapContainerRef.current) return;
          const retryW = mapContainerRef.current.clientWidth || window.innerWidth;
          const retryH = mapContainerRef.current.clientHeight || (window.innerHeight - 64);
          startMapCreation(retryW, retryH);
        });
      }
    });

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (mapInstanceRef.current) {
        console.log('[NAV_MAP] removing map instance on unmount');
        try {
          mapInstanceRef.current.remove();
        } catch { /* ignore */ }
        mapInstanceRef.current = null;
      }
      vehicleMarkerRef.current = null;
      vehicleElementRef.current = null;
      isInitializingRef.current = false;
      setMapReady(false);
    };
  }, []); // Run once on mount

  // 3. Dynamic Basemap Style Switching
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return;
    mapInstanceRef.current.setStyle(getStyleSpec(mapStyle));

    const handleStyleLoad = () => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const validCoords: [number, number][] = (remainingGeometry || [])
        .map(c => [c[1], c[0]] as [number, number])
        .filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));

      if (!map.getSource('completed-route-source')) {
        map.addSource('completed-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: completedGeometry.map(c => [c[1], c[0]]) },
          },
        });
        map.addLayer({
          id: 'completed-route-casing',
          type: 'line',
          source: 'completed-route-source',
          paint: { 'line-color': '#0f172a', 'line-width': 8, 'line-opacity': 0.6 },
        });
        map.addLayer({
          id: 'completed-route-inner',
          type: 'line',
          source: 'completed-route-source',
          paint: { 'line-color': '#475569', 'line-width': 5, 'line-opacity': 0.7 },
        });
      }

      if (!map.getSource('remaining-route-source')) {
        map.addSource('remaining-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: validCoords },
          },
        });
        map.addLayer({
          id: 'remaining-route-casing',
          type: 'line',
          source: 'remaining-route-source',
          paint: { 'line-color': '#0369a1', 'line-width': 10, 'line-opacity': 0.85 },
        });
        map.addLayer({
          id: 'remaining-route-inner',
          type: 'line',
          source: 'remaining-route-source',
          paint: { 'line-color': '#38bdf8', 'line-width': 6, 'line-opacity': 0.95 },
        });
      }
    };

    mapInstanceRef.current.once('styledata', handleStyleLoad);
  }, [mapStyle, mapReady, getStyleSpec, completedGeometry, remainingGeometry]);

  // 4. Update Route Geometry in MapLibre Layers dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    try {
      const completedSource: any = map.getSource('completed-route-source');
      if (completedSource) {
        const validCoords = completedGeometry
          .filter(pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
          .map(pt => [pt[1], pt[0]]);
        completedSource.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: validCoords },
        });
      }

      const remainingSource: any = map.getSource('remaining-route-source');
      if (remainingSource) {
        const validCoords = remainingGeometry
          .filter(pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
          .map(pt => [pt[1], pt[0]]);
        remainingSource.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: validCoords },
        });
      }
    } catch {
      // style reloading in flight
    }
  }, [completedGeometry, remainingGeometry, mapReady]);

  // 5. Update Vehicle Marker using Real Phone GPS
  useEffect(() => {
    if (!vehicleMarkerRef.current) return;
    const pos = (snappedPosition && isValidCoordinate(snappedPosition[0], snappedPosition[1]))
      ? snappedPosition
      : (isValidCoordinate(gps.latitude, gps.longitude) ? [Number(gps.latitude), Number(gps.longitude)] : null);
    if (!pos) return;

    const lngLat: [number, number] = [pos[1], pos[0]];
    try {
      vehicleMarkerRef.current.setLngLat(lngLat);
    } catch (err) {
      console.warn('[NavigationMap] setLngLat failed:', err);
    }

    if (vehicleElementRef.current) {
      updateVehicleDOMRotation(vehicleElementRef.current, displayBearing);
    }
  }, [snappedPosition, gps.latitude, gps.longitude, displayBearing]);

  // 6. Camera Follow Mode & Heading-Up Tilted Navigation
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !followMode) return;
    const pos = (snappedPosition && isValidCoordinate(snappedPosition[0], snappedPosition[1]))
      ? snappedPosition
      : (isValidCoordinate(gps.latitude, gps.longitude) ? [Number(gps.latitude), Number(gps.longitude)] : null);
    if (!pos) return;

    const targetCenter: [number, number] = [pos[1], pos[0]];
    const targetBearing = cameraOrientation === 'heading-up' ? displayBearing : 0;

    let targetZoom = 16.5;
    const speed = gps.currentSpeedKmh || 0;
    if (distanceToNextStepMeters !== null && distanceToNextStepMeters < 250) {
      targetZoom = 17.5;
    } else if (speed > 60) {
      targetZoom = 15.2;
    } else if (speed > 30) {
      targetZoom = 16.0;
    }

    map.easeTo({
      center: targetCenter,
      bearing: targetBearing,
      pitch: cameraPitch,
      zoom: targetZoom,
      padding: { top: 160, bottom: 220, left: 20, right: 20 },
      duration: 500,
    });
  }, [
    snappedPosition,
    gps.latitude,
    gps.longitude,
    displayBearing,
    followMode,
    cameraOrientation,
    cameraPitch,
    distanceToNextStepMeters,
    gps.currentSpeedKmh,
    mapReady,
  ]);

  // 7. Route Overview Action
  const handleRouteOverview = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || remainingGeometry.length < 2) return;

    setFollowMode(false);
    const bounds = new maplibregl.LngLatBounds();
    remainingGeometry.forEach(pt => bounds.extend([pt[1], pt[0]]));

    map.fitBounds(bounds, {
      padding: { top: 180, bottom: 240, left: 40, right: 40 },
      bearing: 0,
      pitch: 0,
      duration: 1000,
    });
  }, [remainingGeometry, setFollowMode]);

  // 8. Corridor Disaster Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    disasterMarkersRef.current.forEach(m => m.remove());
    disasterMarkersRef.current = [];

    (routeHazards || []).forEach(hazard => {
      const hLat = hazard.latitude || hazard.lat;
      const hLon = hazard.longitude || hazard.lon || hazard.lng;
      if (!hLat || !hLon) return;

      const el = document.createElement('div');
      el.className = 'nexora-nav-hazard-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#dc2626';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.6)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '16px';
      el.style.cursor = 'pointer';
      el.innerHTML = '⚠️';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([hLon, hLat])
        .addTo(map);

      disasterMarkersRef.current.push(marker);
    });

    return () => {
      disasterMarkersRef.current.forEach(m => m.remove());
      disasterMarkersRef.current = [];
    };
  }, [routeHazards, mapReady]);

  return (
    <div className="relative w-full h-full min-h-0 bg-slate-950 overflow-hidden font-sans select-none flex flex-col">
      
      {/* MapLibre GL WebGL Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Loading Skeleton Shell if still measuring container or initializing */}
      {(!mapReady || isMeasuringContainer) && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 z-10 animate-in fade-in pointer-events-none">
          <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-300">
            INITIALIZING 3D NAVIGATION ENGINE...
          </span>
        </div>
      )}

      {/* TOP FLOATING OVERLAYS: Maneuver Card & Disaster Warning */}
      <div className="absolute top-12 left-4 right-4 z-30 pointer-events-none flex flex-col gap-2.5">
        <NavigationManeuverCard />
        <NavigationHazardBanner onTriggerReroute={onTriggerReroute} />
        {/* Low Accuracy Non-Blocking Floating Badge */}
        {gps.accuracy !== null && gps.accuracy > 50 && (
          <div className="self-center pointer-events-auto bg-amber-950/85 border border-amber-500/60 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-amber-950/60 text-[11px] text-amber-200 font-mono animate-in fade-in">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-bold">GPS ACCURACY LOW (±{Math.round(gps.accuracy)}m)</span>
            <span className="text-amber-300/80 text-[10px] hidden sm:inline">• Improving in background</span>
          </div>
        )}
      </div>

      {/* RIGHT FLOATING CONTROLS: Compass, Voice, Overview, Recenter */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none">
        <NavigationControls onRouteOverview={handleRouteOverview} />
      </div>

      {/* BOTTOM FLOATING BAR: Trip Status, ETA, Speedometer & Quick Actions */}
      <div className="absolute bottom-4 left-4 right-4 z-30 pointer-events-auto">
        <NavigationBottomBar
          onEndNavigation={onEndNavigation}
          onOpenCopilot={onOpenCopilot}
          onReportDisaster={onReportDisaster}
          riskScore={riskScore}
        />
      </div>

    </div>
  );
};
