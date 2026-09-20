import React from 'react';
import {
  Navigation, AlertTriangle, ShieldAlert, ArrowUpRight, ArrowUpLeft,
  ArrowUp, CornerUpRight, CornerUpLeft, Compass, Gauge, Clock,
  MapPin, ShieldCheck, RefreshCw, Volume2, VolumeX, Square,
  CheckCircle, Radio, WifiOff
} from 'lucide-react';
import { NavigationStep, TravelMode, SpeedSource } from '../types';
import { useConnectivity } from '../context/ConnectivityContext';

export interface NavigationHUDProps {
  isActive: boolean;
  onStopNavigation: () => void;
  travelMode?: TravelMode;
  speedKmh: number | null; // null represents SPEED UNAVAILABLE
  speedSource: SpeedSource | 'LIVE GPS' | 'CALCULATED GPS' | 'CALCULATED FROM GPS' | 'SIMULATED' | 'UNAVAILABLE';
  reasonUnavailable?: string | null;
  totalDistanceKm?: number;
  currentRoadName?: string;
  nextStep?: NavigationStep | null;
  distanceToNextStepMeters?: number | null;
  remainingDistanceKm: number;
  etaFormatted: string;
  gpsAccuracyMeters?: number | null;
  headingDeg?: number | null;
  isOffRoute: boolean;
  offRouteDistanceMeters?: number;
  onTriggerReroute?: () => void;
  intersectingHazards?: any[];
  onReportDisaster?: () => void;
  activeStrategy?: string;
  gpsStatus?: string;
}

// Helper for turn maneuver icon
const getManeuverIcon = (modifier?: string, type?: string) => {
  const m = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();

  if (m.includes('slight right') || m.includes('bear right')) return <ArrowUpRight className="w-8 h-8 text-cyan-400" />;
  if (m.includes('slight left') || m.includes('bear left')) return <ArrowUpLeft className="w-8 h-8 text-cyan-400" />;
  if (m.includes('right') || m.includes('sharp right')) return <CornerUpRight className="w-8 h-8 text-cyan-400" />;
  if (m.includes('left') || m.includes('sharp left')) return <CornerUpLeft className="w-8 h-8 text-cyan-400" />;
  if (t.includes('arrive') || t.includes('destination')) return <CheckCircle className="w-8 h-8 text-emerald-400" />;
  return <ArrowUp className="w-8 h-8 text-cyan-400" />;
};

// Helper for heading text
const getHeadingCardinal = (deg?: number | null): string => {
  if (deg === null || deg === undefined) return '--';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((deg % 360) / 22.5) % 16;
  return `${Math.round(deg)}° ${directions[idx]}`;
};

const getModeTitle = (mode?: TravelMode): string => {
  switch (mode) {
    case 'walking': return 'WALKING NAVIGATION';
    case 'bicycle': return 'BICYCLE NAVIGATION';
    case 'train': return 'TRAIN JOURNEY';
    case 'flight': return 'FLIGHT JOURNEY';
    case 'car': return 'CAR NAVIGATION';
    case 'truck':
    default: return 'TRUCK NAVIGATION';
  }
};

