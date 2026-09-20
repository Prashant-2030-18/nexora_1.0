import React, { useRef, useEffect, useState } from 'react';
import {
  RotateCcw, Compass, ZoomIn, ZoomOut, Eye, Layers,
  Maximize2, AlertTriangle, Mountain, ShieldCheck, MapPin
} from 'lucide-react';
import { IncidentData } from '../types';

export interface Map3DViewProps {
  origin?: { lat: number; lng: number; name?: string } | null;
  destination?: { lat: number; lng: number; name?: string } | null;
  routeCoordinates?: number[][]; // [lon, lat]
  incidents?: IncidentData[];
  height?: string;
  strategyName?: string;
  distanceKm?: number;
  etaFormatted?: string;
  onWebGlFail?: () => void;
}

export const Map3DView: React.FC<Map3DViewProps> = ({
  origin = null,
  destination = null,
  routeCoordinates = [],
  incidents = [],
  height = '580px',
  strategyName = 'Route',
  distanceKm,
  etaFormatted,
  onWebGlFail,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 3D Camera & Orientation State
  const [pitch, setPitch] = useState(55);
  const [bearing, setBearing] = useState(25);
  const [zoomLevel, setZoomLevel] = useState(1.1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'rotate' | 'pan'>('rotate');
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hasWebGl, setHasWebGl] = useState(true);
  const [viewMode, setViewMode] = useState<'terrain' | 'perspective' | 'route' | 'top'>('perspective');
  const terrainAvailable = false; // No real elevation provider configured — do not invent values

  const handleResetCamera = () => {
    setPitch(viewMode === 'top' ? 5 : 55);
    setBearing(25);
    setZoomLevel(1.1);
    setPanOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setHasWebGl(false);
      onWebGlFail?.();
      return;
    }

    let animationFrameId: number;

    const render3DScene = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Gradient Atmospheric Sky & Mountain Horizon
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, '#030712');
      skyGrad.addColorStop(0.35, '#0b1329');
      skyGrad.addColorStop(0.7, '#0f172a');
      skyGrad.addColorStop(1, '#020617');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Save transform
      ctx.save();

      // Apply Pan & Center
      const centerX = width / 2 + panOffset.x;
      const centerY = height * 0.62 + panOffset.y;
      ctx.translate(centerX, centerY);

      // Pitch & Bearing transformation matrices (Isometric / 2.5D elevation perspective)
      const pitchRad = (pitch * Math.PI) / 180;
      const bearingRad = (bearing * Math.PI) / 180;
      const cosB = Math.cos(bearingRad);
      const sinB = Math.sin(bearingRad);
      const cosP = Math.cos(pitchRad);
      const scale = 3.8 * zoomLevel;

      // 3D coordinate projector to 2D screen space
      const project3D = (x: number, y: number, z: number): [number, number] => {
        // Rotate by bearing (Y-axis)
        const rx = x * cosB - y * sinB;
        const ry = x * sinB + y * cosB;
        // Pitch by tilt (X-axis)
        const screenX = rx * scale;
        const screenY = (ry * cosP - z) * scale;
        return [screenX, screenY];
      };

      // 1. Draw 3D Topographic Terrain Relief Grid (Mountain Corridors)
      const gridSize = 16;
      const step = 20;

      // Draw elevation mesh lines
      ctx.lineWidth = 1;
      for (let i = -gridSize; i <= gridSize; i++) {
        // X-parallel contours
        ctx.beginPath();
        let started = false;
        for (let j = -gridSize; j <= gridSize; j++) {
          const wx = i * step;
          const wy = j * step;
          // Deterministic mountain elevation equation when terrain DEM is available; otherwise 0 (flat 3D)
          const distFromCenter = Math.sqrt(wx * wx + wy * wy);
          const elev = terrainAvailable
            ? Math.max(
                0,
                Math.sin(wx * 0.04) * Math.cos(wy * 0.04) * 22 +
                  Math.sin(distFromCenter * 0.03) * 16 -
                  distFromCenter * 0.04
              )
            : 0;

          const [sx, sy] = project3D(wx, wy, elev);
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.stroke();

        // Y-parallel contours
        ctx.beginPath();
        started = false;
        for (let j = -gridSize; j <= gridSize; j++) {
          const wx = j * step;
          const wy = i * step;
          const distFromCenter = Math.sqrt(wx * wx + wy * wy);
          const elev = terrainAvailable
            ? Math.max(
                0,
                Math.sin(wx * 0.04) * Math.cos(wy * 0.04) * 22 +
                  Math.sin(distFromCenter * 0.03) * 16 -
                  distFromCenter * 0.04
              )
            : 0;

          const [sx, sy] = project3D(wx, wy, elev);
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
        ctx.stroke();
      }

      // 2. Project Route Path through 3D Mountain Valley
      const waypoints =
        routeCoordinates.length > 1
          ? routeCoordinates
          : [
              [91.7362, 26.1445],
              [91.78, 26.0],
              [91.82, 25.85],
              [91.86, 25.7],
              [91.8933, 25.5788],
            ];

      // Calculate bounding box for normalization
      const minLon = Math.min(...waypoints.map((w) => w[0]));
      const maxLon = Math.max(...waypoints.map((w) => w[0])) || minLon + 0.01;
      const minLat = Math.min(...waypoints.map((w) => w[1]));
      const maxLat = Math.max(...waypoints.map((w) => w[1])) || minLat + 0.01;

      const toLocal3D = (lon: number, lat: number) => {
        const nx = ((lon - minLon) / (maxLon - minLon) - 0.5) * 320;
        const ny = ((lat - minLat) / (maxLat - minLat) - 0.5) * 320;
        const elev = terrainAvailable ? Math.sin(nx * 0.03) * 12 + 8 : 0;
        return { x: nx, y: ny, z: elev };
      };

      // 3. Draw 3D Hazard Impact Cylinders (SACHET NDMA Real Alerts)
      incidents.forEach((inc) => {
        if (!inc.latitude || !inc.longitude) return;
        const loc = toLocal3D(inc.longitude, inc.latitude);
        const [baseX, baseY] = project3D(loc.x, loc.y, 0);
        const [topX, topY] = project3D(loc.x, loc.y, loc.z + 24);

        const isCrit = inc.severity?.toLowerCase() === 'critical';
        const color = isCrit ? 'rgba(239, 68, 68, 0.65)' : 'rgba(245, 158, 11, 0.65)';
        const fillCol = isCrit ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.12)';

        // Base disc
        ctx.beginPath();
        ctx.ellipse(baseX, baseY, 24 * zoomLevel, 12 * zoomLevel, 0, 0, Math.PI * 2);
        ctx.fillStyle = fillCol;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Elevation vertical pillar
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(topX, topY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 3D Danger Beacon
        ctx.beginPath();
        ctx.arc(topX, topY, 5 * zoomLevel, 0, Math.PI * 2);
        ctx.fillStyle = isCrit ? '#ef4444' : '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 4. Draw 3D Route Ribbon (Elevated Corridor)
      if (waypoints.length > 1) {
        // Shadow on valley ground
        ctx.beginPath();
        waypoints.forEach((w, idx) => {
          const loc = toLocal3D(w[0], w[1]);
          const [sx, sy] = project3D(loc.x, loc.y, 0);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.25)';
        ctx.lineWidth = 6 * zoomLevel;
        ctx.stroke();

        // Elevated primary road line
        ctx.beginPath();
        waypoints.forEach((w, idx) => {
          const loc = toLocal3D(w[0], w[1]);
          const [sx, sy] = project3D(loc.x, loc.y, loc.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5 * zoomLevel;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Glowing center core
        ctx.beginPath();
        waypoints.forEach((w, idx) => {
          const loc = toLocal3D(w[0], w[1]);
          const [sx, sy] = project3D(loc.x, loc.y, loc.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * zoomLevel;
        ctx.stroke();
      }

      // 5. Origin 3D Pin & Pillar
      if (origin) {
        const origLoc = toLocal3D(origin.lng, origin.lat);
        const [baseX, baseY] = project3D(origLoc.x, origLoc.y, 0);
        const [pinX, pinY] = project3D(origLoc.x, origLoc.y, origLoc.z + 20);

        // Ground anchor
        ctx.beginPath();
        ctx.arc(baseX, baseY, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.fill();

        // Pin vertical pillar
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(pinX, pinY);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pin sphere
        ctx.beginPath();
        ctx.arc(pinX, pinY, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.font = 'bold 11px system-ui';
        ctx.fillStyle = '#34d399';
        ctx.fillText(`🟢 Origin: ${origin.name || 'Start'}`, pinX + 10, pinY + 3);
      }

      // 6. Destination 3D Pin & Pillar
      if (destination) {
        const destLoc = toLocal3D(destination.lng, destination.lat);
        const [baseX, baseY] = project3D(destLoc.x, destLoc.y, 0);
        const [pinX, pinY] = project3D(destLoc.x, destLoc.y, destLoc.z + 20);

        ctx.beginPath();
        ctx.arc(baseX, baseY, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(pinX, pinY);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pinX, pinY, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 11px system-ui';
        ctx.fillStyle = '#f87171';
        ctx.fillText(`🏁 Dest: ${destination.name || 'Goal'}`, pinX + 10, pinY + 3);
      }

      ctx.restore();
    };

    render3DScene();

    // Resize observer
    const handleResize = () => {
      if (canvas) {
        canvas.width = canvas.parentElement?.clientWidth || 800;
        canvas.height = canvas.parentElement?.clientHeight || 580;
        render3DScene();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [pitch, bearing, zoomLevel, panOffset, origin, destination, routeCoordinates, incidents]);

  // Mouse drag handlers for Orbit Rotation and Pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragMode(e.button === 2 || e.shiftKey ? 'pan' : 'rotate');
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    setLastMouse({ x: e.clientX, y: e.clientY });

    if (dragMode === 'rotate') {
      setBearing((b) => (b + dx * 0.6) % 360);
      setPitch((p) => Math.max(15, Math.min(80, p - dy * 0.4)));
    } else {
      setPanOffset((pos) => ({ x: pos.x + dx, y: pos.y + dy }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoomLevel((z) => Math.max(0.5, Math.min(3.5, z * factor)));
  };

  if (!hasWebGl) {
    return (
      <div
        className="w-full rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-8 text-center space-y-3"
        style={{ height }}
      >
        <Mountain className="w-12 h-12 text-slate-600" />
        <div className="text-base font-bold text-slate-300">3D terrain data unavailable.</div>
        <p className="text-xs text-slate-500 max-w-sm">
          Your browser or hardware environment does not support 3D canvas acceleration. Switch to the 2D Map view.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col"
      style={{ height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Top Left: 3D Corridor Info Card */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-700/80 shadow-2xl pointer-events-none text-xs space-y-1">
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-sky-400" />
          <span className="font-bold text-white uppercase tracking-wider text-[11px] font-mono">
            3D Perspective Map
          </span>
        </div>
        <div className="text-slate-300 font-semibold">
          {origin?.name || 'Origin'} ➔ {destination?.name || 'Destination'}
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
          <span>Profile: {strategyName}</span>
          {distanceKm != null && <><span>•</span><span>{distanceKm} km</span></>}
          {etaFormatted && <><span>•</span><span>ETA: {etaFormatted}</span></>}
        </div>
        {!terrainAvailable && (
          <div className="text-[10px] text-amber-300 font-mono mt-1 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-amber-400 shrink-0" />
            <span>TERRAIN ELEVATION DATA UNAVAILABLE — DISPLAYING FLAT 3D PERSPECTIVE</span>
          </div>
        )}
      </div>

      {/* Top Right: 3D Camera Controls + Modes */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-2xl flex gap-1 text-[9px] font-bold">
          {([
            ['perspective', 'Perspective'],
            ['terrain', 'Terrain'],
            ['route', 'Route'],
            ['top', 'Top'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setViewMode(id);
                if (id === 'top') setPitch(8);
                else if (id === 'route') setPitch(45);
                else if (id === 'terrain') setPitch(62);
                else setPitch(55);
              }}
              className={`px-2 py-1 rounded-lg ${viewMode === id ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl text-slate-300 flex flex-col gap-1">
        <button
          onClick={() => setZoomLevel((z) => Math.min(3.5, z * 1.15))}
          title="Zoom In"
          className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4 text-sky-400" />
        </button>
        <button
          onClick={() => setZoomLevel((z) => Math.max(0.5, z * 0.85))}
          title="Zoom Out"
          className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
        >
          <ZoomOut className="w-4 h-4 text-sky-400" />
        </button>
        <button
          onClick={() => setBearing((b) => (b + 45) % 360)}
          title="Rotate 45°"
          className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
        >
          <Compass className="w-4 h-4 text-teal-400" />
        </button>
        <button
          onClick={handleResetCamera}
          title="Reset 3D Perspective"
          className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
        </button>
        </div>
      </div>

      {/* Bottom Floating Legend & Camera Telemetry */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-[11px] text-slate-300 flex flex-wrap items-center gap-3 shadow-xl">
          <div className="flex items-center gap-1.5"><span className="w-3 h-1 bg-sky-400 rounded-full inline-block"></span><span>Route</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span><span>Origin</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span><span>Destination</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span><span>Current position</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span><span>Official hazard</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span><span>User report</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span><span>Road closure</span></div>
          {!terrainAvailable && <span className="text-amber-300 font-mono text-[10px]">Terrain unavailable</span>}
          <div className="text-slate-400 font-mono text-[10px]">
            Pitch: {Math.round(pitch)}° | Bearing: {Math.round(bearing)}° | {viewMode}
          </div>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-[10px] text-slate-400 hidden sm:block">
          Left-drag: <strong>Rotate & Tilt</strong> | Shift-drag / Right-drag: <strong>Pan</strong> | Scroll: <strong>Zoom</strong>
        </div>
      </div>
    </div>
  );
};
export default Map3DView;
