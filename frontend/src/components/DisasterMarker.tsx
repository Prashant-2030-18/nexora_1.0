import React from 'react';
import { Marker, Popup, Tooltip, Circle } from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Mountain, Waves, CloudLightning, Wind, Activity,
  Flame, CloudRain, Sun, SunMedium, AlertTriangle, ShieldAlert, ExternalLink, Clock
} from 'lucide-react';
import { DisasterAlertData } from '../types';

export interface NormalizedGeometry {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  hasValidLocation: boolean;
  polygonPositions?: [number, number][];
}

/**
 * Universal disaster geometry normalizer.
 * Correctly detects coordinate order (e.g. [lon, lat] vs [lat, lon]) based on Indian geographic bounds.
 * Never invents coordinates; flags hasValidLocation = false if missing or outside valid range.
 */
export function normalizeDisasterGeometry(alert: DisasterAlertData): NormalizedGeometry {
  let lat: number | null = null;
  let lon: number | null = null;
  let radiusMeters = 10000;
  let hasValid = false;
  let polygonPositions: [number, number][] | undefined = undefined;

  // 1. Direct properties if already normalized by backend
  if (
    typeof alert.latitude === 'number' &&
    typeof alert.longitude === 'number' &&
    !Number.isNaN(alert.latitude) &&
    !Number.isNaN(alert.longitude)
  ) {
    const v1 = alert.latitude;
    const v2 = alert.longitude;
    // Check if within India bounds
    if (v1 >= 6.0 && v1 <= 38.5 && v2 >= 68.0 && v2 <= 98.5) {
      lat = v1;
      lon = v2;
      hasValid = true;
    } else if (v1 >= 68.0 && v1 <= 98.5 && v2 >= 6.0 && v2 <= 38.5) {
      lat = v2;
      lon = v1;
      hasValid = true;
    } else if (v1 >= -90 && v1 <= 90 && v2 >= -180 && v2 <= 180) {
      lat = v1;
      lon = v2;
      hasValid = true;
    }
    if (alert.radius_km && alert.radius_km > 0) {
      radiusMeters = alert.radius_km * 1000;
    }
  }

  // 2. Parse circle_coordinates if lat/lon not yet confirmed
  if (!hasValid && alert.circle_coordinates) {
    const coordStr = String(alert.circle_coordinates).trim();
    const nums = coordStr.match(/[-+]?\d*\.?\d+/g)?.map(Number) || [];
    if (nums.length >= 2) {
      const v1 = nums[0];
      const v2 = nums[1];
      if (nums.length >= 3 && nums[2] > 0) {
        radiusMeters = nums[2] * 1000;
      }
      if (v1 >= 6.0 && v1 <= 38.5 && v2 >= 68.0 && v2 <= 98.5) {
        lat = v1;
        lon = v2;
        hasValid = true;
      } else if (v1 >= 68.0 && v1 <= 98.5 && v2 >= 6.0 && v2 <= 38.5) {
        lat = v2;
        lon = v1;
        hasValid = true;
      } else if (v1 >= -90 && v1 <= 90 && v2 >= -180 && v2 <= 180) {
        lat = v1;
        lon = v2;
        hasValid = true;
      }
    }
  }

  // 3. Parse polygon_geojson if circle coordinates unavailable
  if (!hasValid && alert.polygon_geojson) {
    try {
      const raw = alert.polygon_geojson.trim();
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        const coords = parsed.coordinates;
        const ring = Array.isArray(coords?.[0]) ? coords[0] : coords;
        if (Array.isArray(ring) && ring.length > 0) {
          const lats = ring.map((pt: any) => pt[1]);
          const lons = ring.map((pt: any) => pt[0]);
          lat = lats.reduce((a: number, b: number) => a + b, 0) / lats.length;
          lon = lons.reduce((a: number, b: number) => a + b, 0) / lons.length;
          polygonPositions = ring.map((pt: any) => [pt[1], pt[0]] as [number, number]);
          hasValid = true;
        }
      } else {
        // Space separated CAP polygon
        const pairs = raw.split(/\s+/).map((pair) => pair.split(',').map(Number));
        if (pairs.length > 0 && pairs[0].length === 2) {
          const lats = pairs.map((p) => p[0]);
          const lons = pairs.map((p) => p[1]);
          lat = lats.reduce((a, b) => a + b, 0) / lats.length;
          lon = lons.reduce((a, b) => a + b, 0) / lons.length;
          polygonPositions = pairs.map((p) => [p[0], p[1]] as [number, number]);
          hasValid = true;
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    latitude: hasValid ? lat : null,
    longitude: hasValid ? lon : null,
    radiusMeters,
    hasValidLocation: hasValid,
    polygonPositions: alert.polygon_positions || polygonPositions,
  };
}

/**
 * Standardize event text into one of the designated disaster categories.
 */
export function getDisasterCategory(eventText?: string): string {
  const ev = (eventText || '').toUpperCase();
  if (ev.includes('LANDSLIDE') || ev.includes('MUDSLIDE') || ev.includes('ROCKFALL')) return 'LANDSLIDE';
  if (ev.includes('FLOOD') || ev.includes('INUNDATION')) return 'FLOOD';
  if (ev.includes('THUNDERSTORM') || ev.includes('LIGHTNING') || ev.includes('THUNDER')) return 'THUNDERSTORM';
  if (ev.includes('CYCLONE') || ev.includes('GALE') || ev.includes('SQUALL') || ev.includes('WIND') || ev.includes('STORM')) return 'CYCLONE';
  if (ev.includes('EARTHQUAKE') || ev.includes('TREMOR') || ev.includes('SEISMIC')) return 'EARTHQUAKE';
  if (ev.includes('FIRE') || ev.includes('WILDFIRE')) return 'FIRE';
  if (ev.includes('HEAVY RAIN') || ev.includes('RAINFALL') || ev.includes('DOWNPOUR') || ev.includes('PRECIPITATION')) return 'HEAVY RAIN';
  if (ev.includes('HEAT') || ev.includes('HEATWAVE')) return 'HEATWAVE';
  if (ev.includes('DROUGHT')) return 'DROUGHT';
  if (ev.includes('TSUNAMI')) return 'TSUNAMI';
  return 'OTHER';
}

/**
 * Severity colors mapping.
 */
export function getSeverityColor(severity?: string): { bg: string; border: string; text: string; label: string } {
  const s = (severity || '').toUpperCase();
  if (s.includes('CRIT')) {
    return { bg: '#dc2626', border: '#ef4444', text: '#fca5a5', label: 'CRITICAL' };
  }
  if (s.includes('HIGH') || s.includes('SEV')) {
    return { bg: '#ea580c', border: '#f97316', text: '#fdba74', label: 'HIGH' };
  }
  if (s.includes('MED') || s.includes('MOD')) {
    return { bg: '#d97706', border: '#f59e0b', text: '#fde68a', label: 'MEDIUM' };
  }
  if (s.includes('LOW') || s.includes('MIN')) {
    return { bg: '#15803d', border: '#22c55e', text: '#86efac', label: 'LOW' };
  }
  return { bg: '#475569', border: '#64748b', text: '#cbd5e1', label: 'UNKNOWN' };
}

/**
 * Render Lucide React icon element for a given category.
 */
export function renderDisasterIconComponent(category: string, size = 18, color = '#ffffff') {
  switch (category) {
    case 'LANDSLIDE':
      return <Mountain size={size} color={color} strokeWidth={2.4} />;
    case 'FLOOD':
      return <Waves size={size} color={color} strokeWidth={2.4} />;
    case 'THUNDERSTORM':
      return <CloudLightning size={size} color={color} strokeWidth={2.4} />;
    case 'CYCLONE':
      return <Wind size={size} color={color} strokeWidth={2.4} />;
    case 'EARTHQUAKE':
      return <Activity size={size} color={color} strokeWidth={2.4} />;
    case 'FIRE':
      return <Flame size={size} color={color} strokeWidth={2.4} />;
    case 'HEAVY RAIN':
      return <CloudRain size={size} color={color} strokeWidth={2.4} />;
    case 'HEATWAVE':
      return <Sun size={size} color={color} strokeWidth={2.4} />;
    case 'DROUGHT':
      return <SunMedium size={size} color={color} strokeWidth={2.4} />;
    case 'TSUNAMI':
      return <Waves size={size} color={color} strokeWidth={2.4} />;
    case 'OTHER':
    default:
      return <AlertTriangle size={size} color={color} strokeWidth={2.4} />;
  }
}

/**
 * Creates Leaflet divIcon with official disaster logo and severity styling.
 */
export function createDisasterDivIcon(category: string, severity?: string, isSelected = false): L.DivIcon {
  const sev = getSeverityColor(severity);
  const isPulse = sev.label === 'CRITICAL' || sev.label === 'HIGH' || isSelected;
  const iconSvg = renderToStaticMarkup(renderDisasterIconComponent(category, 18, '#ffffff'));
  const size = isSelected ? 42 : 36;

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
      ${
        isPulse
          ? `<span style="
              position: absolute;
              inset: -5px;
              border-radius: 9999px;
              border: 2px solid ${sev.border};
              animation: pulse-ring 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
              pointer-events: none;
            "></span>`
          : ''
      }
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 9999px;
        background: radial-gradient(circle at 35% 35%, ${sev.border} 0%, ${sev.bg} 85%);
        border: 2.5px solid ${isSelected ? '#38bdf8' : '#ffffff'};
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7), inset 0 1px 2px rgba(255,255,255,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease;
      ">
        ${iconSvg}
      </div>
      <span style="
        position: absolute;
        bottom: -3px;
        right: -3px;
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        background-color: ${sev.border};
        border: 1.5px solid #0f172a;
      "></span>
    </div>
  `;

  return L.divIcon({
    className: 'nexora-disaster-marker-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

export interface DisasterMarkerProps {
  alert: DisasterAlertData;
  showZone?: boolean;
  isSelected?: boolean;
  onSelect?: (alert: DisasterAlertData) => void;
}

/**
 * Reusable Leaflet Disaster Marker Component.
 */
export const DisasterMarkerLeaflet: React.FC<DisasterMarkerProps> = ({
  alert,
  showZone = true,
  isSelected = false,
  onSelect,
}) => {
  const geom = normalizeDisasterGeometry(alert);
  if (!geom.hasValidLocation || geom.latitude === null || geom.longitude === null) {
    return null;
  }

  const category = getDisasterCategory(alert.event || alert.disaster_type || alert.event_type);
  const sev = getSeverityColor(alert.severity || alert.raw_severity);
  const icon = createDisasterDivIcon(category, alert.severity || alert.raw_severity, isSelected);

  const officialUrl =
    alert.source_url ||
    (alert.identifier
      ? `https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=${alert.identifier}`
      : 'https://sachet.ndma.gov.in');

  return (
    <>
      <Marker
        position={[geom.latitude, geom.longitude]}
        icon={icon}
        eventHandlers={{
          click: () => onSelect && onSelect(alert),
        }}
      >
        <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
          <div className="text-xs font-semibold">
            <span className="font-bold uppercase text-[10px] px-1 py-0.5 rounded mr-1" style={{ backgroundColor: sev.bg, color: '#fff' }}>
              {sev.label}
            </span>
            <span>{alert.event || category}</span>
          </div>
        </Tooltip>

        <Popup className="nexora-cap-popup" minWidth={290} maxWidth={360}>
          <div className="p-1 space-y-2 text-slate-100 font-sans text-xs">
            {/* Header Badge Row */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider font-mono text-white shadow-sm"
                  style={{ backgroundColor: sev.bg }}
                >
                  {sev.label}
                </span>
                <span className="text-[10px] font-bold text-sky-400 font-mono">
                  {category}
                </span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-700 px-1.5 py-0.5 rounded">
                NDMA SACHET
              </span>
            </div>

            {/* Event Name & Headline */}
            <div>
              <h4 className="font-bold text-sm text-white leading-tight">
                {alert.event || 'Natural Disaster Alert'}
              </h4>
              {alert.headline && alert.headline !== alert.event && (
                <p className="text-[11px] text-slate-300 font-medium mt-0.5 leading-snug">
                  {alert.headline}
                </p>
              )}
            </div>

            {/* Area */}
            {(alert.area_description || alert.area) && (
              <div className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 text-[11px]">
                <span className="text-slate-400 font-semibold">Affected Area: </span>
                <span className="text-slate-200">{alert.area_description || alert.area}</span>
              </div>
            )}

            {/* Full description */}
            {alert.description && (
              <p className="text-[11px] text-slate-300 max-h-24 overflow-y-auto leading-relaxed scrollbar-thin">
                {alert.description}
              </p>
            )}

            {/* Instruction if available */}
            {alert.instruction && (
              <div className="text-[10px] text-amber-200 bg-amber-950/40 p-1.5 rounded border border-amber-800/60">
                <strong>Instruction:</strong> {alert.instruction}
              </div>
            )}

            {/* Telemetry metadata */}
            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800">
              <div>Urgency: <strong className="text-slate-200">{alert.urgency || 'Unknown'}</strong></div>
              <div>Certainty: <strong className="text-slate-200">{alert.certainty || 'Unknown'}</strong></div>
              {alert.sent_at && <div>Issued: <span className="text-slate-300">{new Date(alert.sent_at).toLocaleDateString()}</span></div>}
              {alert.expires_at && <div>Expires: <span className="text-amber-300">{new Date(alert.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}
            </div>

            {/* Footer with CAP Identifier & Official URL Link */}
            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
              <span className="font-mono text-slate-500 truncate max-w-[140px]" title={alert.identifier}>
                ID: {alert.identifier || alert.id}
              </span>
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
              >
                <span>VIEW OFFICIAL ALERT</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </Popup>
      </Marker>

      {/* Disaster Zone Impact Buffer */}
      {showZone && (
        <Circle
          center={[geom.latitude, geom.longitude]}
          radius={geom.radiusMeters}
          pathOptions={{
            color: sev.border,
            fillColor: sev.bg,
            fillOpacity: isSelected ? 0.26 : 0.16,
            weight: isSelected ? 2.5 : 1.5,
            dashArray: sev.label === 'CRITICAL' ? undefined : '5, 6',
          }}
        />
      )}
    </>
  );
};
