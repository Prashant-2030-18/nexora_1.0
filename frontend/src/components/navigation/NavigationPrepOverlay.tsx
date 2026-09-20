import React from 'react';
import { CheckCircle2, Loader2, Navigation, X } from 'lucide-react';
import { NavigationLifecycleState } from '../../context/NavigationContext';

interface NavigationPrepOverlayProps {
  state: NavigationLifecycleState;
  onCancel: () => void;
  gpsAccuracy?: number | null;
}

export const NavigationPrepOverlay: React.FC<NavigationPrepOverlayProps> = ({
  state,
  onCancel,
  gpsAccuracy,
}) => {
  if (state === 'IDLE' || state === 'ACTIVE' || state === 'REROUTING' || state === 'ENDED') {
    return null;
  }

  const isGpsDone = state === 'INITIALIZING_MAP' || state === 'READY';
  const isMapDone = state === 'READY';

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-sky-500/40 rounded-3xl p-6 shadow-2xl shadow-sky-950/60 text-white flex flex-col items-center text-center">
        {/* Animated Navigation Icon */}
        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4 shadow-lg shadow-sky-500/10">
          <Navigation className="w-7 h-7 animate-pulse text-sky-400" />
        </div>

        <h3 className="text-base font-black tracking-tight text-white uppercase">
          {state === 'READY' ? 'Navigation Ready' : 'Preparing Navigation'}
        </h3>
        <p className="text-xs text-slate-300 mt-1 mb-5">
          Initializing live corridor guidance and GPS sensors...
        </p>

        {/* Step-by-step checklist */}
        <div className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3 mb-6 text-left">
          {/* Step 1: Route Validated */}
          <div className="flex items-center gap-3 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-200 font-semibold">Route & Corridor Validated</span>
          </div>

          {/* Step 2: GPS Permission & Acquisition */}
          <div className="flex items-center gap-3 text-xs">
            {isGpsDone ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-slate-200 font-semibold">
                {isGpsDone ? 'Phone GPS Signal Acquired' : 'Acquiring GPS Signal...'}
              </span>
              {gpsAccuracy !== null && gpsAccuracy !== undefined && (
                <span className="ml-1 text-[11px] font-mono text-cyan-400 font-bold">
                  (±{Math.round(gpsAccuracy)}m)
                </span>
              )}
            </div>
          </div>

          {/* Step 3: Navigation Map Engine */}
          <div className="flex items-center gap-3 text-xs">
            {isMapDone ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : isGpsDone ? (
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
            )}
            <span className="text-slate-200 font-semibold">
              {isMapDone ? 'Navigation Map Ready' : 'Initializing Map Engine...'}
            </span>
          </div>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancel}
          className="py-2.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel Preparation</span>
        </button>
      </div>
    </div>
  );
};
