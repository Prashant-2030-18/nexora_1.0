import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { MapView } from '../MapView';
import { NavigationManeuverCard } from './NavigationManeuverCard';
import { NavigationBottomBar } from './NavigationBottomBar';
import { NavigationHazardBanner } from './NavigationHazardBanner';
import { useNavigation } from '../../context/NavigationContext';

export interface LeafletNavigationMapProps {
  districts: any[];
  incidents: any[];
  disasters: any[];
  userDisasters: any[];
  routes?: any;
  selectedStrategy: any;
  onSelectStrategy?: (s: any) => void;
  origin: { lat: number; lng: number; name: string } | null;
  destination: { lat: number; lng: number; name: string } | null;
  weather?: any;
  onEndNavigation: () => void;
  onOpenCopilot: () => void;
  onReportDisaster: () => void;
  onTriggerReroute: () => void;
  onTry3DMode?: () => void;
  riskScore?: number;
}

export const LeafletNavigationMap: React.FC<LeafletNavigationMapProps> = ({
  districts,
  incidents,
  disasters,
  userDisasters,
  routes,
  selectedStrategy,
  onSelectStrategy = () => {},
  origin,
  destination,
  weather,
  onEndNavigation,
  onOpenCopilot,
  onReportDisaster,
  onTriggerReroute,
  onTry3DMode,
  riskScore = 15,
}) => {
  const { travelMode } = useNavigation();

  return (
    <div className="relative w-full h-full min-h-0 bg-slate-950 overflow-hidden font-sans select-none flex flex-col">
      {/* Informational Top Banner: Live Navigation Mode */}
      <div className="bg-slate-900/90 backdrop-blur-md text-slate-200 px-4 py-1.5 text-xs font-semibold flex items-center justify-between z-40 border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-emerald-400 font-bold">LIVE NAVIGATION ACTIVE</span>
          <span className="text-slate-400 text-[11px] hidden sm:inline">• OpenStreetMap 2D Engine</span>
        </div>
        {onTry3DMode && (
          <button
            type="button"
            onClick={onTry3DMode}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded-lg text-[11px] font-mono border border-sky-500/30 flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Switch to 3D View</span>
          </button>
        )}
      </div>

      {/* 2D Leaflet Map Layer */}
      <div className="relative flex-1 w-full h-full min-h-0">
        <MapView
          districts={districts}
          incidents={incidents}
          disasters={disasters}
          userDisasters={userDisasters}
          routes={routes}
          selectedStrategy={selectedStrategy}
          onSelectStrategy={onSelectStrategy}
          origin={origin}
          destination={destination}
          weather={weather}
          travelMode={travelMode}
          height="100%"
        />

        {/* TOP FLOATING OVERLAYS: Maneuver Card & Disaster Warning */}
        <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none flex flex-col gap-2.5">
          <NavigationManeuverCard />
          <NavigationHazardBanner onTriggerReroute={onTriggerReroute} />
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
    </div>
  );
};

export const Basic2DNavigationMap = LeafletNavigationMap;
