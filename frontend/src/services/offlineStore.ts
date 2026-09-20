/**
 * NEXORA Offline Store — IndexedDB Service
 * ==========================================
 * Provides persistent offline storage using IndexedDB.
 * DO NOT use localStorage for operational data.
 *
 * Stores:
 *   journey_state       — Active journey snapshot
 *   gps_samples         — Throttled GPS records (synced: false)
 *   pending_reports     — Offline citizen reports
 *   pending_evidence    — Image Blobs (NOT base64)
 *   pending_acks        — Alert acknowledgements
 *   cached_hazards      — Hazard snapshot
 *   cached_route        — Route geometry + steps
 *   sync_queue          — Ordered sync queue with idempotency
 *   sync_metadata       — Last sync timestamps
 *
 * Retention limits:
 *   GPS samples:        24 hours max
 *   Completed sync:     deleted after success
 *   Evidence:           only deleted after confirmed upload
 *   Cached hazards:     replaced on reconnect sync
 */

const DB_NAME = 'nexora_offline_v1';
const DB_VERSION = 1;

export interface JourneyStateRecord {
  id: string; // journey_id
  travelMode: string;
  origin: string;
  destination: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
  routeGeometry?: number[][];      // [[lon, lat], ...]
  navigationSteps?: any[];
  routeProvider?: string;
  routeId?: string;
  etaBaseline?: string;
  distanceKm?: number;
  startedAt: string;
  lastProgress?: number;           // 0.0–1.0
  lastLat?: number;
  lastLon?: number;
  knownHazardIds?: number[];
  lastSachetTimestamp?: string;
  smsConsent: boolean;
}

export interface GpsSampleRecord {
  id?: number;
  journeyId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  routeProgress?: number;
  synced: boolean;
}

export interface PendingReportRecord {
  localId: string;               // UUID generated offline
  idempotencyKey: string;
  journeyId?: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  hazardType: string;
  severity: string;
  description?: string;
  language?: string;
  reporterName?: string;
  status: 'SAVED_OFFLINE' | 'PENDING_SYNC' | 'UPLOADING' | 'SYNCED' | 'ERROR';
  evidenceLocalIds?: string[];   // references to pending_evidence store
  createdAt: string;
}

export interface PendingEvidenceRecord {
  localId: string;               // UUID
  reportLocalId: string;         // parent report
  blob: Blob;                    // stored directly as Blob, NOT base64
  mimeType: string;
  filename: string;
  sizeBytes: number;
  status: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'ERROR';
  uploadedUrl?: string;
  createdAt: string;
}

export interface SyncQueueItem {
  id?: number;
  queueId: string;               // UUID
  entityType: 'CITIZEN_REPORT' | 'EVIDENCE' | 'JOURNEY_TELEMETRY' | 'ALERT_ACKNOWLEDGEMENT' | 'USER_PREFERENCE';
  entityLocalId: string;
  operation: 'CREATE' | 'UPDATE' | 'ACK';
  payload: any;
  idempotencyKey: string;
  status: 'PENDING' | 'UPLOADING' | 'SYNCED' | 'RETRY_PENDING' | 'FAILED';
  retryCount: number;
  lastError?: string;
  nextRetryAt?: string;
  createdAt: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
  updatedAt: string;
}

export interface CachedRoute {
  id: string;                    // journey_id
  geometry: number[][];
  navigationSteps: any[];
  destination: string;
  distanceKm: number;
  etaFormatted: string;
  routeProvider: string;
  hazardIds?: number[];
  cachedAt: string;
}

export interface CachedHazard {
  id: number;
  eventType: string;
  severity: string;
  latitude?: number;
  longitude?: number;
  areaDesc?: string;
  isActive: boolean;
  cachedAt: string;
}

