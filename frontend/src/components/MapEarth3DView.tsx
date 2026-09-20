import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Globe, Compass, Eye, ShieldAlert, Layers, MapPin, ZoomIn, ZoomOut,
  RotateCw, Navigation, AlertTriangle, RefreshCw, Maximize2, Minimize2,
  Info, Sparkles, CheckCircle2
} from 'lucide-react';
import { DistrictData, LogisticsHubData, WarehouseData, IncidentData } from '../types';

export interface MapCandidateRoute {
  strategy: 'fastest' | 'cheapest' | 'safest' | 'reliable' | string;
  name?: string;
  distance_km: number;
  eta_formatted: string;
  total_cost_inr?: number;
  risk_score: number;
  hazards_on_route?: number;
  geometry_coordinates: number[][]; // [lon, lat]
  color?: string;
}

export interface MapEarth3DViewProps {
  origin?: { lat: number; lng: number; name?: string };
  destination?: { lat: number; lng: number; name?: string };
  routeCoordinates?: number[][]; // [lon, lat]
  routes?: {
    fastest?: MapCandidateRoute;
    cheapest?: MapCandidateRoute;
    safest?: MapCandidateRoute;
    reliable?: MapCandidateRoute;
  };
  activeStrategy?: string;
  incidents?: IncidentData[];
  districts?: DistrictData[];
  hubs?: LogisticsHubData[];
  warehouses?: WarehouseData[];
  height?: string;
  className?: string;
  onSelectIncident?: (incident: IncidentData) => void;
}

export const latLonToVector3 = (lat: number, lon: number, radius: number): THREE.Vector3 => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
};

