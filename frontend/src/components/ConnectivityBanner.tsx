/**
 * NEXORA Connectivity Banner
 * ===========================
 * Non-blocking global status strip showing connectivity and service states.
 * Compact by default, expandable on click.
 * Shows transition toasts (offline/reconnect/sync).
 *
 * Offline example strip:
 *   NETWORK ○ OFFLINE  GPS ● LIVE  ROUTE ● CACHED  SACHET ◐ CACHED·11min
 *   LOCAL 7 PENDING  SATELLITE ○ N/A
 *
 * Online example strip:
 *   NETWORK ● ONLINE  GPS ● LIVE  SACHET ● LIVE  SYNC ● UP TO DATE
 *   SMS ○ NOT CONFIGURED  SATELLITE ○ UNKNOWN
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectivity, ConnectionState } from '../context/ConnectivityContext';
import { useGPS } from '../context/GPSContext';
import {
  Wifi, WifiOff, Navigation, Map, AlertTriangle, Radio, Route, ArrowRight,
  MessageSquare, Satellite, RefreshCw, CheckCircle, X, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Dot indicator ─────────────────────────────────────────────────────────────
const Dot = ({ color }: { color: 'green' | 'yellow' | 'red' | 'gray' | 'half' }) => {
  const cls: Record<string, string> = {
    green: 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse',
    yellow: 'w-2 h-2 rounded-full bg-amber-400 animate-pulse',
    red: 'w-2 h-2 rounded-full bg-red-500',
    gray: 'w-2 h-2 rounded-full bg-slate-600',
    half: 'w-2 h-2 rounded-full bg-amber-400/60',
  };
  return <span className={cls[color]} />;
};

// ── Toast component ───────────────────────────────────────────────────────────
interface ToastProps {
  type: 'offline' | 'reconnect' | 'sync_complete' | 'hazard';
  message: string;
  detail?: string;
  onDismiss: () => void;
}

function Toast({ type, message, detail, onDismiss }: ToastProps) {
  useEffect(() => {
    // Auto-dismiss after 8s for reconnect/sync, never for hazard
    if (type !== 'offline' && type !== 'hazard') {
      const t = setTimeout(onDismiss, 8000);
      return () => clearTimeout(t);
    }
  }, [type, onDismiss]);

  const borderCls =
    type === 'offline' ? 'border-amber-500/70 bg-amber-950/90' :
    type === 'hazard' ? 'border-red-500/70 bg-red-950/90' :
    'border-emerald-500/70 bg-emerald-950/90';

  const icon =
    type === 'offline' ? <WifiOff className="w-5 h-5 text-amber-400 shrink-0" /> :
    type === 'hazard' ? <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" /> :
    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl ${borderCls} animate-in fade-in slide-in-from-top-2`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm">{message}</p>
        {detail && <p className="text-xs text-slate-300 mt-0.5">{detail}</p>}
      </div>
      <button onClick={onDismiss} className="text-slate-400 hover:text-white ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main Banner Component ─────────────────────────────────────────────────────

export function ConnectivityBanner() {
  const {
    connectionState, browserOnline, backendReachable,
    latencyMs, syncQueueSize, lastSachetSync, satelliteState,
    syncProgress, isSyncing, getOfflineAgeMinutes,
  } = useConnectivity();
  const { gps, isTracking } = useGPS();
  const navigate = useNavigate();

  const [expanded, setExpanded] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; props: ToastProps }>>([]);
  const lastStateRef = useRef<ConnectionState>(connectionState);
  const offlineToastShownRef = useRef(false);
  const reconnectToastShownRef = useRef(false);

  const addToast = (props: Omit<ToastProps, 'onDismiss'>) => {
    const id = Math.random().toString(36).slice(2);
    const onDismiss = () => setToasts(prev => prev.filter(t => t.id !== id));
    setToasts(prev => [...prev, { id, props: { ...props, onDismiss } }]);
  };

  // Listen for connectivity events
  useEffect(() => {
    const handleOffline = () => {
      if (!offlineToastShownRef.current) {
        offlineToastShownRef.current = true;
        reconnectToastShownRef.current = false;
        addToast({
          type: 'offline',
          message: 'YOU ARE NOW OFFLINE',
          detail: 'GPS navigation remains active. Your journey and new reports will be stored securely on this device. NEXORA will synchronize automatically when connectivity returns.',
        });
      }
    };

    const handleReconnect = () => {
      offlineToastShownRef.current = false;
      if (!reconnectToastShownRef.current) {
        reconnectToastShownRef.current = true;
        addToast({
          type: 'reconnect',
          message: 'CONNECTION RESTORED',
          detail: 'Synchronizing offline data...',
        });
      }
    };

    window.addEventListener('nexora:went-offline', handleOffline);
    window.addEventListener('nexora:reconnected', handleReconnect);
    return () => {
      window.removeEventListener('nexora:went-offline', handleOffline);
      window.removeEventListener('nexora:reconnected', handleReconnect);
    };
  }, []);

  // Show sync complete toast
  useEffect(() => {
    if (connectionState === 'ONLINE' && lastStateRef.current === 'SYNCING') {
      addToast({
        type: 'reconnect',
        message: 'SYNC COMPLETE',
        detail: `Offline data synchronized. Latest disaster intelligence updated.`,
      });
    }
    lastStateRef.current = connectionState;
  }, [connectionState]);

  // ── Status dot colors ───────────────────────────────────────────────────────
  const networkDot: 'green' | 'yellow' | 'red' | 'gray' =
    connectionState === 'ONLINE' ? 'green' :
    connectionState === 'DEGRADED' ? 'yellow' :
    connectionState === 'SYNCING' ? 'yellow' :
    connectionState === 'RESTORING' ? 'yellow' : 'red';

  const gpsDot: 'green' | 'gray' =
    gps.latitude !== null && isTracking ? 'green' : 'gray';

  const offlineAgeMin = getOfflineAgeMinutes();

  // ── Status check ───────────────────────────────────────────────────────────
  const isOffline = connectionState === 'OFFLINE';
  const isDegraded = connectionState === 'DEGRADED';
  const isRestoring = connectionState === 'RESTORING';
  const isSyncingState = connectionState === 'SYNCING';

  const stripBg =
    isOffline ? 'bg-amber-950/95 border-amber-700/60' :
    isDegraded ? 'bg-amber-950/80 border-amber-700/50' :
    isSyncing ? 'bg-sky-950/95 border-sky-700/60' :
    'bg-slate-900/80 border-slate-700/50';

  return (
    <>
      {/* Top Offline Notification Banner */}
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-amber-950/95 border-b border-amber-600/60 p-3.5 sm:p-4 text-amber-200 shadow-xl transition-all duration-300 z-[1900] box-border"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 h-auto min-h-0 w-full overflow-hidden">
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0 mt-0.5 sm:mt-0">
                <WifiOff className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 text-xs sm:text-sm leading-relaxed whitespace-normal break-words text-amber-100">
                <span className="font-extrabold uppercase tracking-wide text-amber-300 mr-2">
                  OFFLINE MODE ACTIVE:
                </span>
                You are currently disconnected from network servers. NEXORA is operating seamlessly using cached spatial maps, IndexedDB route data, and local SACHET disaster intelligence. GPS tracking remains fully active.
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/routes')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition-all shadow-md shrink-0 w-full sm:w-auto cursor-pointer font-sans active:scale-95"
            >
              <Route className="w-4 h-4" />
              <span>Open Route Planner</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>
      )}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(t => <Toast key={t.id} {...t.props} />)}
      </div>

      {/* Compact status strip */}
      <div className={`fixed bottom-0 left-0 right-0 z-[100] border-t ${stripBg} backdrop-blur-sm`}>
        {/* Sync progress bar */}
        {isSyncing && syncProgress && (
          <div className="h-0.5 bg-slate-800">
            <div
              className="h-full bg-sky-400 transition-all"
              style={{ width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%` }}
            />
          </div>
        )}

        <div
          className="flex items-center justify-between px-3 py-1.5 cursor-pointer"
          onClick={() => setExpanded(e => !e)}
        >
          {/* Left: key status indicators */}
          <div className="flex items-center gap-3 text-[10px] font-mono font-bold uppercase tracking-wider overflow-x-auto no-scrollbar">
            {/* Network */}
            <span className="flex items-center gap-1 shrink-0">
              <Dot color={networkDot} />
              <span className={
                isOffline ? 'text-amber-300' :
                isDegraded ? 'text-amber-400' :
                isSyncingState ? 'text-sky-300' : 'text-emerald-400'
              }>
                {isOffline ? 'OFFLINE' :
                 isDegraded ? 'DEGRADED' :
                 isRestoring ? 'RESTORING' :
                 isSyncingState ? `SYNCING ${syncProgress ? `${syncProgress.done}/${syncProgress.total}` : '...'}` :
                 'ONLINE'}
              </span>
            </span>

            {/* GPS */}
            <span className="flex items-center gap-1 shrink-0">
              <Dot color={gpsDot} />
              <span className={gpsDot === 'green' ? 'text-emerald-400' : 'text-slate-500'}>
                GPS {gpsDot === 'green' ? '● LIVE' : '○ NO FIX'}
              </span>
            </span>

            {/* Route / SACHET */}
            {isOffline ? (
              <>
                <span className="flex items-center gap-1 shrink-0 text-sky-400">
                  <Dot color="green" />ROUTE ● CACHED
                </span>
                <span className="flex items-center gap-1 shrink-0 text-amber-400">
                  <Dot color="half" />
                  SACHET ◐ CACHED{offlineAgeMin !== null ? ` · ${offlineAgeMin}min` : ''}
                </span>
                {syncQueueSize > 0 && (
                  <span className="flex items-center gap-1 shrink-0 text-slate-300">
                    LOCAL {syncQueueSize} PENDING
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="flex items-center gap-1 shrink-0 text-emerald-400">
                  <Dot color="green" />SACHET ● LIVE
                </span>
                <span className="flex items-center gap-1 shrink-0 text-slate-400">
                  <Dot color="gray" />SMS ○ NOT CONFIGURED
                </span>
              </>
            )}

            {/* Satellite */}
            <span className="flex items-center gap-1 shrink-0 text-slate-500">
              <Dot color="gray" />SATELLITE ○ {satelliteState.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Right: expand toggle */}
          <button className="text-slate-500 hover:text-slate-300 ml-2 shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="px-4 py-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            <StatusRow label="NETWORK" dot={networkDot} value={connectionState} />
            <StatusRow label="GPS" dot={gpsDot} value={gpsDot === 'green' ? `LIVE · ${gps.currentSpeedKmh !== null && gps.currentSpeedKmh !== undefined ? gps.currentSpeedKmh.toFixed(0) + ' km/h' : 'stationary'}` : 'NO FIX'} />
            {isOffline ? (
              <>
                <StatusRow label="ROUTE" dot="green" value="CACHED" />
                <StatusRow label="SACHET" dot="half" value={`CACHED${offlineAgeMin !== null ? ` · ${offlineAgeMin}min old` : ''}`} />
                <StatusRow label="LOCAL DATA" dot={syncQueueSize > 0 ? 'yellow' : 'green'} value={syncQueueSize > 0 ? `${syncQueueSize} PENDING SYNC` : 'UP TO DATE'} />
              </>
            ) : (
              <>
                <StatusRow label="SACHET" dot="green" value="LIVE" />
                <StatusRow label="LOCAL SYNC" dot="green" value="UP TO DATE" />
                {latencyMs !== null && <StatusRow label="LATENCY" dot={latencyMs > 2000 ? 'yellow' : 'green'} value={`${latencyMs}ms`} />}
              </>
            )}
            <StatusRow label="SMS FALLBACK" dot="gray" value="NOT CONFIGURED" />
            <StatusRow label="SATELLITE" dot="gray" value="NOT CONFIGURED" />
          </div>
        )}
      </div>
    </>
  );
}

function StatusRow({ label, dot, value }: { label: string; dot: 'green' | 'yellow' | 'red' | 'gray' | 'half'; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Dot color={dot} />
      <span className="text-slate-500">{label}</span>
      <span className={`ml-auto ${dot === 'green' ? 'text-emerald-400' : dot === 'yellow' ? 'text-amber-400' : dot === 'red' ? 'text-red-400' : 'text-slate-500'}`}>
        {value}
      </span>
    </div>
  );
}
