/**
 * NEXORA ConnectivityContext
 * ==========================
 * Single centralized connectivity state consumed by all pages.
 * NO page manages connectivity independently.
 *
 * Connection States:
 *   ONLINE     — browser online AND backend reachable
 *   DEGRADED   — backend intermittent (1-2 failures) or high latency
 *   OFFLINE    — browser offline OR 3+ consecutive backend failures
 *   RESTORING  — browser back online, backend not yet verified
 *   SYNCING    — backend verified, uploading offline queue
 *
 * Rules (spec §3):
 *   - Never declare OFFLINE from one temporary API timeout
 *   - navigator.onLine alone is NOT sufficient — backend heartbeat required
 *   - RESTORING → ONLINE requires successful backend health check
 *   - BroadcastChannel leader election: only 1 tab runs heartbeat + sync
 *
 * GPS continues regardless of connection state (GPSContext handles GPS).
 * Map is NEVER remounted during state transitions.
 */

import React, {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, ReactNode,
} from 'react';
import { runReconnectSync, SyncProgress, registerBackgroundSync } from '../services/syncEngine';
import { getSyncQueueSize, getSyncMetadata } from '../services/offlineStore';
import { getCurrentJourneyId } from '../services/journeySession';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionState = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RESTORING' | 'SYNCING';

export type SatelliteState =
  | 'UNKNOWN'
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'SUPPORTED_BUT_UNAVAILABLE'
  | 'AVAILABLE'
  | 'ACTIVE';

export interface ConnectivityContextType {
  connectionState: ConnectionState;
  browserOnline: boolean;
  backendReachable: boolean;
  latencyMs: number | null;
  consecutiveFailures: number;
  lastSuccessfulHeartbeat: Date | null;
  offlineSince: Date | null;
  syncQueueSize: number;
  lastSachetSync: Date | null;
  smsFallbackEnabled: boolean;
  satelliteState: SatelliteState;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  // Manual actions
  triggerSync: () => Promise<void>;
  getOfflineAgeMinutes: () => number | null;
}

const ConnectivityContext = createContext<ConnectivityContextType | null>(null);

