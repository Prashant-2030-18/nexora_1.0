import React from 'react';
import {
  ArrowUp, ArrowUpRight, ArrowUpLeft, CornerUpRight, CornerUpLeft,
  RotateCcw, CheckCircle2, MapPin, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

const getManeuverIcon = (modifier?: string, type?: string, size = "w-9 h-9") => {
  const m = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();

  if (t.includes('arrive') || t.includes('destination')) {
    return <CheckCircle2 className={`${size} text-emerald-400`} />;
  }
  if (m.includes('u-turn') || m.includes('uturn')) {
    return <RotateCcw className={`${size} text-cyan-400`} />;
  }
  if (m.includes('slight right') || m.includes('bear right')) {
    return <ArrowUpRight className={`${size} text-cyan-400`} />;
  }
  if (m.includes('slight left') || m.includes('bear left')) {
    return <ArrowUpLeft className={`${size} text-cyan-400`} />;
  }
  if (m.includes('right') || m.includes('sharp right')) {
    return <CornerUpRight className={`${size} text-cyan-400`} />;
  }
  if (m.includes('left') || m.includes('sharp left')) {
    return <CornerUpLeft className={`${size} text-cyan-400`} />;
  }
  return <ArrowUp className={`${size} text-cyan-400`} />;
};

const formatDistance = (meters: number | null): string => {
  if (meters === null || meters === undefined) return '—';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
};

export const NavigationManeuverCard: React.FC = () => {
  const {
    currentStep,
    nextStep,
    distanceToNextStepMeters,
    currentRoadName,
    isOffRoute,
    offRouteDistanceMeters,
    hasArrived,
  } = useNavigation();

  if (hasArrived) {
    return (
      <div className="w-full max-w-xl mx-auto bg-emerald-950/95 backdrop-blur-md border border-emerald-500/70 rounded-3xl p-4 shadow-2xl text-white flex items-center gap-3.5 animate-in fade-in">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-base font-black uppercase tracking-wider text-emerald-300">
            You Have Arrived
          </h2>
          <p className="text-xs text-slate-300">
            Destination corridor reached safely.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-1.5 animate-in fade-in select-none">
      
      {/* Off-Route Alert Ribbon */}
      {isOffRoute && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 rounded-2xl shadow-xl flex items-center justify-between font-bold text-xs border border-amber-300 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>OFF ROUTE ({offRouteDistanceMeters}m outside corridor)</span>
          </div>
          <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-950 text-amber-300 px-2 py-0.5 rounded-lg">
            <RefreshCw className="w-3 h-3 animate-spin" />
            RECALCULATING...
          </span>
        </div>
      )}

      {/* Primary Maneuver Card */}
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl p-4 text-white">
        <div className="flex items-center gap-4">
          
          {/* Turn Icon Container */}
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10">
            {getManeuverIcon(currentStep?.modifier, currentStep?.type, "w-10 h-10")}
          </div>

          {/* Maneuver Instruction & Distance */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono tracking-tight text-white">
                {formatDistance(distanceToNextStepMeters)}
              </span>
              <span className="text-xs uppercase font-bold tracking-widest text-cyan-400">
                Next Turn
              </span>
            </div>

            <div className="text-sm sm:text-base font-bold text-slate-100 truncate mt-0.5">
              {currentStep?.instruction || 'Continue straight along the corridor'}
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate mt-1">
              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-300 font-medium truncate">{currentRoadName}</span>
            </div>
          </div>
        </div>

        {/* Secondary Upcoming Maneuver Preview */}
        {nextStep && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-300">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
              THEN
            </span>
            <div className="flex items-center gap-1.5 truncate text-slate-200 font-medium">
              <span className="text-cyan-400 shrink-0">
                {getManeuverIcon(nextStep.modifier, nextStep.type, "w-4 h-4")}
              </span>
              <span className="truncate">{nextStep.instruction}</span>
              {nextStep.road_name && nextStep.road_name !== 'ROAD UNAVAILABLE' && (
                <span className="text-slate-400 text-[11px] truncate">({nextStep.road_name})</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
