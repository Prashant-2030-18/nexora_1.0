/**
 * NEXORA Sync Engine
 * ==================
 * Handles automatic reconnect synchronization.
 *
 * Sync order (safe, spec §20):
 *   1. Journey state
 *   2. Citizen report metadata
 *   3. Evidence uploads
 *   4. Alert acknowledgements
 *   5. Offline telemetry summary
 *   6. Preferences
 *   7. Latest server disaster state
 *   8. Latest SACHET
 *   9. Route risk re-evaluation
 *
 * Rules:
 *   - Failed items → RETRY_PENDING, do NOT abort queue
 *   - Exponential backoff: 5s, 15s, 30s, 60s, 5min cap
 *   - Uses idempotency keys — backend deduplicates
 *   - Background Sync API used if available, else online/visibilitychange fallback
 *   - Map is NOT remounted during sync
 *   - GPS is NOT restarted during sync
 */

import {
  getPendingSyncItems, updateSyncItemStatus, deleteSyncedItems,
  setSyncMetadata, getSyncMetadata, cacheHazards, cleanupAfterSync,
} from './offlineStore';
import { TOKEN_KEY } from './api';

const API_BASE = '/api';

// Exponential backoff delays (ms)
const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 300_000];

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

export type SyncProgress = {
  total: number;
  done: number;
  failed: number;
  phase: string;
};

type ProgressCallback = (progress: SyncProgress) => void;

// ── Main Sync Function ────────────────────────────────────────────────────────

export async function runReconnectSync(
  journeyId: string | null,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; itemsSynced: number; errors: number; newHazards: boolean }> {
  const items = await getPendingSyncItems();
  const total = items.length;
  let done = 0;
  let errors = 0;

  // Phase 1-6: Upload pending local operations in order
  // Sort by entity type priority
  const typePriority: Record<string, number> = {
    'JOURNEY_TELEMETRY': 1,
    'CITIZEN_REPORT': 2,
    'EVIDENCE': 3,
    'ALERT_ACKNOWLEDGEMENT': 4,
    'USER_PREFERENCE': 5,
  };
  const sorted = [...items].sort((a, b) =>
    (typePriority[a.entityType] || 9) - (typePriority[b.entityType] || 9)
  );

  // Batch upload to /api/offline/sync
  if (sorted.length > 0 && journeyId) {
    onProgress?.({ total, done: 0, failed: 0, phase: 'Uploading offline data...' });

    const operations = sorted.map(item => ({
      idempotency_key: item.idempotencyKey,
      entity_type: item.entityType,
      operation: item.operation,
      payload: item.payload,
      client_timestamp: item.createdAt,
    }));

    try {
      const res = await authFetch(`${API_BASE}/offline/sync`, {
        method: 'POST',
        body: JSON.stringify({ journey_id: journeyId, operations }),
      });

      if (res.ok) {
        const data = await res.json();
        const results: any[] = data.results || [];

        for (const result of results) {
          const item = sorted.find(i => i.idempotencyKey === result.idempotency_key);
          if (!item) continue;

          if (result.status === 'PROCESSED' || result.status === 'ALREADY_PROCESSED') {
            await updateSyncItemStatus(item.queueId, 'SYNCED');
            done++;
          } else {
            const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
            const retryAt = new Date(Date.now() + delay).toISOString();
            await updateSyncItemStatus(item.queueId, 'RETRY_PENDING', result.message, retryAt);
            errors++;
          }
        }
      } else {
        // All items go to retry
        for (const item of sorted) {
          const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
          await updateSyncItemStatus(item.queueId, 'RETRY_PENDING', `HTTP ${res.status}`,
            new Date(Date.now() + delay).toISOString());
        }
        errors = sorted.length;
      }
    } catch (err) {
      for (const item of sorted) {
        const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
        await updateSyncItemStatus(item.queueId, 'RETRY_PENDING', String(err),
          new Date(Date.now() + delay).toISOString());
      }
      errors = sorted.length;
    }
  }

  onProgress?.({ total, done, failed: errors, phase: 'Fetching latest disaster data...' });

  // Phase 7-8: Fetch latest SACHET + disasters
  let newHazards = false;
  try {
    const hazRes = await authFetch(`${API_BASE}/disasters?limit=100`);
    if (hazRes.ok) {
      const hazData = await hazRes.json();
      const hazards = (hazData.alerts || hazData || []).map((h: any) => ({
        id: h.id,
        eventType: h.event_type || h.type,
        severity: h.severity || h.risk_level,
        latitude: h.latitude,
        longitude: h.longitude,
        areaDesc: h.area_desc || h.location,
        isActive: h.is_active !== false,
        cachedAt: new Date().toISOString(),
      }));
      await cacheHazards(hazards);
      await setSyncMetadata('last_sachet_sync', new Date().toISOString());
      newHazards = hazards.length > 0;
    }
  } catch (err) {
    console.warn('[SyncEngine] Failed to fetch hazards:', err);
  }

  // Phase 9: Route re-evaluation happens in ConnectivityContext after sync

  // Cleanup
  await cleanupAfterSync();

  onProgress?.({ total, done, failed: errors, phase: 'Sync complete' });
  console.log(`[SyncEngine] Sync done — ${done} synced, ${errors} errors, newHazards=${newHazards}`);

  return {
    success: errors === 0,
    itemsSynced: done,
    errors,
    newHazards,
  };
}

// ── Register Background Sync ──────────────────────────────────────────────────

/** Feature-detect and register Service Worker Background Sync if available */
export async function registerBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // @ts-ignore — Background Sync API types may not be in tsconfig
      await reg.sync.register('nexora-offline-sync');
      console.log('[SyncEngine] Background Sync registered');
    } catch (err) {
      console.warn('[SyncEngine] Background Sync registration failed (fallback to online event):', err);
    }
  } else {
    console.log('[SyncEngine] Background Sync API not available — using online/visibilitychange fallback');
  }
}
