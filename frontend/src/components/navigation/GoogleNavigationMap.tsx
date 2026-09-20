import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigation } from '../../context/NavigationContext';
import { useGPS } from '../../context/GPSContext';
import { NavigationManeuverCard } from './NavigationManeuverCard';
import { NavigationBottomBar } from './NavigationBottomBar';
import { NavigationControls } from './NavigationControls';
import { NavigationHazardBanner } from './NavigationHazardBanner';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { isValidCoordinate } from '../../utils/coordinates';

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__nexoraGoogleMapsPromise) return window.__nexoraGoogleMapsPromise;

  window.__nexoraGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nexora-gmaps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.dataset.nexoraGmaps = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });
  return window.__nexoraGoogleMapsPromise;
}

export interface GoogleNavigationMapProps {
  apiKey: string;
  onEndNavigation: () => void;
  onOpenCopilot: () => void;
  onReportDisaster: () => void;
  onTriggerReroute: () => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  riskScore?: number;
  origin?: { lat: number; lng: number; name: string } | null;
  destination?: { lat: number; lng: number; name: string } | null;
  onSwitchProvider?: () => void;
}

export const GoogleNavigationMap: React.FC<GoogleNavigationMapProps> = ({
  apiKey,
  onEndNavigation,
  onOpenCopilot,
  onReportDisaster,
  onTriggerReroute,
  onReady,
  onError,
  riskScore = 15,
  origin,
  destination,
  onSwitchProvider,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);
  const remainingPolylineRef = useRef<any>(null);
  const completedPolylineRef = useRef<any>(null);
  const hazardMarkersRef = useRef<any[]>([]);
  const originMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const {
    travelMode,
    completedGeometry,
    remainingGeometry,
    snappedPosition,
    displayBearing,
    followMode,
    cameraOrientation,
    cameraPitch,
    routeHazards,
  } = useNavigation();

  const { gps } = useGPS();

  // Handle Google Maps global auth failure
  useEffect(() => {
    const prevAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      console.warn('[GoogleNavigationMap] Google Maps authentication failed (invalid API key)');
      onError?.('Google Maps authentication failed (invalid or restricted API key)');
      if (prevAuthFailure) prevAuthFailure();
    };
    return () => {
      (window as any).gm_authFailure = prevAuthFailure;
    };
  }, [onError]);

  // Initialize Map
  useEffect(() => {
    if (!apiKey || apiKey.trim() === '') {
      onError?.('Google Maps API key not provided in environment');
      return;
    }

    let isMounted = true;

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (!isMounted || !mapContainerRef.current || !window.google?.maps) return;

        const initialLat = (snappedPosition && isValidCoordinate(snappedPosition[0], snappedPosition[1]))
          ? snappedPosition[0]
          : (isValidCoordinate(gps.latitude, gps.longitude)
            ? Number(gps.latitude)
            : (origin && isValidCoordinate(origin.lat, origin.lng) ? origin.lat : 26.1445));
        const initialLng = (snappedPosition && isValidCoordinate(snappedPosition[0], snappedPosition[1]))
          ? snappedPosition[1]
          : (isValidCoordinate(gps.latitude, gps.longitude)
            ? Number(gps.longitude)
            : (origin && isValidCoordinate(origin.lat, origin.lng) ? origin.lng : 91.7362));

        const map = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: 16,
          tilt: cameraPitch > 0 ? 45 : 0,
          heading: cameraOrientation === 'heading-up' ? displayBearing : 0,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: 'greedy',
          rotateControl: true,
        });

        mapInstanceRef.current = map;

        // Vehicle Marker
        const vehicleIcon = {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#0284c7',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: displayBearing,
        };

        const vehicleMarker = new window.google.maps.Marker({
          position: { lat: initialLat, lng: initialLng },
          map,
          icon: vehicleIcon,
          title: 'Your Vehicle',
          zIndex: 9999,
        });
        vehicleMarkerRef.current = vehicleMarker;

        // Polylines
        remainingPolylineRef.current = new window.google.maps.Polyline({
          map,
          strokeColor: '#0284c7',
          strokeOpacity: 0.95,
          strokeWeight: 6,
          zIndex: 100,
        });

        completedPolylineRef.current = new window.google.maps.Polyline({
          map,
          strokeColor: '#64748b',
          strokeOpacity: 0.5,
          strokeWeight: 5,
          zIndex: 90,
        });

        // Origin & Destination Markers
        if (origin?.lat && origin?.lng) {
          originMarkerRef.current = new window.google.maps.Marker({
            position: { lat: origin.lat, lng: origin.lng },
            map,
            label: { text: 'A', color: '#ffffff', fontWeight: 'bold' },
            title: origin.name || 'Origin',
          });
        }
        if (destination?.lat && destination?.lng) {
          destMarkerRef.current = new window.google.maps.Marker({
            position: { lat: destination.lat, lng: destination.lng },
            map,
            label: { text: 'B', color: '#ffffff', fontWeight: 'bold' },
            title: destination.name || 'Destination',
          });
        }

        setMapReady(true);
        onReady?.();
      })
      .catch((err) => {
        console.warn('[GoogleNavigationMap] Initialization error:', err);
        onError?.(err?.message || 'Google Maps failed to load');
      });

    return () => {
      isMounted = false;
      if (vehicleMarkerRef.current) vehicleMarkerRef.current.setMap(null);
      if (remainingPolylineRef.current) remainingPolylineRef.current.setMap(null);
      if (completedPolylineRef.current) completedPolylineRef.current.setMap(null);
      if (originMarkerRef.current) originMarkerRef.current.setMap(null);
      if (destMarkerRef.current) destMarkerRef.current.setMap(null);
      hazardMarkersRef.current.forEach(m => m.setMap(null));
      hazardMarkersRef.current = [];
    };
  }, [apiKey]);

  // Update Route Polylines
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;

    if (remainingPolylineRef.current && remainingGeometry.length > 0) {
      const path = remainingGeometry.map(([lat, lng]) => ({ lat, lng }));
      remainingPolylineRef.current.setPath(path);
    }

    if (completedPolylineRef.current && completedGeometry.length > 0) {
      const path = completedGeometry.map(([lat, lng]) => ({ lat, lng }));
      completedPolylineRef.current.setPath(path);
    }
  }, [mapReady, remainingGeometry, completedGeometry]);

  // Update Vehicle Marker & Camera
  useEffect(() => {
    if (!mapReady || !window.google?.maps || !mapInstanceRef.current) return;

    const lat = snappedPosition?.[0] || gps.latitude;
    const lng = snappedPosition?.[1] || gps.longitude;

    if (lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
      const pos = { lat, lng };

      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.setPosition(pos);
        const icon = vehicleMarkerRef.current.getIcon();
        if (icon) {
          icon.rotation = displayBearing;
          vehicleMarkerRef.current.setIcon(icon);
        }
      }

      if (followMode) {
        mapInstanceRef.current.panTo(pos);
        if (cameraOrientation === 'heading-up') {
          mapInstanceRef.current.setHeading(displayBearing);
        }
      }
    }
  }, [mapReady, snappedPosition, gps.latitude, gps.longitude, displayBearing, followMode, cameraOrientation]);

  const handleRouteOverview = useCallback(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    remainingGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
    completedGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, 50);
    }
  }, [remainingGeometry, completedGeometry]);

  // Render Hazard Markers
  useEffect(() => {
    if (!mapReady || !window.google?.maps || !mapInstanceRef.current) return;

    hazardMarkersRef.current.forEach(m => m.setMap(null));
    hazardMarkersRef.current = [];

    routeHazards.forEach(hazard => {
      const lat = hazard.latitude;
      const lon = hazard.longitude;
      if (lat && lon) {
        const marker = new window.google.maps.Marker({
          position: { lat, lng: lon },
          map: mapInstanceRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#ef4444',
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          title: hazard.title || 'Hazard on route',
        });
        hazardMarkersRef.current.push(marker);
      }
    });
  }, [mapReady, routeHazards]);

  return (
    <div className="relative w-full h-full min-h-0 bg-slate-950 overflow-hidden font-sans select-none flex flex-col">
      {/* Informational Top Banner: Google Maps Active */}
      <div className="bg-sky-600/90 backdrop-blur-md text-white px-4 py-2 text-xs font-bold flex items-center justify-between z-40 border-b border-sky-500/50 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>GOOGLE MAPS NAVIGATION ENGINE ACTIVE</span>
        </div>
        {onSwitchProvider && (
          <button
            type="button"
            onClick={onSwitchProvider}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 text-sky-300 hover:text-white rounded-lg text-[11px] font-mono border border-sky-400/40 flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Switch Map Style</span>
          </button>
        )}
      </div>

      {/* Google Maps Canvas */}
      <div className="relative flex-1 w-full h-full min-h-0">
        <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '400px' }} />

        {/* TOP FLOATING OVERLAYS */}
        <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none flex flex-col gap-2.5">
          <NavigationManeuverCard />
          <NavigationHazardBanner onTriggerReroute={onTriggerReroute} />
        </div>

        {/* CONTROLS (Follow Mode, Re-center, Orientation) */}
        <div className="absolute bottom-28 right-4 z-30 pointer-events-auto">
          <NavigationControls onRouteOverview={handleRouteOverview} />
        </div>

        {/* BOTTOM FLOATING BAR */}
        <div className="absolute bottom-4 left-4 right-4 z-30 pointer-events-auto">
          <NavigationBottomBar
            onEndNavigation={onEndNavigation}
            onOpenCopilot={onOpenCopilot}
            onReportDisaster={onReportDisaster}
            riskScore={riskScore}
          />
        </div>
      </div>
    </div>
  );
};