// ── Database Initialization ──────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export async function openOfflineStore(): Promise<IDBDatabase> {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // journey_state
      if (!db.objectStoreNames.contains('journey_state')) {
        db.createObjectStore('journey_state', { keyPath: 'id' });
      }
      // gps_samples
      if (!db.objectStoreNames.contains('gps_samples')) {
        const gps = db.createObjectStore('gps_samples', { keyPath: 'id', autoIncrement: true });
        gps.createIndex('journeyId', 'journeyId');
        gps.createIndex('synced', 'synced');
        gps.createIndex('timestamp', 'timestamp');
      }
      // pending_reports
      if (!db.objectStoreNames.contains('pending_reports')) {
        const rpt = db.createObjectStore('pending_reports', { keyPath: 'localId' });
        rpt.createIndex('status', 'status');
        rpt.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
      }
      // pending_evidence
      if (!db.objectStoreNames.contains('pending_evidence')) {
        const ev = db.createObjectStore('pending_evidence', { keyPath: 'localId' });
        ev.createIndex('reportLocalId', 'reportLocalId');
        ev.createIndex('status', 'status');
      }
      // pending_acks
      if (!db.objectStoreNames.contains('pending_acks')) {
        db.createObjectStore('pending_acks', { keyPath: 'localId' });
      }
      // cached_hazards
      if (!db.objectStoreNames.contains('cached_hazards')) {
        const hz = db.createObjectStore('cached_hazards', { keyPath: 'id' });
        hz.createIndex('isActive', 'isActive');
      }
      // cached_route
      if (!db.objectStoreNames.contains('cached_route')) {
        db.createObjectStore('cached_route', { keyPath: 'id' });
      }
      // sync_queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        sq.createIndex('status', 'status');
        sq.createIndex('entityType', 'entityType');
        sq.createIndex('queueId', 'queueId', { unique: true });
      }
      // sync_metadata
      if (!db.objectStoreNames.contains('sync_metadata')) {
        db.createObjectStore('sync_metadata', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Generic Helpers ───────────────────────────────────────────────────────────

async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll<T>(storeName: string, index?: string, query?: IDBValidKey): Promise<T[]> {
  const db = await openOfflineStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const source = index ? store.index(index) : store;
    const req = query !== undefined ? source.getAll(query) : source.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openOfflineStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Journey State ─────────────────────────────────────────────────────────────

export async function saveJourneyState(journey: JourneyStateRecord): Promise<void> {
  await dbPut('journey_state', journey);
}

export async function getJourneyState(journeyId: string): Promise<JourneyStateRecord | undefined> {
  return dbGet<JourneyStateRecord>('journey_state', journeyId);
}

export async function getAllJourneyStates(): Promise<JourneyStateRecord[]> {
  return dbGetAll<JourneyStateRecord>('journey_state');
}

export async function deleteJourneyState(journeyId: string): Promise<void> {
  await dbDelete('journey_state', journeyId);
}

// ── GPS Samples ────────────────────────────────────────────────────────────────

export async function saveGpsSample(sample: Omit<GpsSampleRecord, 'id'>): Promise<void> {
  await dbPut('gps_samples', sample);
}

export async function getUnsyncedGpsSamples(journeyId: string): Promise<GpsSampleRecord[]> {
  const all = await dbGetAll<GpsSampleRecord>('gps_samples', 'journeyId', journeyId);
  return all.filter(s => !s.synced);
}

/** Purge GPS samples older than retentionHours (default 24h) */
export async function purgeOldGpsSamples(retentionHours = 24): Promise<void> {
  const db = await openOfflineStore();
  const cutoff = new Date(Date.now() - retentionHours * 3600 * 1000).toISOString();
  const all = await dbGetAll<GpsSampleRecord>('gps_samples');
  const toDelete = all.filter(s => s.synced && s.timestamp < cutoff);
  for (const sample of toDelete) {
    if (sample.id !== undefined) await dbDelete('gps_samples', sample.id);
  }
}

// ── Pending Reports ───────────────────────────────────────────────────────────

export async function savePendingReport(report: PendingReportRecord): Promise<void> {
  await dbPut('pending_reports', report);
}

export async function getPendingReports(): Promise<PendingReportRecord[]> {
  return dbGetAll<PendingReportRecord>('pending_reports', 'status', 'PENDING_SYNC');
}

export async function getAllPendingReports(): Promise<PendingReportRecord[]> {
  return dbGetAll<PendingReportRecord>('pending_reports');
}

export async function updateReportStatus(
  localId: string,
  status: PendingReportRecord['status']
): Promise<void> {
  const report = await dbGet<PendingReportRecord>('pending_reports', localId);
  if (report) {
    await dbPut('pending_reports', { ...report, status });
  }
}

// ── Pending Evidence (Blob storage) ──────────────────────────────────────────

export async function savePendingEvidence(ev: PendingEvidenceRecord): Promise<void> {
  await dbPut('pending_evidence', ev);
}

export async function getPendingEvidence(reportLocalId: string): Promise<PendingEvidenceRecord[]> {
  return dbGetAll<PendingEvidenceRecord>('pending_evidence', 'reportLocalId', reportLocalId);
}

export async function updateEvidenceStatus(
  localId: string,
  status: PendingEvidenceRecord['status'],
  uploadedUrl?: string
): Promise<void> {
  const ev = await dbGet<PendingEvidenceRecord>('pending_evidence', localId);
  if (ev) {
    await dbPut('pending_evidence', { ...ev, status, uploadedUrl });
  }
}

/** Delete evidence ONLY after confirmed successful upload */
export async function deleteUploadedEvidence(localId: string): Promise<void> {
  const ev = await dbGet<PendingEvidenceRecord>('pending_evidence', localId);
  if (ev && ev.status === 'UPLOADED') {
    await dbDelete('pending_evidence', localId);
  }
}

// ── Sync Queue ────────────────────────────────────────────────────────────────

export async function enqueueSyncItem(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await dbPut('sync_queue', item);
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const all = await dbGetAll<SyncQueueItem>('sync_queue');
  return all.filter(i => i.status === 'PENDING' || i.status === 'RETRY_PENDING');
}

export async function updateSyncItemStatus(
  queueId: string,
  status: SyncQueueItem['status'],
  lastError?: string,
  nextRetryAt?: string
): Promise<void> {
  const all = await dbGetAll<SyncQueueItem>('sync_queue');
  const item = all.find(i => i.queueId === queueId);
  if (item && item.id !== undefined) {
    await dbPut('sync_queue', {
      ...item,
      status,
      lastError,
      nextRetryAt,
      retryCount: status === 'RETRY_PENDING' ? (item.retryCount + 1) : item.retryCount,
    });
  }
}

export async function deleteSyncedItems(): Promise<void> {
  const all = await dbGetAll<SyncQueueItem>('sync_queue');
  for (const item of all) {
    if (item.status === 'SYNCED' && item.id !== undefined) {
      await dbDelete('sync_queue', item.id);
    }
  }
}

export async function getSyncQueueSize(): Promise<number> {
  const pending = await getPendingSyncItems();
  return pending.length;
}

// ── Cached Route ──────────────────────────────────────────────────────────────

export async function cacheRoute(route: CachedRoute): Promise<void> {
  await dbPut('cached_route', route);
}

export async function getCachedRoute(journeyId: string): Promise<CachedRoute | undefined> {
  return dbGet<CachedRoute>('cached_route', journeyId);
}

// ── Cached Hazards ────────────────────────────────────────────────────────────

export async function cacheHazards(hazards: CachedHazard[]): Promise<void> {
  for (const h of hazards) {
    await dbPut('cached_hazards', { ...h, cachedAt: new Date().toISOString() });
  }
}

export async function getCachedHazards(): Promise<CachedHazard[]> {
  return dbGetAll<CachedHazard>('cached_hazards');
}

// ── Sync Metadata ─────────────────────────────────────────────────────────────

export async function setSyncMetadata(key: string, value: string): Promise<void> {
  await dbPut('sync_metadata', { key, value, updatedAt: new Date().toISOString() });
}

export async function getSyncMetadata(key: string): Promise<string | undefined> {
  const rec = await dbGet<SyncMetadata>('sync_metadata', key);
  return rec?.value;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/** Full offline data cleanup — call after successful sync or journey end */
export async function cleanupAfterSync(): Promise<void> {
  await deleteSyncedItems();
  await purgeOldGpsSamples(24);
}

/** Clear ALL offline data (user-initiated). Never deletes unsynced reports silently. */
export async function clearOfflineData(options?: { includeUnsyncedReports?: boolean }): Promise<{ cleared: string[]; skipped: string[] }> {
  const cleared: string[] = [];
  const skipped: string[] = [];

  // Always clear synced queue items
  await deleteSyncedItems();
  cleared.push('sync_queue_synced');

  // Clear old GPS samples
  await purgeOldGpsSamples(0); // all synced samples
  cleared.push('gps_samples_synced');

  if (options?.includeUnsyncedReports) {
    // User explicitly chose to clear — this is allowed
    const db = await openOfflineStore();
    db.transaction('pending_reports', 'readwrite').objectStore('pending_reports').clear();
    cleared.push('pending_reports');
  } else {
    const unsyncedReports = await getAllPendingReports();
    const pending = unsyncedReports.filter(r => r.status !== 'SYNCED');
    if (pending.length > 0) {
      skipped.push(`pending_reports (${pending.length} unsynced — preserved)`);
    }
  }

  return { cleared, skipped };
}
