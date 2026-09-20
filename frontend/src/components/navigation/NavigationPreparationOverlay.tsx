import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Loader2,
  Navigation,
  X,
  AlertTriangle,
  RotateCw,
  Compass,
  MapPinOff,
  Eye,
} from 'lucide-react';
import { NavigationLifecycleState } from '../../context/NavigationContext';
import { GPSQuality } from '../../context/GPSContext';

export interface NavigationPreparationOverlayProps {
  state: NavigationLifecycleState;
  onCancel: () => void;
  gpsAccuracy?: number | null;
  gpsQuality?: GPSQuality | null;
  gpsError?: {
    code: 'PERMISSION_DENIED' | 'GPS_UNAVAILABLE' | 'TIMEOUT' | 'INSECURE_CONTEXT' | string;
    message: string;
    recentFix?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: number;
    } | null;
  } | null;
  onRetryGps?: () => void;
  onStartAnyway?: () => void;
  onStartRoutePreview?: () => void;
  onUseRecentFix?: (fix: { latitude: number; longitude: number; accuracy: number; timestamp: number }) => void;
  originLabel?: string;
  destinationLabel?: string;
  isStartingAnyway?: boolean;
  gpsOverrideAccepted?: boolean;
  mapEngineFailed?: boolean;
  onRetryMapInit?: () => void;
  isGpsStale?: boolean;
  onRefreshGps?: () => void;
}

