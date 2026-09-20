import React from 'react';
import { Compass, MapPin, Navigation, X } from 'lucide-react';

interface RouteMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocationName?: string;
  currentCoords: [number, number]; // [lat, lng]
  plannedOriginName: string;
  differenceKm: number;
  onStartFromCurrentLocation: () => void;
  onKeepPlannedOrigin: () => void;
}

export const RouteMismatchDialog: React.FC<RouteMismatchDialogProps> = ({
  isOpen,
  onClose,
  currentLocationName,
  currentCoords,
  plannedOriginName,
  differenceKm,
  onStartFromCurrentLocation,
  onKeepPlannedOrigin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden p-5 text-white space-y-4">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-white">
                Start From Current Location?
              </h3>
              <p className="text-xs text-slate-400">
                GPS detects you are away from route origin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comparison Details */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-mono">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Your Device Position:
            </span>
            <span className="font-bold text-white text-right truncate max-w-[200px]">
              {currentLocationName || `${currentCoords[0].toFixed(4)}, ${currentCoords[1].toFixed(4)}`}
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-mono">
              <Navigation className="w-3.5 h-3.5 text-sky-400" />
              Planned Route Origin:
            </span>
            <span className="font-bold text-slate-200 text-right truncate max-w-[200px]">
              {plannedOriginName}
            </span>
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <span className="text-slate-400 font-mono">Corridor Displacement:</span>
            <span className="font-bold font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700/60">
              ~{Math.round(differenceKm)} km away
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onStartFromCurrentLocation}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer uppercase tracking-wider"
          >
            <Navigation className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>Start From My Current Location (Recommended)</span>
          </button>

          <button
            onClick={onKeepPlannedOrigin}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-300 hover:text-white font-semibold rounded-2xl text-xs transition-colors border border-slate-700 cursor-pointer"
          >
            Keep Original Route ({plannedOriginName})
          </button>
        </div>
      </div>
    </div>
  );
};