const getDefaultGuidance = (mode?: TravelMode): string => {
  switch (mode) {
    case 'walking': return 'Follow pedestrian walkways / sidewalks. Remain alert to traffic.';
    case 'bicycle': return 'Follow designated cycle paths or road shoulder. Maintain safe distance.';
    case 'train': return 'Boarding & railway corridor tracking. Monitor track progression.';
    case 'flight': return 'Aviation corridor active. Monitor departure and arrival waypoints.';
    default: return 'Continue straight along the corridor';
  }
};

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  isActive,
  onStopNavigation,
  travelMode = 'truck',
  speedKmh,
  speedSource,
  reasonUnavailable,
  totalDistanceKm,
  currentRoadName = 'ROAD UNAVAILABLE',
  nextStep,
  distanceToNextStepMeters,
  remainingDistanceKm,
  etaFormatted,
  gpsAccuracyMeters,
  headingDeg,
  isOffRoute,
  offRouteDistanceMeters,
  onTriggerReroute,
  intersectingHazards = [],
  onReportDisaster,
  activeStrategy = 'fastest',
  gpsStatus = 'LIVE'
}) => {
  const [muted, setMuted] = React.useState(false);
  const { connectionState, getOfflineAgeMinutes, lastSachetSync } = useConnectivity();
  const isOfflineMode = connectionState === 'OFFLINE' || connectionState === 'RESTORING';

  if (!isActive) return null;

  // Format distance
  const formatDist = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const primaryHazard = intersectingHazards.length > 0 ? intersectingHazards[0] : null;
  const isStationary = (speedSource as string) === 'STATIONARY' || (speedKmh === 0 && (speedSource as string) !== 'SPEED_UNAVAILABLE' && (speedSource as string) !== 'UNAVAILABLE');
  const isPedestrianBike = travelMode === 'walking' || travelMode === 'bicycle';
  const progressPct = (totalDistanceKm && totalDistanceKm > 0)
    ? Math.min(100, Math.max(0, Math.round(((totalDistanceKm - remainingDistanceKm) / totalDistanceKm) * 100)))
    : null;

  const offlineAgeMin = getOfflineAgeMinutes();

  return (
    <div className="absolute top-4 left-4 right-4 z-40 max-w-4xl mx-auto flex flex-col gap-2.5 pointer-events-none transition-all duration-300">

      {/* OFFLINE NAVIGATION RIBBON */}
      {isOfflineMode && (
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-950/95 border border-amber-500/70 shadow-xl text-xs font-mono font-bold uppercase tracking-wider text-amber-300 animate-in fade-in">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
          <span>OFFLINE NAVIGATION ACTIVE</span>
          <span className="flex items-center gap-1.5 ml-auto text-amber-400/80 font-normal">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />GPS LIVE
            <span className="mx-2 text-amber-700">|</span>
            <span className="w-2 h-2 rounded-full bg-amber-400" />ROUTE CACHED
            <span className="mx-2 text-amber-700">|</span>
            {/* SACHET labelled CACHED, never LIVE when offline */}
            <span className="w-2 h-2 rounded-full bg-amber-400/50" />
            SACHET CACHED{offlineAgeMin !== null ? ` · ${offlineAgeMin}min ago` : ''}
          </span>
        </div>
      )}

      {/* 1. DISASTER AHEAD WARNING BANNER (if hazard on route) */}
      {primaryHazard && (
        <div className="pointer-events-auto bg-gradient-to-r from-red-650 to-red-900 border-2 border-red-500 rounded-xl p-3.5 shadow-2xl text-white flex flex-wrap items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-600 rounded-lg shadow-inner">
              <ShieldAlert className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wider uppercase bg-white text-red-700 px-2 py-0.5 rounded font-mono">
                  DISASTER AHEAD
                </span>
                <span className="text-xs font-semibold text-red-200">
                  {primaryHazard.source_badge || (primaryHazard.source === 'NDMA_SACHET' ? 'NDMA SACHET (VERIFIED)' : 'USER REPORTED (UNVERIFIED)')}
                </span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {primaryHazard.title || primaryHazard.event || 'Severe Route Disruption'}
                {primaryHazard.distance_from_corridor_km !== undefined && (
                  <span className="text-red-200 font-normal text-xs ml-2">
                    (~{Number(primaryHazard.distance_from_corridor_km).toFixed(1)} km from route)
                  </span>
                )}
              </div>
              <p className="text-xs text-red-100 line-clamp-1 max-w-xl">
                {primaryHazard.description || primaryHazard.instruction || 'Extreme caution advised. Debris or water hazard blocking roadway.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onTriggerReroute && (
              <button
                onClick={onTriggerReroute}
                className="px-3.5 py-1.5 rounded-lg bg-white text-red-700 hover:bg-red-50 font-bold text-xs shadow-md transition flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reroute to Safest Bypass
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. OFF-ROUTE AUTO-RECALCULATION ALERT BANNER */}
      {isOffRoute && (
        <div className="pointer-events-auto bg-amber-500/95 text-slate-950 rounded-xl p-3 shadow-xl flex items-center justify-between border border-amber-300 animate-bounce">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-slate-950" />
            <div>
              <span className="font-bold text-xs tracking-wide uppercase">OFF ROUTE DETECTED</span>
              <span className="text-xs ml-2 font-medium">
                Corridor displacement: {offRouteDistanceMeters ? `${Math.round(offRouteDistanceMeters)}m` : 'outside buffer'}.
              </span>
            </div>
          </div>
          {onTriggerReroute && (
            <button
              onClick={onTriggerReroute}
              className="px-3 py-1 bg-slate-950 text-amber-400 font-bold text-xs rounded-lg hover:bg-slate-900 transition flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Recalculate Route Now
            </button>
          )}
        </div>
      )}

      {/* 3. PRIMARY GOOGLE MAPS STYLE NAVIGATION TOP CARD */}
      <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-black tracking-wider text-cyan-300 uppercase font-mono">
              {getModeTitle(travelMode)}
            </span>
          </div>
          {isPedestrianBike && (
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px] border border-emerald-800 font-bold">
              ZERO FUEL • ZERO TOLL
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* A. Turn Instruction & Next Manoeuvre (Cols 1-7) */}
          <div className="md:col-span-7 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/10">
              {getManeuverIcon(nextStep?.modifier, nextStep?.type)}
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-white font-mono">
                  {distanceToNextStepMeters != null ? formatDist(distanceToNextStepMeters) : '—'}
                </span>
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                  Next Step
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">
                {nextStep?.instruction || getDefaultGuidance(travelMode)}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                <span className="text-slate-300 font-medium">{currentRoadName}</span>
              </div>
            </div>
          </div>

          {/* B. Live Telemetry: Speed, Heading, Accuracy (Cols 8-12) */}
          <div className="md:col-span-5 flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-4">
            
            {/* Real Digital Speedometer */}
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-end gap-1">
                <Gauge className="w-3 h-3 text-cyan-400" />
                <span>Current Speed</span>
              </div>
              <div className="text-2xl font-black font-mono text-white leading-tight mt-0.5">
                {(isStationary || (speedSource as string) === 'STATIONARY' || speedKmh === 0) ? (
                  <>
                    <span className="text-emerald-400">0</span>
                    <span className="text-xs text-slate-400 font-normal ml-1">km/h</span>
                  </>
                ) : (speedKmh !== null && speedKmh !== undefined && speedKmh > 0) ? (
                  <>
                    <span className="text-cyan-300">{Math.round(speedKmh)}</span>
                    <span className="text-xs text-slate-400 font-normal ml-1">km/h</span>
                  </>
                ) : (
                  <div className="flex flex-col items-end">
                    <span className="text-slate-400">--</span>
                    <span className="text-[9px] text-amber-400 uppercase font-bold tracking-wider">
                      {gpsStatus === 'DENIED'
                        ? 'PERMISSION REQUIRED'
                        : (gpsStatus === 'REQUESTING' || gpsStatus === 'REQUESTING_PERMISSION' || gpsStatus === 'ACQUIRING' || gpsStatus === 'IDLE')
                          ? 'ACQUIRING GPS'
                          : gpsStatus === 'WEAK'
                            ? 'GPS SIGNAL WEAK'
                            : 'ACQUIRING GPS'}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[9px] font-mono mt-0.5 flex flex-col items-end gap-0.5">
                {(isStationary || (speedSource as string) === 'STATIONARY' || speedKmh === 0) ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold">
                    ● STATIONARY
                  </span>
                ) : (speedSource === 'DEVICE_GPS' || speedSource === 'LIVE GPS' || speedSource === 'LIVE_GPS') ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold">
                    ● LIVE GPS
                  </span>
                ) : (speedSource === 'CALCULATED_GPS' || speedSource === 'CALCULATED GPS' || speedSource === 'CALCULATED FROM GPS' || speedSource === 'CALCULATED_FROM_GPS') ? (
                  <span className="px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/80 font-bold">
                    ● GPS CALCULATED
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {reasonUnavailable || 'LOCATING DEVICE...'}
                  </span>
                )}
              </div>
            </div>

            {/* Heading, GPS Status & Accuracy */}
            <div className="text-right pl-3 border-l border-slate-800 space-y-0.5">
              <div className="text-[10px] font-mono font-bold flex items-center justify-end gap-1">
                {gpsStatus === 'DENIED' ? (
                  <span className="text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800">
                    GPS: PERMISSION REQUIRED
                  </span>
                ) : (gpsStatus === 'REQUESTING' || gpsStatus === 'REQUESTING_PERMISSION' || gpsStatus === 'ACQUIRING') ? (
                  <span className="text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800 animate-pulse">
                    GPS: ACQUIRING...
                  </span>
                ) : gpsStatus === 'WEAK' ? (
                  <span className="text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                    GPS: SIGNAL WEAK
                  </span>
                ) : gpsStatus === 'UNAVAILABLE' ? (
                  <span className="text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                    GPS: SIGNAL UNAVAILABLE
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    GPS: LIVE
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Accuracy: {gpsAccuracyMeters ? `±${Math.round(gpsAccuracyMeters)}m` : 'Acquiring...'}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                <Compass className="w-3 h-3 text-emerald-400" />
                <span>Heading: {getHeadingCardinal(headingDeg)}</span>
              </div>
            </div>


            {/* Route Status Pill */}
            <div className="pl-2">
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase border flex items-center gap-1 ${
                isOffRoute
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOffRoute ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                {isOffRoute ? 'OFF ROUTE' : 'ON ROUTE'}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar if total distance known */}
        {progressPct !== null && (
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* C. Bottom Trip Summary Ribbon */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">ETA:</span>
              <strong className="text-white font-mono text-sm">{etaFormatted}</strong>
            </div>

            <div className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Remaining:</span>
              <strong className="text-white font-mono">{remainingDistanceKm.toFixed(1)} km</strong>
            </div>

            {progressPct !== null && (
              <div className="hidden sm:flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                <span>Progress:</span>
                <strong className="text-cyan-300">{progressPct}%</strong>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-1.5 text-slate-400 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Strategy:</span>
              <span className="text-cyan-300 capitalize font-medium">{activeStrategy}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onReportDisaster && (
              <button
                onClick={onReportDisaster}
                className="px-2.5 py-1 bg-red-950/70 text-red-300 hover:bg-red-900 border border-red-800 rounded-lg text-xs font-semibold transition flex items-center gap-1"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Report Hazard
              </button>
            )}

            <button
              onClick={() => setMuted(!muted)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              title={muted ? 'Unmute Audio Guidance' : 'Mute Audio Guidance'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
            </button>

            <button
              onClick={onStopNavigation}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5 active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
              Exit Navigation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationHUD;