export const NavigationPreparationOverlay: React.FC<NavigationPreparationOverlayProps> = ({
  state,
  onCancel,
  gpsAccuracy,
  gpsQuality,
  gpsError,
  onRetryGps,
  onStartAnyway,
  onStartRoutePreview,
  onUseRecentFix,
  originLabel,
  destinationLabel,
  isStartingAnyway = false,
  gpsOverrideAccepted = false,
  mapEngineFailed = false,
  onRetryMapInit,
  isGpsStale = false,
  onRefreshGps,
}) => {
  const [mounted, setMounted] = useState(false);
  const hasAdvancedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset auto-advance flag when state returns to IDLE or CANCELLED
  useEffect(() => {
    if (state === 'IDLE' || state === 'CANCELLED' || state === 'ENDED') {
      hasAdvancedRef.current = false;
    }
  }, [state]);

  // Auto-advance to active navigation quickly (0.2s) when no blocking error exists
  useEffect(() => {
    if (state === 'ACTIVE' || state === 'IDLE' || state === 'ENDED') {
      return;
    }

    if (
      !gpsError &&
      !hasAdvancedRef.current &&
      !isStartingAnyway &&
      onStartAnyway
    ) {
      hasAdvancedRef.current = true;
      const t = setTimeout(() => {
        onStartAnyway();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [gpsError, gpsAccuracy, state, onStartAnyway, isStartingAnyway]);

  // Auto-advance if map engine failed notice triggered
  useEffect(() => {
    if (mapEngineFailed && onStartAnyway && !hasAdvancedRef.current) {
      hasAdvancedRef.current = true;
      const t = setTimeout(() => {
        onStartAnyway();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [mapEngineFailed, onStartAnyway]);

  // Only render during preparation and initialization lifecycle states (never during ACTIVE)
  const isPreparationActive =
    state !== 'ACTIVE' &&
    state !== 'IDLE' &&
    state !== 'ENDED' &&
    (state === 'VALIDATING_ROUTE' ||
      state === 'CHECKING_PERMISSION' ||
      state === 'ACQUIRING_LOCATION' ||
      state === 'GPS_ACCEPTED' ||
      state === 'INITIALIZING_NAV_MAP' ||
      state === 'LOADING_HAZARDS' ||
      state === 'PREPARING' ||
      state === 'ACQUIRING_GPS' ||
      state === 'INITIALIZING_MAP' ||
      state === 'READY');

  if (!mounted || !isPreparationActive) {
    return null;
  }

  const isGpsAcquiring =
    !gpsOverrideAccepted &&
    (state === 'CHECKING_PERMISSION' ||
      state === 'ACQUIRING_LOCATION' ||
      state === 'ACQUIRING_GPS' ||
      state === 'PREPARING');

  const isGpsDone =
    gpsOverrideAccepted ||
    (!isGpsAcquiring &&
      (state === 'GPS_ACCEPTED' ||
        state === 'INITIALIZING_NAV_MAP' ||
        state === 'INITIALIZING_MAP' ||
        state === 'LOADING_HAZARDS' ||
        state === 'READY'));

  const isMapInitializing =
    state === 'INITIALIZING_NAV_MAP' || state === 'INITIALIZING_MAP';
  const isMapDone = state === 'READY';
  const isHazardsDone = true; // Non-blocking, cached SACHET ready

  const overlayContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Starting Live Navigation"
      style={{ zIndex: 10000 }}
      className="fixed inset-0 w-screen h-[100dvh] bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-200 pointer-events-auto"
    >
      <div className="w-full max-w-md bg-slate-900/95 border border-sky-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-sky-950/80 text-white flex flex-col items-center text-center relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent blur-sm" />

        {/* Branding & Logo */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
            <Compass className="w-4 h-4 text-sky-400 animate-spin-slow" />
          </div>
          <span className="text-xs font-black tracking-widest text-sky-400 font-mono uppercase">
            NEXORA INTELLIGENCE
          </span>
        </div>

        {/* Animated Main Icon */}
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-3 shadow-xl shadow-sky-500/10 relative">
          <Navigation className="w-8 h-8 text-sky-400 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500" />
          </span>
        </div>

        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white uppercase">
          {gpsError
            ? 'Location Required'
            : state === 'READY'
            ? 'Starting Live Navigation...'
            : 'Starting Live Navigation'}
        </h2>

        {originLabel && destinationLabel && (
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-xs">
            {originLabel.split(',')[0]} ➔ {destinationLabel.split(',')[0]}
          </p>
        )}

        <p className="text-xs text-slate-300 mt-1 mb-5">
          {gpsError
            ? 'Enable device location to begin turn-by-turn guidance, or preview the route.'
            : state === 'READY'
            ? 'Opening live guidance map...'
            : isGpsAcquiring
            ? 'Connecting GPS satellites and refining accuracy...'
            : 'Launching navigation experience...'}
        </p>

        {/* Step-by-Step Checklist */}
        {!gpsError && (
          <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 mb-5 text-left shadow-inner">
            {/* Stage 1: Route & Corridor Validated */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-semibold">Route & Corridor Validated</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800">
                READY
              </span>
            </div>

            {/* Stage 2: Navigation Map Engine */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-semibold">Navigation Map Engine</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800">
                READY
              </span>
            </div>

            {/* Stage 3: Disaster Intelligence (SACHET) */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-semibold">Disaster Intelligence (SACHET)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800">
                CACHED
              </span>
            </div>

            {/* Stage 4: GPS Sensor Connection (Spec §33 & §34) */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {gpsAccuracy !== null && gpsAccuracy !== undefined ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                )}
                <div className="truncate text-left">
                  <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                    <span>
                      {gpsAccuracy !== null && gpsAccuracy !== undefined
                        ? gpsAccuracy <= 50
                          ? 'GPS Connected'
                          : 'GPS Signal Available'
                        : 'Acquiring GPS Signal...'}
                    </span>
                    {gpsAccuracy !== null && gpsAccuracy !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                          gpsAccuracy <= 15
                            ? 'text-emerald-400 bg-emerald-950/70 border-emerald-700'
                            : gpsAccuracy <= 50
                            ? 'text-sky-400 bg-sky-950/70 border-sky-700'
                            : 'text-amber-300 bg-amber-950/70 border-amber-700'
                        }`}
                      >
                        ±{Math.round(gpsAccuracy)}m {gpsAccuracy > 50 ? 'LOW' : 'GOOD'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    {gpsAccuracy !== null && gpsAccuracy !== undefined
                      ? 'Refining precision continuously in background...'
                      : 'Connecting to device location service...'}
                  </div>
                </div>
              </div>

              <span className="text-[10px] font-mono shrink-0 ml-2">
                {gpsAccuracy !== null && gpsAccuracy !== undefined ? (
                  <span className="text-emerald-400 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800">
                    LIVE
                  </span>
                ) : (
                  <span className="text-sky-400">CONNECTING</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Actionable Error Panels ONLY when GPS is actually unusable (Spec §2) */}
        {gpsError && (
          <div className="w-full mb-5 p-4 rounded-2xl bg-amber-950/60 border border-amber-500/60 text-left text-xs space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <MapPinOff className="w-5 h-5 shrink-0 text-amber-400" />
              <span className="text-sm">
                {gpsError.code === 'PERMISSION_DENIED'
                  ? 'Location Permission Required'
                  : gpsError.code === 'GPS_UNAVAILABLE' || gpsError.code === 'POSITION_UNAVAILABLE'
                  ? 'Device Location Unavailable'
                  : 'GPS Signal Unavailable'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {gpsError.message || 'Please enable device location to start live GPS turn-by-turn guidance.'}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              {onRetryGps && (
                <button
                  type="button"
                  onClick={onRetryGps}
                  className="w-full sm:w-auto flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold font-mono transition text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>ENABLE LOCATION</span>
                </button>
              )}
              {onStartRoutePreview && (
                <button
                  type="button"
                  onClick={onStartRoutePreview}
                  className="w-full sm:w-auto flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white rounded-xl font-bold font-mono transition text-xs border border-amber-500/40 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>ROUTE PREVIEW (GPS OFF)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Actions: Start Navigation Now & Cancel Button Always Available */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2.5">
          {onStartAnyway && !gpsError && (
            <button
              type="button"
              onClick={onStartAnyway}
              className="w-full sm:flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 font-mono shadow-lg shadow-emerald-500/20"
            >
              <Navigation className="w-4 h-4" />
              <span>START NAVIGATION NOW</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className={`w-full ${onStartAnyway && !gpsError ? 'sm:w-auto' : ''} py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 font-mono`}
          >
            <X className="w-4 h-4" />
            <span>CANCEL NAVIGATION</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
};
