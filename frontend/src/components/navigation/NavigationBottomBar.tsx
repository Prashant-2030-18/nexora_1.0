import React from 'react';
import {
  Crosshair, Compass, Bot, ShieldAlert, Gauge, Clock, Navigation, CheckCircle2
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { useGPS } from '../../context/GPSContext';

interface NavigationBottomBarProps {
  onEndNavigation: () => void;
  onOpenCopilot: () => void;
  onReportDisaster: () => void;
  riskScore?: number;
}

export const NavigationBottomBar: React.FC<NavigationBottomBarProps> = ({
  onEndNavigation,
  onOpenCopilot,
  onReportDisaster,
  riskScore = 15,
}) => {
  const {
    remainingDistanceKm,
    remainingDurationMinutes,
    estimatedArrivalTime,
    routeProgressPct,
    travelMode,
    hasArrived,
    isRoutePreview,
    recenterCamera,
    toggleCameraOrientation,
  } = useNavigation();

  const { gps } = useGPS();

  const formatDuration = (mins: number) => {
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hrs} hr ${rem > 0 ? `${rem} min` : ''}`;
    }
    return `${mins} min`;
  };

  const speedDisplay = isRoutePreview
    ? '--'
    : (gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'REQUESTING' || gps.gpsStatus === 'REQUESTING_PERMISSION')
      ? '--'
      : (gps.isStationary || gps.currentSpeedKmh === 0)
        ? '0'
        : gps.currentSpeedKmh !== null
          ? `${Math.round(gps.currentSpeedKmh)}`
          : '--';

  const speedSourceLabel = isRoutePreview
    ? 'PREVIEW'
    : (gps.currentSpeedKmh === null || gps.speedSource === 'SPEED_UNAVAILABLE' || gps.speedSource === 'UNAVAILABLE')
      ? 'SPEED UNAVAILABLE'
      : (gps.isStationary || gps.currentSpeedKmh === 0)
        ? 'STATIONARY'
        : (gps.speedSource === 'DEVICE_GPS' || gps.speedSource === 'LIVE_GPS')
          ? 'LIVE GPS'
          : (gps.speedSource === 'CALCULATED_GPS' || gps.speedSource === 'CALCULATED_FROM_GPS')
            ? 'CALCULATED GPS'
            : 'KM/H';

  const gpsQualityColor = isRoutePreview
    ? 'bg-amber-400'
    : gps.gpsQuality === 'EXCELLENT' || gps.gpsQuality === 'GOOD'
      ? 'bg-emerald-400'
      : gps.gpsQuality === 'FAIR'
        ? 'bg-sky-400'
        : gps.gpsQuality === 'LOW'
          ? 'bg-amber-400'
          : 'bg-red-400';

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl p-4 text-white select-none animate-in fade-in">
      
      {/* Visual Route Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-sky-400 to-cyan-400 h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, routeProgressPct))}%` }}
        />
      </div>

      {/* Live Telemetry Pill Line (Spec §18 & §21) */}
      <div className="flex items-center justify-between px-1 mb-2 text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${gpsQualityColor} ${!isRoutePreview ? 'animate-pulse' : ''}`} />
          <span className="font-semibold text-slate-300">
            {isRoutePreview
              ? 'ROUTE PREVIEW (GPS OFF)'
              : `GPS ● LIVE ${gps.accuracy ? `(±${Math.round(gps.accuracy)}m ${gps.gpsQuality || ''})` : '(ACQUIRING)'}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gps.speedSource && !isRoutePreview && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {speedSourceLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        
        {/* Left: Re-center / Follow Mode Toggle (Replaces duplicate exit button) */}
        <button
          onClick={() => {
            recenterCamera();
            toggleCameraOrientation();
          }}
          title="Re-center on Vehicle / Switch Orientation"
          className="w-12 h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-sky-400 border border-slate-700/80 flex items-center justify-center transition shadow-lg cursor-pointer shrink-0"
        >
          <Crosshair className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Center: ETA Duration, Distance, and Arrival Clock Time */}
        <div className="flex-1 text-center min-w-0">
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
            {hasArrived ? 'Destination' : formatDuration(remainingDurationMinutes)}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-300 font-mono mt-0.5">
            <span className="font-bold text-slate-100">{remainingDistanceKm} km</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {estimatedArrivalTime}
            </span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className={`hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-bold ${
              riskScore > 40 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}>
              RISK {riskScore}/100
            </span>
          </div>
        </div>

        {/* Speedometer Tile */}
        <div className="bg-slate-950 px-3.5 py-1.5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center shrink-0 min-w-[76px]">
          <div className="text-xl sm:text-2xl font-black font-mono leading-none text-emerald-400">
            {speedDisplay}
          </div>
          <div className="text-[9px] uppercase font-mono tracking-wider text-slate-400 mt-0.5">
            {gps.isStationary ? 'STILL' : 'KM/H'}
          </div>
        </div>

        {/* Right Action Shortcuts: Report & Copilot */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReportDisaster}
            title="Report Road Disaster / Hazard"
            className="w-12 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
          </button>

          <button
            onClick={onOpenCopilot}
            title="Ask NEXORA AI Copilot"
            className="w-12 h-12 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            <Bot className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

      </div>
    </div>
  );
};