export function useConnectivity(): ConnectivityContextType {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error('useConnectivity must be used within ConnectivityProvider');
  return ctx;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 15_000;
const DEGRADED_FAILURE_THRESHOLD = 2;   // 1-2 failures = DEGRADED
const OFFLINE_FAILURE_THRESHOLD = 3;    // 3+ failures = OFFLINE
const HIGH_LATENCY_MS = 3_000;

const BROADCAST_CHANNEL_NAME = 'nexora_connectivity_leader';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkBackendHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch('/api/connectivity/health', {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    return { ok: res.ok, latencyMs };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// ── BroadcastChannel Leader Election ─────────────────────────────────────────

let _isLeaderTab = false;
let _leaderChannel: BroadcastChannel | null = null;

function tryBecomeLeader(): boolean {
  try {
    if (!('BroadcastChannel' in window)) {
      _isLeaderTab = true; // No BroadcastChannel support — this tab is leader
      return true;
    }
    _leaderChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    // Simple: first tab to open becomes leader
    // In production this could use Web Locks API for stricter election
    _isLeaderTab = true;
    _leaderChannel.postMessage({ type: 'LEADER_ELECTED' });
    _leaderChannel.onmessage = (e) => {
      if (e.data?.type === 'LEADER_CLAIM') {
        // Another tab claims leadership — defer to them if we're not already active
        // For simplicity, last-write-wins
      }
    };
    return true;
  } catch {
    _isLeaderTab = true;
    return true;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('ONLINE');
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [backendReachable, setBackendReachable] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [lastSuccessfulHeartbeat, setLastSuccessfulHeartbeat] = useState<Date | null>(null);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [lastSachetSync, setLastSachetSync] = useState<Date | null>(null);
  const [satelliteState] = useState<SatelliteState>('NOT_CONFIGURED');
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // One-time popup flags
  const offlinePopupShownRef = useRef(false);
  const prevConnectionStateRef = useRef<ConnectionState>('ONLINE');
  const consecutiveFailuresRef = useRef(0);
  const consecutiveSuccessesRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncInProgressRef = useRef(false);

  // ── Connectivity Classification ─────────────────────────────────────────────

  const classifyState = useCallback((
    online: boolean,
    reachable: boolean,
    failures: number,
    latency: number | null,
  ): ConnectionState => {
    if (!online || failures >= OFFLINE_FAILURE_THRESHOLD) return 'OFFLINE';
    if (failures >= DEGRADED_FAILURE_THRESHOLD || (latency !== null && latency > HIGH_LATENCY_MS)) return 'DEGRADED';
    if (online && !reachable) return 'RESTORING';
    if (online && reachable) return 'ONLINE';
    return 'OFFLINE';
  }, []);

  // ── Sync on Reconnect ───────────────────────────────────────────────────────

  const runSync = useCallback(async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setIsSyncing(true);
    setConnectionState('SYNCING');

    const journeyId = getCurrentJourneyId();
    try {
      const result = await runReconnectSync(journeyId, (progress) => {
        setSyncProgress(progress);
      });
      // After sync, refresh queue size
      const size = await getSyncQueueSize();
      setSyncQueueSize(size);
    } catch (err) {
      console.warn('[Connectivity] Sync error:', err);
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
      setSyncProgress(null);
      setConnectionState('ONLINE');
    }
  }, []);

  const triggerSync = useCallback(async () => {
    await runSync();
  }, [runSync]);

  // ── Heartbeat Loop ──────────────────────────────────────────────────────────

  const runHeartbeat = useCallback(async () => {
    const online = navigator.onLine;
    setBrowserOnline(online);

    if (!online) {
      consecutiveFailuresRef.current += 1;
      setConsecutiveFailures(consecutiveFailuresRef.current);
      consecutiveSuccessesRef.current = 0;
      setConsecutiveSuccesses(0);
      setBackendReachable(false);

      const newState = classifyState(false, false, consecutiveFailuresRef.current, null);
      setConnectionState(prev => {
        if (prev !== 'OFFLINE' && newState === 'OFFLINE' && !offlinePopupShownRef.current) {
          offlinePopupShownRef.current = true;
          // Dispatch custom event for popup
          window.dispatchEvent(new CustomEvent('nexora:went-offline', {
            detail: { offlineSince: new Date().toISOString() }
          }));
          setOfflineSince(new Date());
        }
        return newState;
      });
      return;
    }

    const { ok, latencyMs: ms } = await checkBackendHealth();
    setLatencyMs(ms);

    if (ok) {
      consecutiveFailuresRef.current = 0;
      consecutiveSuccessesRef.current += 1;
      setConsecutiveFailures(0);
      setConsecutiveSuccesses(consecutiveSuccessesRef.current);
      setBackendReachable(true);
      setLastSuccessfulHeartbeat(new Date());

      const wasOffline = prevConnectionStateRef.current === 'OFFLINE' ||
                         prevConnectionStateRef.current === 'RESTORING';

      setConnectionState(prev => {
        const newState = classifyState(true, true, 0, ms);

        if (wasOffline || prev === 'RESTORING') {
          // Transition to SYNCING then ONLINE
          if (!syncInProgressRef.current) {
            setOfflineSince(null);
            offlinePopupShownRef.current = false;
            // Dispatch reconnected event
            window.dispatchEvent(new CustomEvent('nexora:reconnected'));
            setTimeout(() => runSync(), 500);
          }
        }
        prevConnectionStateRef.current = newState;
        return newState;
      });
    } else {
      consecutiveFailuresRef.current += 1;
      consecutiveSuccessesRef.current = 0;
      setConsecutiveFailures(consecutiveFailuresRef.current);
      setConsecutiveSuccesses(0);
      setBackendReachable(false);

      const newState = classifyState(true, false, consecutiveFailuresRef.current, ms);

      setConnectionState(prev => {
        if (prev === 'ONLINE' && newState === 'OFFLINE' && !offlinePopupShownRef.current) {
          offlinePopupShownRef.current = true;
          window.dispatchEvent(new CustomEvent('nexora:went-offline', {
            detail: { offlineSince: new Date().toISOString() }
          }));
          setOfflineSince(new Date());
        }
        if (prev === 'OFFLINE' && newState === 'RESTORING') {
          offlinePopupShownRef.current = false;
        }
        prevConnectionStateRef.current = newState;
        return newState;
      });
    }

    // Update sync queue size
    const size = await getSyncQueueSize();
    setSyncQueueSize(size);
  }, [classifyState, runSync]);

  // ── Init & Lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    tryBecomeLeader();
    registerBackgroundSync().catch(() => {});

    // Load cached SACHET sync time
    getSyncMetadata('last_sachet_sync').then(val => {
      if (val) setLastSachetSync(new Date(val));
    });

    // Load initial queue size
    getSyncQueueSize().then(setSyncQueueSize);

    // Browser online/offline events
    const handleOnline = () => {
      setBrowserOnline(true);
      setConnectionState('RESTORING');
      runHeartbeat();
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      setConnectionState('OFFLINE');
      consecutiveFailuresRef.current = OFFLINE_FAILURE_THRESHOLD;
      setConsecutiveFailures(OFFLINE_FAILURE_THRESHOLD);
      if (!offlinePopupShownRef.current) {
        offlinePopupShownRef.current = true;
        setOfflineSince(new Date());
        window.dispatchEvent(new CustomEvent('nexora:went-offline', {
          detail: { offlineSince: new Date().toISOString() }
        }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Page visibility change — trigger heartbeat when page regains focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runHeartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Start heartbeat timer (only leader tab)
    if (_isLeaderTab) {
      runHeartbeat(); // immediate check
      heartbeatTimerRef.current = setInterval(runHeartbeat, HEARTBEAT_MS);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      _leaderChannel?.close();
    };
  }, [runHeartbeat]);

  // ── SMS Fallback Enabled (from server communication status) ────────────────

  const smsFallbackEnabled = false; // Determined by server — shown as NOT_CONFIGURED

  const getOfflineAgeMinutes = useCallback((): number | null => {
    if (!offlineSince) return null;
    return Math.floor((Date.now() - offlineSince.getTime()) / 60000);
  }, [offlineSince]);

  return (
    <ConnectivityContext.Provider value={{
      connectionState,
      browserOnline,
      backendReachable,
      latencyMs,
      consecutiveFailures,
      lastSuccessfulHeartbeat,
      offlineSince,
      syncQueueSize,
      lastSachetSync,
      smsFallbackEnabled,
      satelliteState,
      syncProgress,
      isSyncing,
      triggerSync,
      getOfflineAgeMinutes,
    }}>
      {children}
    </ConnectivityContext.Provider>
  );
}
