/**
 * Centralized Coordinate Validation and Normalization Utilities for NEXORA
 * Prevents "Invalid LatLng object: (undefined, undefined)" across Leaflet, MapLibre, and Google Maps.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface NamedLocation extends LatLngPoint {
  name?: string;
}

export const DEFAULT_MAP_CENTER: [number, number] = [26.1445, 91.7362]; // Guwahati default [lat, lng]
export const DEFAULT_MAPLIBRE_CENTER: [number, number] = [91.7362, 26.1445]; // [lng, lat]

/**
 * Validates if latitude and longitude are finite numbers within Earth geographic bounds
 */
export function isValidCoordinate(lat: any, lng: any): lat is number {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const nLat = typeof lat === 'number' ? lat : Number(lat);
  const nLng = typeof lng === 'number' ? lng : Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return false;
  }
  if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
    return false;
  }
  return nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
}

/**
 * Normalizes any object or array into a validated { lat, lng } or null
 */
export function normalizeLocation(input: any): LatLngPoint | null {
  if (!input) return null;

  // Object with { lat, lng }
  if (typeof input === 'object') {
    const lat = input.lat ?? input.latitude;
    const lng = input.lng ?? input.lon ?? input.longitude;
    if (isValidCoordinate(lat, lng)) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  // Array format: [lat, lng] or [lng, lat]
  if (Array.isArray(input) && input.length >= 2) {
    const a = Number(input[0]);
    const b = Number(input[1]);

    // Check if input is [lat, lng]
    if (isValidCoordinate(a, b)) {
      return { lat: a, lng: b };
    }
    // Check if input is [lng, lat]
    if (isValidCoordinate(b, a)) {
      return { lat: b, lng: a };
    }
  }

  return null;
}

/**
 * Converts input to Leaflet [lat, lng] tuple safely. Returns null if invalid.
 */
export function toLeafletLatLng(input: any): [number, number] | null {
  const norm = normalizeLocation(input);
  if (!norm) return null;
  return [norm.lat, norm.lng];
}

/**
 * Converts input to MapLibre / GeoJSON [lng, lat] tuple safely. Returns null if invalid.
 */
export function toMapLibreLngLat(input: any): [number, number] | null {
  const norm = normalizeLocation(input);
  if (!norm) return null;
  return [norm.lng, norm.lat];
}

/**
 * Resolves safe map center from priority list of coordinate candidates.
 * Guaranteed to NEVER return [undefined, undefined] or [NaN, NaN].
 */
export function resolveSafeCenter(
  candidates: any[],
  fallback: [number, number] = DEFAULT_MAP_CENTER
): [number, number] {
  for (const c of candidates) {
    const valid = toLeafletLatLng(c);
    if (valid) return valid;
  }
  return fallback;
}

/**
 * Cleans an array of raw coordinates (e.g. from OSRM [[lon, lat], ...]) into valid Leaflet [lat, lng] tuples.
 * Filters out invalid, undefined, null, or out-of-range coordinates.
 */
export function cleanPolylineCoords(coords: any): [number, number][] {
  if (!coords || !Array.isArray(coords)) return [];
  const results: [number, number][] = [];

  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    // OSRM provides [lon, lat]
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);

    if (isValidCoordinate(lat, lon)) {
      results.push([lat, lon]);
    } else if (isValidCoordinate(lon, lat)) {
      // In case array was already [lat, lon]
      results.push([lon, lat]);
    }
  }

  return results;
}

/**
 * Cleans an array of coordinates into valid GeoJSON / MapLibre [lng, lat] tuples.
 */
export function cleanGeoJsonCoords(coords: any): [number, number][] {
  if (!coords || !Array.isArray(coords)) return [];
  const results: [number, number][] = [];

  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const a = Number(pt[0]);
    const b = Number(pt[1]);

    // Standard GeoJSON is [lng, lat]
    if (isValidCoordinate(b, a)) {
      results.push([a, b]);
    } else if (isValidCoordinate(a, b)) {
      results.push([b, a]);
    }
  }

  return results;
}
