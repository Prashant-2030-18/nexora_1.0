/**
 * NEXORA Journey Session Service
 * ================================
 * Manages the frontend journey lifecycle:
 *   - Start journey → POST /api/journeys/start
 *   - Heartbeat → POST /api/journeys/{id}/heartbeat (throttled, not every GPS sample)
 *   - Finish → POST /api/journeys/{id}/finish
 *   - Cache route locally in IndexedDB
 *   - Restore journey on app resume
 *
 * Heartbeat is sent every HEARTBEAT_INTERVAL_MS (default 15s) while journey active.
 * Local GPS updates remain more frequent (GPSContext handles those).
 */

import { GPSState } from '../types';
import { TOKEN_KEY } from './api';
import {
  saveJourneyState, getJourneyState, deleteJourneyState,
  getAllJourneyStates, cacheRoute, JourneyStateRecord, CachedRoute,
  setSyncMetadata, getSyncMetadata,
} from './offlineStore';

const API_BASE = '/api';
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds

export interface StartJourneyParams {
  travelMode: string;
  origin?: string;
  destination?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
  routeGeometry?: number[][];
  routeProvider?: string;
  routeId?: string;
  smsConsent: boolean;
  phoneNumber?: string;
  preferredLanguage?: string;
  navigationSteps?: any[];
  distanceKm?: number;
  etaFormatted?: string;
}

export interface ActiveJourney {
  journeyId: string;
  travelMode: string;
  origin?: string;
  destination?: string;
  smsConsent: boolean;
  startedAt: string;
}

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _currentJourneyId: string | null = null;
let _currentGps: GPSState | null = null;
let _currentProgress: number = 0;
let _isOnline: boolean = true;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// ── Start Journey ─────────────────────────────────────────────────────────────

export async function startJourney(params: StartJourneyParams): Promise<string | null> {
  try {
    const body = {
      travel_mode: params.travelMode,
      origin: params.origin,
      destination: params.destination,
      origin_lat: params.originLat,
      origin_lon: params.originLon,
      dest_lat: params.destLat,
      dest_lon: params.destLon,
      route_geometry: params.routeGeometry ? JSON.stringify(params.routeGeometry) : null,
      route_provider: params.routeProvider,
      route_id: params.routeId || 'fastest',
      sms_consent: params.smsConsent,
      phone_number: params.smsConsent ? params.phoneNumber : undefined,
      preferred_language: params.preferredLanguage || 'en',
    };

    const res = await authFetch(`${API_BASE}/journeys/start`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[Journey] Start failed:', res.status);
      return null;
    }

    const data = await res.json();
    const journeyId = data.journey_id;
    _currentJourneyId = journeyId;

    // Cache journey state locally for offline use
    const journeyState: JourneyStateRecord = {
      id: journeyId,
      travelMode: params.travelMode,
      origin: params.origin || '',
      destination: params.destination || '',
      originLat: params.originLat,
      originLon: params.originLon,
      destLat: params.destLat,
      destLon: params.destLon,
      routeGeometry: params.routeGeometry,
      navigationSteps: params.navigationSteps,
      routeProvider: params.routeProvider,
      routeId: params.routeId,
      etaBaseline: params.etaFormatted,
      distanceKm: params.distanceKm,
      startedAt: new Date().toISOString(),
      lastProgress: 0,
      smsConsent: params.smsConsent,
    };
    await saveJourneyState(journeyState);

    // Cache route geometry separately for offline navigation
    if (params.routeGeometry) {
      const cachedRoute: CachedRoute = {
        id: journeyId,
        geometry: params.routeGeometry,
        navigationSteps: params.navigationSteps || [],
        destination: params.destination || '',
        distanceKm: params.distanceKm || 0,
        etaFormatted: params.etaFormatted || '',
        routeProvider: params.routeProvider || 'unknown',
        cachedAt: new Date().toISOString(),
      };
      await cacheRoute(cachedRoute);
    }

    await setSyncMetadata('active_journey_id', journeyId);
    console.log(`[Journey] Started: ${journeyId}`);
    return journeyId;

  } catch (err) {
    console.error('[Journey] Start error:', err);
    return null;
  }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────────

export function startHeartbeat(
  journeyId: string,
  getGps: () => GPSState,
  getProgress: () => number,
  getOnline: () => boolean
): void {
  stopHeartbeat(); // clear any existing
  _currentJourneyId = journeyId;

  _heartbeatTimer = setInterval(async () => {
    const gps = getGps();
    const progress = getProgress();
    const online = getOnline();

    // Update local journey state with latest GPS
    const local = await getJourneyState(journeyId);
    if (local) {
      await saveJourneyState({
        ...local,
        lastLat: gps.latitude ?? undefined,
        lastLon: gps.longitude ?? undefined,
        lastProgress: progress,
      });
    }

    if (!online) {
      // Offline — cannot send heartbeat, local state already updated
      return;
    }

    try {
      await sendHeartbeat(journeyId, gps, progress, online);
    } catch (err) {
      console.warn('[Journey] Heartbeat failed:', err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`[Journey] Heartbeat started every ${HEARTBEAT_INTERVAL_MS / 1000}s`);
}

export async function sendHeartbeat(
  journeyId: string,
  gps: GPSState,
  routeProgress: number,
  online: boolean
): Promise<void> {
  const body = {
    timestamp: new Date().toISOString(),
    latitude: gps.latitude,
    longitude: gps.longitude,
    accuracy: gps.accuracy,
    speed_kmh: gps.currentSpeedKmh,
    heading: gps.heading,
    route_progress: routeProgress,
    connection_state: online ? 'ONLINE' : 'OFFLINE',
  };

  const res = await authFetch(`${API_BASE}/journeys/${journeyId}/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Heartbeat HTTP ${res.status}`);
  }
}

export function stopHeartbeat(): void {
  if (_heartbeatTimer !== null) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
    console.log('[Journey] Heartbeat stopped');
  }
}

// ── Finish Journey ────────────────────────────────────────────────────────────

export async function finishJourney(journeyId: string): Promise<void> {
  stopHeartbeat();

  try {
    const res = await authFetch(`${API_BASE}/journeys/${journeyId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'USER_ENDED' }),
    });
    if (res.ok) {
      console.log(`[Journey] Finished on server: ${journeyId}`);
    }
  } catch (err) {
    console.warn('[Journey] Finish request failed (offline?) — marked locally:', err);
  }

  // Clean up local state regardless of server response
  await deleteJourneyState(journeyId);
  await setSyncMetadata('active_journey_id', '');
  _currentJourneyId = null;
}

// ── Restore Journey (app resume) ──────────────────────────────────────────────

export async function restoreActiveJourney(): Promise<JourneyStateRecord | null> {
  const savedId = await getSyncMetadata('active_journey_id');
  if (!savedId) return null;
  const state = await getJourneyState(savedId);
  return state || null;
}

// ── Get Active Journey ID ─────────────────────────────────────────────────────

export function getCurrentJourneyId(): string | null {
  return _currentJourneyId;
}

export function setCurrentJourneyId(id: string | null): void {
  _currentJourneyId = id;
}
