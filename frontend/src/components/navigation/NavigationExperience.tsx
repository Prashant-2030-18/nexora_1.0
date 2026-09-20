import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation, Maximize2, Minimize2, X, AlertTriangle, RotateCcw,
  Compass, ShieldAlert, Bot, Layers, Sparkles, Activity, MapPinOff, CheckCircle2
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { useGPS } from '../../context/GPSContext';
import { NavigationMapProvider } from './NavigationMapProvider';
import { NavigationErrorBoundary } from './NavigationErrorBoundary';
import { ReportDisasterModal } from '../ReportDisasterModal';
import { TravelMode } from '../../types';
import { RealRouteResponse } from '../../pages/SmartRoutePlanner';

interface NavigationExperienceProps {
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
  onReportDisasterSuccess?: (newRep: any) => void;
  onOpenCopilot?: (query?: string) => void;
  riskScore?: number;
}

export const NavigationExperience: React.FC<NavigationExperienceProps> = ({
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
  onReportDisasterSuccess,
  onOpenCopilot,
  riskScore = 15,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [activeProviderName, setActiveProviderName] = useState<string>('Map Engine');

  const {
    navigationState,
    setNavigationState,
    isBasic2DMode,
    setIsBasic2DMode,
    fallbackNotice,
    dismissFallbackNotice,
    isRoutePreview,
    onMapReady,
    onMapError,
    navigationError,
    setNavigationError,
  } = useNavigation();

  const { gps, debugTelemetry } = useGPS();
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [showGpsQualityBanner, setShowGpsQualityBanner] = useState<boolean>(false);
  const [gpsBannerInfo, setGpsBannerInfo] = useState<{ title: string; subtitle: string; isGood: boolean } | null>(null);
  const hadLowGpsRef = useRef<boolean>(false);

  // Measure container dimensions continuously via ResizeObserver to guarantee non-zero height/width
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        setContainerDimensions({ width: w, height: h });
        console.log(`[NAV_EXP] Container dimensions: ${w}x${h}`);
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Auto-dismiss non-blocking fallback notice after 6 seconds
  useEffect(() => {
    if (!fallbackNotice) return;
    const t = setTimeout(() => {
      dismissFallbackNotice();
    }, 6000);
    return () => clearTimeout(t);
  }, [fallbackNotice, dismissFallbackNotice]);

  // Dynamic GPS Quality Banner (Spec §19)
  // Shows compact banner when accuracy is poor (> 50m).
  // Automatically switches to GOOD when accuracy improves (<= 25m), then fades out after 3.5s.
  useEffect(() => {
    if (isRoutePreview) return;
    const acc = gps.accuracy;
    if (acc !== null && acc !== undefined) {
      if (acc > 50) {
        hadLowGpsRef.current = true;
        setGpsBannerInfo({
          title: `GPS ACCURACY LOW — ±${Math.round(acc)}m`,
          subtitle: 'Position will improve as a better fix becomes available.',
          isGood: false,
        });
        setShowGpsQualityBanner(true);
      } else if (acc <= 25 && hadLowGpsRef.current) {
        setGpsBannerInfo({
          title: `GPS ACCURACY GOOD — ±${Math.round(acc)}m`,
          subtitle: 'High precision fix active.',
          isGood: true,
        });
        setShowGpsQualityBanner(true);
        const t = setTimeout(() => {
          setShowGpsQualityBanner(false);
          hadLowGpsRef.current = false;
        }, 3500);
        return () => clearTimeout(t);
      }
    }
  }, [gps.accuracy, isRoutePreview]);

  // Fullscreen API toggle with graceful CSS expanded fallback
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        } else {
          setIsFullscreen(prev => !prev);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('[NAV_EXP] Fullscreen toggle failed:', err);
      setIsFullscreen(prev => !prev);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleCopilotAsk = (promptQuery?: string) => {
    const query = promptQuery || `Give me an active corridor status update for ${origin} to ${destination} via ${travelMode}.`;
    if (onOpenCopilot) {
      onOpenCopilot(query);
    } else {
      setCopilotAnswer(
        `NEXORA Copilot Telemetry:\n- Route: ${origin} ➔ ${destination}\n- Mode: ${travelMode.toUpperCase()}\n- GPS Speed: ${gps.isStationary ? '0 km/h (Stationary)' : `${Math.round(gps.currentSpeedKmh || 0)} km/h`}\n- Corridor Status: Active monitoring via SACHET NDMA CAP XML.`
      );
    }
  };

  const activeProfile = routeResult?.routes?.[selectedStrategy] || routeResult?.routes?.fastest;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] w-screen h-screen h-[100dvh] bg-slate-950 flex flex-col overflow-hidden font-sans select-none"
    >
      {/* Top Floating Control Bar: Route Title, Fullscreen, and Exit Button */}
      <div className="absolute top-2 left-4 right-4 z-40 pointer-events-none flex items-center justify-between gap-3">
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3.5 py-1.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs text-white">
          <div className={`w-2.5 h-2.5 rounded-full ${isRoutePreview ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="font-bold text-slate-200 truncate max-w-[200px] sm:max-w-xs">
            {origin || 'Origin'} ➔ {destination || 'Destination'}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-950 text-sky-300 border border-sky-700 uppercase">
            {travelMode}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-700 uppercase font-semibold">
            {activeProviderName}
          </span>
          {isRoutePreview && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-700 uppercase font-semibold">
              PREVIEW (GPS OFF)
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Diagnostics Telemetry Toggle */}
          <button
            onClick={() => setShowDiagnostics(prev => !prev)}
            title="GPS & Engine Diagnostics"
            className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-sky-400 border border-slate-700/80 flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Primary Explicit Exit Navigation Button */}
          <button
            onClick={onEndNavigation}
            title="Exit Navigation (Return to Planner)"
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center gap-1.5 text-xs font-bold transition shadow-lg cursor-pointer font-mono"
          >
            <X className="w-4 h-4" />
            <span>EXIT NAVIGATION</span>
          </button>
        </div>
      </div>

      {/* Dynamic GPS Quality Banner (Spec §19) */}
      {showGpsQualityBanner && gpsBannerInfo && (
        <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-in fade-in slide-in-from-top-2 border ${
          gpsBannerInfo.isGood
            ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200'
            : 'bg-amber-950/90 border-amber-500/80 text-amber-200'
        }`}>
          {gpsBannerInfo.isGood ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <div>
            <div>{gpsBannerInfo.title}</div>
            <div className="text-[10px] font-normal opacity-85">{gpsBannerInfo.subtitle}</div>
          </div>
          <button
            onClick={() => setShowGpsQualityBanner(false)}
            className="ml-2 text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
            title="Dismiss GPS notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Non-Blocking Fallback Notice Toast (Spec §42) */}
      {fallbackNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-amber-500/80 text-amber-200 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{fallbackNotice}</span>
          <button
            type="button"
            onClick={dismissFallbackNotice}
            className="ml-2 text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Map Presentation Layer wrapped in Error Boundary */}
      <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden">
        <NavigationErrorBoundary
          onReturnToPlanner={onEndNavigation}
          onSwitchTo2D={() => setIsBasic2DMode(true)}
          onRetry={() => {
            setIsBasic2DMode(false);
            setNavigationState('INITIALIZING_MAP');
          }}
        >
          <NavigationMapProvider
            routeResult={routeResult}
            selectedStrategy={selectedStrategy}
            origin={origin}
            destination={destination}
            travelMode={travelMode}
            districts={districts}
            incidents={incidents}
            disasters={disasters}
            userDisasters={userDisasters}
            onEndNavigation={onEndNavigation}
            onTriggerReroute={onTriggerReroute}
            onReportDisaster={() => setIsReportModalOpen(true)}
            onOpenCopilot={() => handleCopilotAsk()}
            riskScore={activeProfile?.risk_score ?? riskScore}
            onProviderChange={setActiveProviderName}
          />
        </NavigationErrorBoundary>
      </div>

      {/* Report Disaster Modal during Navigation */}
      <ReportDisasterModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        selectedCoordinates={gps.latitude && gps.longitude ? { lat: gps.latitude, lng: gps.longitude } : null}
        isPickingOnMap={false}
        onSuccess={(newRep) => {
          if (onReportDisasterSuccess) onReportDisasterSuccess(newRep);
          setIsReportModalOpen(false);
        }}
      />

      {/* Inline AI Copilot Response Card */}
      {copilotAnswer && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10001] w-[90vw] max-w-md bg-slate-900/95 backdrop-blur-xl border border-sky-500/60 rounded-3xl p-4 shadow-2xl text-xs text-white space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-bold text-sky-400 flex items-center gap-1.5 font-mono">
              <Bot className="w-4 h-4 text-sky-400" />
              NEXORA Copilot Telemetry
            </span>
            <button
              onClick={() => setCopilotAnswer(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-200 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
            {copilotAnswer}
          </p>
        </div>
      )}

      {/* GPS Diagnostics Telemetry Modal (Spec §35) */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl text-white space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold font-mono text-sm tracking-wide">GPS & ENGINE DIAGNOSTICS</h3>
              </div>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Fix Quality</div>
                <div className="text-base font-black text-sky-400">{gps.gpsQuality || 'UNKNOWN'}</div>
                <div className="text-[11px] text-slate-300">Accuracy: ±{gps.accuracy ? Math.round(gps.accuracy) : '--'}m</div>
                <div className="text-[10px] text-slate-500">Status: {gps.gpsStatus}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Speed Telemetry</div>
                <div className="text-base font-black text-emerald-400">
                  {gps.isStationary ? '0 km/h' : gps.currentSpeedKmh !== null ? `${Math.round(gps.currentSpeedKmh)} km/h` : '--'}
                </div>
                <div className="text-[11px] text-slate-300">Source: {gps.speedSource || 'N/A'}</div>
                <div className="text-[10px] text-slate-500">{gps.isStationary ? 'STATIONARY (<0.35 m/s)' : 'IN MOTION'}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Coordinates</div>
                <div className="text-[11px] text-slate-200 truncate">Lat: {gps.latitude?.toFixed(6) ?? '--'}</div>
                <div className="text-[11px] text-slate-200 truncate">Lon: {gps.longitude?.toFixed(6) ?? '--'}</div>
                <div className="text-[10px] text-slate-500">Heading: {gps.heading !== null && gps.heading !== undefined ? `${Math.round(gps.heading)}°` : 'N/A'}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Navigation Engine</div>
                <div className="text-[11px] text-sky-300 font-semibold">{isBasic2DMode ? 'Leaflet 2D Engine' : 'MapLibre 3D Engine'}</div>
                <div className="text-[11px] text-slate-300">Mode: {travelMode.toUpperCase()}</div>
                <div className="text-[10px] text-slate-500">{isRoutePreview ? 'Route Preview (GPS Off)' : 'Active GPS Tracking'}</div>
              </div>
            </div>

            {/* Engine Fix Pipeline Telemetry */}
            {debugTelemetry && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1.5">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Engine Processing Pipeline</div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Raw GPS Accuracy:</span>
                  <span className="font-bold">±{debugTelemetry.rawAccuracy ? Math.round(debugTelemetry.rawAccuracy) : '--'}m</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Quality Filter:</span>
                  <span className="text-emerald-400 font-semibold">{debugTelemetry.filtered ? 'SMOOTHED / BEST-FIX' : 'DIRECT'}</span>
                </div>
                {debugTelemetry.snapDeltaM !== undefined && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Route Snap Delta:</span>
                    <span className="text-sky-400 font-bold">{debugTelemetry.snapDeltaM.toFixed(1)}m</span>
                  </div>
                )}
                {debugTelemetry.rejectedReason && (
                  <div className="text-amber-400 text-[10px] bg-amber-950/40 p-1.5 rounded border border-amber-900/60">
                    Rejected sample: {debugTelemetry.rejectedReason}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowDiagnostics(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer font-mono"
              >
                CLOSE DIAGNOSTICS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
