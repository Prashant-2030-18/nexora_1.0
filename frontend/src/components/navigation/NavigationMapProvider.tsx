import React, { useState, useCallback, useEffect } from 'react';
import { GoogleNavigationMap } from './GoogleNavigationMap';
import { NavigationMap } from './NavigationMap';
import { LeafletNavigationMap } from './LeafletNavigationMap';
import { RealRouteResponse } from '../../pages/SmartRoutePlanner';
import { TravelMode } from '../../types';
import { useNavigation } from '../../context/NavigationContext';
import { isValidCoordinate } from '../../utils/coordinates';

export type MapProviderType = 'google' | 'maplibre' | 'leaflet';

export interface NavigationMapProviderProps {
  routeResult: RealRouteResponse | null;
  selectedStrategy: 'fastest' | 'cheapest' | 'safest' | 'reliable';
  origin: string;
  destination: string;
  travelMode: TravelMode;
  districts: any[];
  incidents: any[];
  disasters: any[];
  userDisasters: any[];
  onEndNavigation: () => void;
  onTriggerReroute: () => Promise<void>;
  onReportDisaster: () => void;
  onOpenCopilot: () => void;
  riskScore?: number;
  onProviderChange?: (providerName: string) => void;
}

export const NavigationMapProvider: React.FC<NavigationMapProviderProps> = ({
  routeResult,
  selectedStrategy,
  origin,
  destination,
  travelMode,
  districts,
  incidents,
  disasters,
  userDisasters,
  onEndNavigation,
  onTriggerReroute,
  onReportDisaster,
  onOpenCopilot,
  riskScore = 15,
  onProviderChange,
}) => {
  const { onMapReady, onMapError, isBasic2DMode, setIsBasic2DMode } = useNavigation();

  const googleApiKey = (((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string) || '').trim();
  const hasGoogleKey = Boolean(googleApiKey && googleApiKey.length > 5);

  // Initial provider selection based on environment and user preference
  const [provider, setProvider] = useState<MapProviderType>(() => {
    if (isBasic2DMode) return 'leaflet';
    if (hasGoogleKey) return 'google';
    return 'leaflet';
  });

  const getProviderDisplayName = useCallback((p: MapProviderType): string => {
    switch (p) {
      case 'google':
        return 'Google Maps';
      case 'maplibre':
        return 'MapLibre 3D';
      case 'leaflet':
        return 'OpenStreetMap 2D';
    }
  }, []);

  useEffect(() => {
    onProviderChange?.(getProviderDisplayName(provider));
  }, [provider, getProviderDisplayName, onProviderChange]);

  // Handle Google Maps failure -> Failover to MapLibre 3D
  const handleGoogleError = useCallback((err: string) => {
    console.warn('[NavigationMapProvider] Google Maps failed, downgrading to MapLibre 3D:', err);
    onMapError(`Google Maps unavailable: ${err}. Switching to MapLibre 3D Vector.`);
    setProvider('maplibre');
  }, [onMapError]);

  // Handle MapLibre failure -> Failover to Leaflet 2D
  const handleMapLibreError = useCallback((err: string) => {
    console.warn('[NavigationMapProvider] MapLibre failed, downgrading to Leaflet 2D:', err);
    onMapError(`3D Map Engine unavailable: ${err}. Switching to Leaflet 2D.`);
    setIsBasic2DMode(true);
    setProvider('leaflet');
  }, [onMapError, setIsBasic2DMode]);

  const originCoords = React.useMemo(() => {
    if (!routeResult) return null;
    let lat = routeResult.origin_lat;
    let lng = routeResult.origin_lon;

    if (!isValidCoordinate(lat, lng)) {
      const activeCoords = routeResult.routes?.[selectedStrategy]?.geometry_coordinates || routeResult.routes?.fastest?.geometry_coordinates;
      if (activeCoords && activeCoords.length > 0 && Array.isArray(activeCoords[0])) {
        const candLon = activeCoords[0][0];
        const candLat = activeCoords[0][1];
        if (isValidCoordinate(candLat, candLon)) {
          lat = candLat;
          lng = candLon;
        }
      }
    }

    if (isValidCoordinate(lat, lng)) {
      return { lat: Number(lat), lng: Number(lng), name: origin };
    }
    return null;
  }, [routeResult, origin, selectedStrategy]);

  const destCoords = React.useMemo(() => {
    if (!routeResult) return null;
    let lat = routeResult.dest_lat;
    let lng = routeResult.dest_lon;

    if (!isValidCoordinate(lat, lng)) {
      const activeCoords = routeResult.routes?.[selectedStrategy]?.geometry_coordinates || routeResult.routes?.fastest?.geometry_coordinates;
      if (activeCoords && activeCoords.length > 0) {
        const lastPt = activeCoords[activeCoords.length - 1];
        if (Array.isArray(lastPt)) {
          const candLon = lastPt[0];
          const candLat = lastPt[1];
          if (isValidCoordinate(candLat, candLon)) {
            lat = candLat;
            lng = candLon;
          }
        }
      }
    }

    if (isValidCoordinate(lat, lng)) {
      return { lat: Number(lat), lng: Number(lng), name: destination };
    }
    return null;
  }, [routeResult, destination, selectedStrategy]);

  if (provider === 'google' && hasGoogleKey) {
    return (
      <GoogleNavigationMap
        apiKey={googleApiKey}
        onEndNavigation={onEndNavigation}
        onOpenCopilot={onOpenCopilot}
        onReportDisaster={onReportDisaster}
        onTriggerReroute={onTriggerReroute}
        onReady={onMapReady}
        onError={handleGoogleError}
        riskScore={riskScore}
        origin={originCoords}
        destination={destCoords}
        onSwitchProvider={() => setProvider('maplibre')}
      />
    );
  }

  if (provider === 'maplibre' && !isBasic2DMode) {
    return (
      <NavigationMap
        onEndNavigation={onEndNavigation}
        onOpenCopilot={onOpenCopilot}
        onReportDisaster={onReportDisaster}
        onTriggerReroute={onTriggerReroute}
        onReady={onMapReady}
        onError={handleMapLibreError}
        riskScore={riskScore}
      />
    );
  }

  // Fallback / Standard 2D Leaflet
  return (
    <LeafletNavigationMap
      districts={districts}
      incidents={incidents}
      disasters={disasters}
      userDisasters={userDisasters}
      routes={routeResult?.routes}
      selectedStrategy={selectedStrategy}
      origin={originCoords}
      destination={destCoords}
      weather={routeResult?.weather}
      onEndNavigation={onEndNavigation}
      onOpenCopilot={onOpenCopilot}
      onReportDisaster={onReportDisaster}
      onTriggerReroute={onTriggerReroute}
      onTry3DMode={() => {
        setIsBasic2DMode(false);
        setProvider(hasGoogleKey ? 'google' : 'maplibre');
      }}
      riskScore={riskScore}
    />
  );
};
