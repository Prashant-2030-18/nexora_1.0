import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { DisasterAlertData, SachetSyncStatus } from '../types';

export const SACHET_REFRESH_INTERVAL = 30_000; // Exactly 30 seconds official refresh cycle

export interface DisasterContextType {
  disasters: DisasterAlertData[];
  totalActiveDisasters: number;
  mappedCount: number;
  unmappedCount: number;
  sachetStatus: SachetSyncStatus | null;
  lastCheckedAt: Date | null;
  lastSuccessfulUpdate: Date | null;
  lastModifiedAt: string | null;
  lastRefreshedAt: Date | null; // backward compatibility alias
  isRefreshing: boolean;
  countdownSeconds: number; // Single authoritative 30 -> 0 countdown
  error: string | null;
  refreshDisasters: (forceSync?: boolean) => Promise<void>;
}

const DisasterContext = createContext<DisasterContextType | undefined>(undefined);

export const DisasterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [disasters, setDisasters] = useState<DisasterAlertData[]>([]);
  const [totalActiveDisasters, setTotalActiveDisasters] = useState<number>(0);
  const [mappedCount, setMappedCount] = useState<number>(0);
  const [unmappedCount, setUnmappedCount] = useState<number>(0);
  const [sachetStatus, setSachetStatus] = useState<SachetSyncStatus | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<Date | null>(null);
  const [lastModifiedAt, setLastModifiedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  // Client-side deadline timestamp to prevent drift & calculate remaining seconds
  const nextRefreshAtRef = useRef<number>(Date.now() + SACHET_REFRESH_INTERVAL);

  // Concurrency lock to prevent duplicate simultaneous refresh requests
  const refreshInProgressRef = useRef<boolean>(false);

  // Unified Refresh Pipeline:
  // Step 1: Trigger backend SACHET sync (ETag caching, CAP XML validation, 304 handling, expiration)
  // Step 2: Fetch unified active disaster records from database (single source of truth)
  // Step 3: Reconcile shared state in-place (Leaflet markers update smoothly by key without remounting)
  // Step 4: Fetch SACHET connection telemetry
  const refreshDisasters = useCallback(async (forceSync = false) => {
    if (refreshInProgressRef.current) {
      return;
    }

    refreshInProgressRef.current = true;
    setIsRefreshing(true);
    setError(null);
    setLastCheckedAt(new Date());

    try {
      // Step 1: Trigger backend SACHET sync
      try {
        await api.syncSachetAlerts(forceSync);
      } catch (syncErr: any) {
        console.warn('[DisasterContext] SACHET sync response:', syncErr?.message || syncErr);
        // Non-blocking: downstream queries will retrieve the latest cached official data
      }

      // Step 2: Fetch the authoritative active disaster dataset
      const res = await api.getDisasters();
      if (res && Array.isArray(res.disasters)) {
        // Non-destructive in-place state update:
        // Leaflet/Google maps reconcile markers via stable ID keys without reloading or resetting camera
        setDisasters(res.disasters);
        const total = res.total ?? res.active ?? res.disasters.length;
        const mapped = res.mapped ?? res.disasters.filter((d) => d.has_valid_location ?? true).length;
        setTotalActiveDisasters(total);
        setMappedCount(mapped);
        setUnmappedCount(res.unmapped ?? Math.max(0, total - mapped));
        setLastSuccessfulUpdate(new Date());
      }

      // Step 3: Fetch updated SACHET connection telemetry
      try {
        const st = await api.getSachetSyncStatus();
        if (st) {
          setSachetStatus(st);
          if (st.lastModifiedAt) {
            setLastModifiedAt(st.lastModifiedAt);
          }
          if (st.lastSuccessfulFetch) {
            setLastSuccessfulUpdate(new Date(st.lastSuccessfulFetch));
          }
        }
      } catch {
        // preserve last status
      }
    } catch (err: any) {
      console.error('[DisasterContext] Error refreshing active disasters:', err);
      setError(err?.message || 'Failed to refresh live disaster data');
      // Rule: Never clear or reset existing disaster markers if sync or network fails!
    } finally {
      refreshInProgressRef.current = false;
      setIsRefreshing(false);
      // Immediately reset next refresh deadline to 30 seconds from now
      nextRefreshAtRef.current = Date.now() + SACHET_REFRESH_INTERVAL;
      setCountdownSeconds(30);
    }
  }, []);

  // Stable ref to avoid recreating the timer effect
  const refreshDisastersRef = useRef(refreshDisasters);
  refreshDisastersRef.current = refreshDisasters;

  // Single Global Controller: Created ONCE when DisasterProvider mounts.
  // Uses client-side deadline logic.
  // 1-second ticker calculates remaining seconds (30 -> 0).
  // At 0 seconds, it triggers the automatic 30s refresh.
  // On return from background tab, checks if deadline passed and performs exactly one refresh.
  useEffect(() => {
    // Initial fetch on application mount
    refreshDisastersRef.current(false);

    const countdownTimer = setInterval(() => {
      if (document.hidden) return; // Pause visible countdown when tab is hidden

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((nextRefreshAtRef.current - now) / 1000));
      setCountdownSeconds(remaining);

      // When countdown reaches 0, trigger the automatic 30s refresh
      if (remaining === 0 && !refreshInProgressRef.current) {
        nextRefreshAtRef.current = now + SACHET_REFRESH_INTERVAL;
        refreshDisastersRef.current(false);
      }
    }, 1000);

    // Tab visibility handling: when user returns, check if the 30-second deadline elapsed
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        if (now >= nextRefreshAtRef.current) {
          // Deadline elapsed while away — perform exactly ONE catch-up refresh
          nextRefreshAtRef.current = now + SACHET_REFRESH_INTERVAL;
          setCountdownSeconds(30);
          if (!refreshInProgressRef.current) {
            refreshDisastersRef.current(false);
          }
        } else {
          // Sync visible countdown immediately
          const remaining = Math.max(0, Math.ceil((nextRefreshAtRef.current - now) / 1000));
          setCountdownSeconds(remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(countdownTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty dependency array ensures timer is created strictly ONCE on mount

  return (
    <DisasterContext.Provider
      value={{
        disasters,
        totalActiveDisasters,
        mappedCount,
        unmappedCount,
        sachetStatus,
        lastCheckedAt,
        lastSuccessfulUpdate,
        lastModifiedAt,
        lastRefreshedAt: lastCheckedAt, // backward compatibility
        isRefreshing,
        countdownSeconds,
        error,
        refreshDisasters,
      }}
    >
      {children}
    </DisasterContext.Provider>
  );
};

export const useDisasters = (): DisasterContextType => {
  const context = useContext(DisasterContext);
  if (!context) {
    throw new Error('useDisasters must be used within a DisasterProvider');
  }
  return context;
};
