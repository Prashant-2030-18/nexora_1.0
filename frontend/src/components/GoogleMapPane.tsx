import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: any;
    __nexoraGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__nexoraGoogleMapsPromise) return window.__nexoraGoogleMapsPromise;

  window.__nexoraGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nexora-gmaps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed')));
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

export interface GoogleMapPaneProps {
  apiKey: string;
  center: [number, number];
  zoom?: number;
  height?: string;
  mapTypeId?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  origin?: { lat: number; lng: number; name?: string } | null;
  destination?: { lat: number; lng: number; name?: string } | null;
  routeCoordinates?: number[][]; // [lon, lat]
  onMapClick?: (lat: number, lng: number) => void;
  onUnavailable?: (reason: string) => void;
}

/**
 * Google Maps JS pane — only mounted when a real API key is configured.
 * Never renders an "API KEY REQUIRED" watermark.
 */
export const GoogleMapPane: React.FC<GoogleMapPaneProps> = ({
  apiKey,
  center,
  zoom = 8,
  height = '100%',
  mapTypeId = 'roadmap',
  origin,
  destination,
  routeCoordinates = [],
  onMapClick,
  onUnavailable,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !ref.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(ref.current, {
          center: { lat: center[0], lng: center[1] },
          zoom,
          mapTypeId,
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: true,
          zoomControl: true,
        });
        mapRef.current = map;
        map.addListener('click', (e: any) => {
          if (e.latLng && onMapClick) onMapClick(e.latLng.lat(), e.latLng.lng());
        });
      })
      .catch((err) => {
        const msg = err?.message || 'Google Maps unavailable';
        setError(msg);
        onUnavailable?.(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    overlaysRef.current.forEach((o) => o.setMap?.(null));
    overlaysRef.current = [];

    map.setMapTypeId(mapTypeId);
    map.setCenter({ lat: center[0], lng: center[1] });
    map.setZoom(zoom);

    if (origin) {
      const m = new window.google.maps.Marker({
        map,
        position: { lat: origin.lat, lng: origin.lng },
        label: 'A',
        title: origin.name || 'Origin',
      });
      overlaysRef.current.push(m);
    }
    if (destination) {
      const m = new window.google.maps.Marker({
        map,
        position: { lat: destination.lat, lng: destination.lng },
        label: 'B',
        title: destination.name || 'Destination',
      });
      overlaysRef.current.push(m);
    }
    if (routeCoordinates.length > 1) {
      const path = routeCoordinates.map((c) => ({ lat: c[1], lng: c[0] }));
      const poly = new window.google.maps.Polyline({
        map,
        path,
        strokeColor: '#0ea5e9',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
      overlaysRef.current.push(poly);
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 48);
    }
  }, [center, zoom, mapTypeId, origin, destination, routeCoordinates]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 text-amber-200 text-xs p-4 text-center" style={{ height }}>
        Google Maps unavailable ({error}). Falling back to OpenStreetMap in the parent view.
      </div>
    );
  }

  return <div ref={ref} className="w-full h-full" style={{ height }} />;
};

export default GoogleMapPane;