export const MapEarth3DView: React.FC<MapEarth3DViewProps> = ({
  origin,
  destination,
  routeCoordinates,
  routes,
  activeStrategy = 'fastest',
  incidents = [],
  districts = [],
  hubs = [],
  warehouses = [],
  height = '620px',
  className = '',
  onSelectIncident,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotationVelocityRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const targetDistanceRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<{
    routes: boolean;
    hazards: boolean;
    hubs: boolean;
  }>({
    routes: true,
    hazards: true,
    hubs: true,
  });

  const [telemetry, setTelemetry] = useState({
    pitch: 26.2,
    yaw: 92.9,
    altitudeKm: 2400,
    zoomLevel: 'Sub-Continental',
  });

  const effectiveRouteCoordinates = useMemo(() => {
    if (routes && activeStrategy && routes[activeStrategy as keyof typeof routes]) {
      return routes[activeStrategy as keyof typeof routes]?.geometry_coordinates || [];
    }
    if (routeCoordinates && routeCoordinates.length > 0) {
      return routeCoordinates;
    }
    if (routes?.fastest?.geometry_coordinates) {
      return routes.fastest.geometry_coordinates;
    }
    return [];
  }, [routes, activeStrategy, routeCoordinates]);

  const generateEarthTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGrad.addColorStop(0, '#061325');
    oceanGrad.addColorStop(0.5, '#0b1d3a');
    oceanGrad.addColorStop(1, '#061325');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += canvas.width / 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += canvas.height / 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const mapLon = (lon: number) => ((lon + 180) / 360) * canvas.width;
    const mapLat = (lat: number) => ((90 - lat) / 180) * canvas.height;

    const drawLandmass = (coords: [number, number][], fill: string) => {
      if (coords.length < 3) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(mapLon(coords[0][0]), mapLat(coords[0][1]));
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(mapLon(coords[i][0]), mapLat(coords[i][1]));
      }
      ctx.closePath();
      ctx.fill();
    };

    const indiaOutline: [number, number][] = [
      [68.1, 24.5], [68.7, 27.5], [74.5, 33.5], [77.5, 35.5], [80.3, 31.0],
      [88.2, 27.8], [92.0, 27.8], [97.4, 28.5], [97.2, 26.5], [95.0, 23.5],
      [92.5, 21.0], [89.0, 21.8], [86.0, 20.0], [80.2, 13.0], [77.5, 8.1],
      [76.0, 10.0], [73.5, 15.5], [72.8, 19.0], [68.1, 24.5]
    ];
    drawLandmass(indiaOutline, '#133527');

    const nerOutline: [number, number][] = [
      [89.8, 26.5], [92.0, 27.8], [97.4, 28.5], [97.2, 26.5],
      [95.5, 24.0], [93.0, 22.0], [92.0, 24.0], [90.0, 25.0], [89.8, 26.5]
    ];
    drawLandmass(nerOutline, '#1e5338');

    const eurasia: [number, number][] = [
      [-10.0, 36.0], [10.0, 55.0], [40.0, 68.0], [100.0, 75.0], [170.0, 65.0],
      [140.0, 35.0], [105.0, 10.0], [95.0, 20.0], [80.0, 28.0], [60.0, 25.0],
      [40.0, 30.0], [10.0, 36.0], [-10.0, 36.0]
    ];
    drawLandmass(eurasia, '#11221c');

    const africa: [number, number][] = [
      [-17.0, 15.0], [10.0, 37.0], [51.0, 12.0], [40.0, -10.0],
      [20.0, -35.0], [12.0, -10.0], [-17.0, 15.0]
    ];
    drawLandmass(africa, '#1a2618');

    const australia: [number, number][] = [
      [113.0, -22.0], [130.0, -12.0], [153.0, -28.0], [140.0, -38.0], [115.0, -34.0], [113.0, -22.0]
    ];
    drawLandmass(australia, '#2a2216');

    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.ellipse(mapLon(88.0), mapLat(28.5), 120, 14, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let c = 0; c < 15; c++) {
      ctx.beginPath();
      const cy = 200 + Math.random() * 600;
      ctx.ellipse(Math.random() * canvas.width, cy, 180 + Math.random() * 200, 30 + Math.random() * 40, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    try {
      const width = container.clientWidth || 800;
      const heightPx = container.clientHeight || 600;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x030712);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
      camera.position.set(0, 0, 180);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setSize(width, heightPx);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const globeRadius = 50;
      const globeGroup = new THREE.Group();
      scene.add(globeGroup);
      globeGroupRef.current = globeGroup;

      const earthTexture = generateEarthTexture();
      const sphereGeometry = new THREE.SphereGeometry(globeRadius, 64, 64);
      const sphereMaterial = new THREE.MeshPhongMaterial({
        map: earthTexture,
        shininess: 12,
        specular: new THREE.Color(0x1e3a5f),
      });
      const earthMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
      globeGroup.add(earthMesh);

      const atmosphereGeo = new THREE.SphereGeometry(globeRadius * 1.025, 64, 64);
      const atmosphereMat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.72 - dot(vNormal, vec3(0, 0, 1.0)), 2.2);
            gl_FragColor = vec4(0.22, 0.74, 0.97, 1.0) * intensity * 0.9;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      });
      const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
      globeGroup.add(atmosphereMesh);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
      sunLight.position.set(150, 80, 120);
      scene.add(sunLight);

      const starGeo = new THREE.BufferGeometry();
      const starCount = 800;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        starPos[i] = (Math.random() - 0.5) * 800;
        starPos[i + 1] = (Math.random() - 0.5) * 800;
        starPos[i + 2] = (Math.random() - 0.5) * 800;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 1.2, transparent: true, opacity: 0.6 });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      const targetPhi = (22.0 * Math.PI) / 180;
      const targetTheta = (82.0 * Math.PI) / 180;
      globeGroup.rotation.x = targetPhi * 0.4;
      globeGroup.rotation.y = -targetTheta - Math.PI / 2;

      const animate = () => {
        animFrameIdRef.current = requestAnimationFrame(animate);

        if (targetRotationRef.current) {
          globeGroup.rotation.x += (targetRotationRef.current.x - globeGroup.rotation.x) * 0.08;
          globeGroup.rotation.y += (targetRotationRef.current.y - globeGroup.rotation.y) * 0.08;
          if (
            Math.abs(targetRotationRef.current.x - globeGroup.rotation.x) < 0.001 &&
            Math.abs(targetRotationRef.current.y - globeGroup.rotation.y) < 0.001
          ) {
            targetRotationRef.current = null;
          }
        } else if (!isDraggingRef.current) {
          globeGroup.rotation.y += rotationVelocityRef.current.y;
          globeGroup.rotation.x += rotationVelocityRef.current.x;
          rotationVelocityRef.current.y *= 0.92;
          rotationVelocityRef.current.x *= 0.92;
        }

        if (targetDistanceRef.current && cameraRef.current) {
          cameraRef.current.position.z += (targetDistanceRef.current - cameraRef.current.position.z) * 0.08;
          if (Math.abs(targetDistanceRef.current - cameraRef.current.position.z) < 0.1) {
            targetDistanceRef.current = null;
          }
        }

        if (cameraRef.current) {
          const alt = Math.round(cameraRef.current.position.z * 20);
          setTelemetry(prev => ({
            ...prev,
            altitudeKm: alt,
            zoomLevel: alt > 3000 ? 'Global' : alt > 1800 ? 'Sub-Continental' : 'Regional Corridor',
          }));
        }

        renderer.render(scene, camera);
      };

      animate();
      setLoading(false);
    } catch (err: any) {
      setWebglError(String(err));
      setLoading(false);
    }

    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const globe = globeGroupRef.current;
    if (!globe) return;

    const toRemove: THREE.Object3D[] = [];
    globe.traverse((obj) => {
      if (obj.userData?.isDynamic) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      globe.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) (obj as any).material.dispose();
    });

    const globeRadius = 50;

    if (activeLayer.routes && effectiveRouteCoordinates.length > 1) {
      const points: THREE.Vector3[] = [];
      const step = Math.max(1, Math.floor(effectiveRouteCoordinates.length / 150));
      for (let i = 0; i < effectiveRouteCoordinates.length; i += step) {
        const [lon, lat] = effectiveRouteCoordinates[i];
        points.push(latLonToVector3(lat, lon, globeRadius * 1.008));
      }
      const last = effectiveRouteCoordinates[effectiveRouteCoordinates.length - 1];
      points.push(latLonToVector3(last[1], last[0], globeRadius * 1.008));

      const routeCurve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(routeCurve, Math.min(points.length * 2, 200), 0.35, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: activeStrategy === 'safest' ? 0x10b981 : 0x38bdf8,
      });
      const routeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      routeMesh.userData = { isDynamic: true };
      globe.add(routeMesh);
    }

    if (origin && origin.lat && origin.lng) {
      const pinPos = latLonToVector3(origin.lat, origin.lng, globeRadius * 1.015);
      const pinGeo = new THREE.CylinderGeometry(0.1, 0.4, 3, 12);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pinPos);
      pinMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pinPos.clone().normalize());
      pinMesh.userData = { isDynamic: true };
      globe.add(pinMesh);

      const ringGeo = new THREE.RingGeometry(0.6, 1.2, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(latLonToVector3(origin.lat, origin.lng, globeRadius * 1.005));
      ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringMesh.position.clone().normalize());
      ringMesh.userData = { isDynamic: true };
      globe.add(ringMesh);
    }

    if (destination && destination.lat && destination.lng) {
      const pinPos = latLonToVector3(destination.lat, destination.lng, globeRadius * 1.015);
      const pinGeo = new THREE.CylinderGeometry(0.1, 0.4, 3, 12);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pinPos);
      pinMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pinPos.clone().normalize());
      pinMesh.userData = { isDynamic: true };
      globe.add(pinMesh);

      const ringGeo = new THREE.RingGeometry(0.6, 1.2, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(latLonToVector3(destination.lat, destination.lng, globeRadius * 1.005));
      ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringMesh.position.clone().normalize());
      ringMesh.userData = { isDynamic: true };
      globe.add(ringMesh);
    }

    if (activeLayer.hazards && incidents.length > 0) {
      incidents.slice(0, 40).forEach((inc) => {
        if (inc.latitude && inc.longitude) {
          const isCrit = inc.severity === 'Critical' || inc.severity === 'Extreme' || inc.severity === 'Severe';
          const beaconPos = latLonToVector3(inc.latitude, inc.longitude, globeRadius * 1.01);
          const beaconGeo = new THREE.SphereGeometry(isCrit ? 0.75 : 0.5, 12, 12);
          const beaconMat = new THREE.MeshBasicMaterial({
            color: isCrit ? 0xdc2626 : 0xf59e0b,
          });
          const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
          beaconMesh.position.copy(beaconPos);
          beaconMesh.userData = { isDynamic: true, type: 'incident', data: inc };
          globe.add(beaconMesh);

          const bufferGeo = new THREE.RingGeometry(0.8, 1.6, 16);
          const bufferMat = new THREE.MeshBasicMaterial({
            color: isCrit ? 0xdc2626 : 0xf59e0b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
          });
          const bufferMesh = new THREE.Mesh(bufferGeo, bufferMat);
          bufferMesh.position.copy(latLonToVector3(inc.latitude, inc.longitude, globeRadius * 1.004));
          bufferMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bufferMesh.position.clone().normalize());
          bufferMesh.userData = { isDynamic: true };
          globe.add(bufferMesh);
        }
      });
    }

    if (activeLayer.hubs && hubs.length > 0) {
      hubs.slice(0, 20).forEach((h) => {
        if (h.latitude && h.longitude) {
          const hubPos = latLonToVector3(h.latitude, h.longitude, globeRadius * 1.008);
          const hubGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
          const hubMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
          const hubMesh = new THREE.Mesh(hubGeo, hubMat);
          hubMesh.position.copy(hubPos);
          hubMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hubPos.clone().normalize());
          hubMesh.userData = { isDynamic: true, type: 'hub', data: h };
          globe.add(hubMesh);
        }
      });
    }
  }, [activeLayer, effectiveRouteCoordinates, origin, destination, incidents, hubs, activeStrategy]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !globeGroupRef.current) return;
    const deltaX = e.clientX - prevMouseRef.current.x;
    const deltaY = e.clientY - prevMouseRef.current.y;

    const rotSpeed = 0.005;
    globeGroupRef.current.rotation.y += deltaX * rotSpeed;
    globeGroupRef.current.rotation.x += deltaY * rotSpeed;
    globeGroupRef.current.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, globeGroupRef.current.rotation.x));

    rotationVelocityRef.current = { x: deltaY * rotSpeed * 0.5, y: deltaX * rotSpeed * 0.5 };
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!cameraRef.current) return;
    const zoomDelta = e.deltaY * 0.08;
    cameraRef.current.position.z = Math.max(70, Math.min(300, cameraRef.current.position.z + zoomDelta));
  };

  const flyToPreset = (targetLat: number, targetLon: number, distance: number) => {
    const phi = (targetLat * Math.PI) / 180;
    const theta = (targetLon * Math.PI) / 180;
    targetRotationRef.current = {
      x: phi * 0.45,
      y: -theta - Math.PI / 2,
    };
    targetDistanceRef.current = distance;
  };

  const handleFlyToIndia = () => flyToPreset(22.0, 82.0, 190);
  const handleFlyToNER = () => flyToPreset(26.2, 92.93, 110);
  const handleFlyToRoute = () => {
    if (origin && destination) {
      const midLat = (origin.lat + destination.lat) / 2;
      const midLon = (origin.lng + destination.lng) / 2;
      flyToPreset(midLat, midLon, 115);
    } else {
      handleFlyToNER();
    }
  };

  const handleZoomIn = () => {
    if (!cameraRef.current) return;
    targetDistanceRef.current = Math.max(70, cameraRef.current.position.z - 25);
  };

  const handleZoomOut = () => {
    if (!cameraRef.current) return;
    targetDistanceRef.current = Math.min(300, cameraRef.current.position.z + 25);
  };

  const handleResetCamera = () => handleFlyToNER();

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col select-none ${className}`}
      style={{ height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {loading && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <span className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono">
            Initializing 3D Earth Globe Engine...
          </span>
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 z-30 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <h4 className="text-sm font-bold text-white">3D Earth Acceleration Notice</h4>
          <p className="text-xs text-slate-400 max-w-md">
            WebGL acceleration encountered an issue: {webglError}.
            You can continue navigating seamlessly via the <strong>[2D Map]</strong> or <strong>[3D Terrain]</strong> tabs.
          </p>
        </div>
      )}

      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/80 shadow-xl pointer-events-auto text-xs">
          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0 mr-1" />
          <button
            onClick={handleFlyToIndia}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium transition-all"
            title="Focus All India"
          >
            India View
          </button>
          <button
            onClick={handleFlyToNER}
            className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold border border-sky-500/40 transition-all"
            title="Focus Northeast India"
          >
            NER View
          </button>
          {effectiveRouteCoordinates.length > 0 && (
            <button
              onClick={handleFlyToRoute}
              className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium border border-emerald-500/40 transition-all"
              title="Focus Active Route Corridor"
            >
              Route Focus
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-xl">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetCamera}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Reset Globe View"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-[11px]">
            <button
              onClick={() => setActiveLayer(p => ({ ...p, routes: !p.routes }))}
              className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                activeLayer.routes ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-500 line-through'
              }`}
            >
              Route
            </button>
            <button
              onClick={() => setActiveLayer(p => ({ ...p, hazards: !p.hazards }))}
              className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                activeLayer.hazards ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'text-slate-500 line-through'
              }`}
            >
              Hazards
            </button>
            <button
              onClick={() => setActiveLayer(p => ({ ...p, hubs: !p.hubs }))}
              className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                activeLayer.hubs ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-500 line-through'
              }`}
            >
              Hubs
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-[10px] font-mono text-slate-300 pointer-events-auto">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold">3D EARTH GLOBE</span>
          </div>
          <span className="text-slate-600">|</span>
          <span>Altitude: {telemetry.altitudeKm.toLocaleString()} km</span>
          <span className="text-slate-600">|</span>
          <span>Scale: {telemetry.zoomLevel}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Imagery: NASA Blue Marble & OpenStreetMap</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-[10px] text-slate-300 pointer-events-auto">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Origin</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            <span>Destination</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <span>Corridor</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>SACHET NDMA</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapEarth3DView;

