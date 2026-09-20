import React, { useState } from 'react';
import {
  Compass, Volume2, VolumeX, Route, Locate, Layers, Check, Moon, Sun
} from 'lucide-react';
import { useNavigation, NavigationMapStyle } from '../../context/NavigationContext';

interface NavigationControlsProps {
  onRouteOverview: () => void;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  onRouteOverview,
}) => {
  const {
    followMode,
    cameraOrientation,
    displayBearing,
    mapStyle,
    voiceEnabled,
    recenterCamera,
    toggleCameraOrientation,
    setMapStyle,
    toggleVoice,
  } = useNavigation();

  const [showStyleMenu, setShowStyleMenu] = useState(false);

  // Compass needle rotation: In Heading-Up mode, bearing rotates with map; in North-Up, bearing is 0
  const compassBearing = cameraOrientation === 'heading-up' ? -displayBearing : 0;

  return (
    <div className="flex flex-col items-end gap-2.5 select-none pointer-events-auto">
      
      {/* 1. Recenter Button (Prominent when user manually panned the map) */}
      {!followMode && (
        <button
          onClick={recenterCamera}
          className="bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-full shadow-2xl border-2 border-slate-950 flex items-center gap-2 text-xs uppercase tracking-wider transition-all cursor-pointer animate-in fade-in"
        >
          <Locate className="w-4 h-4 stroke-[2.5]" />
          <span>RECENTER</span>
        </button>
      )}

      {/* 2. Floating Right-Side Controls Column */}
      <div className="flex flex-col items-center gap-2">
        
        {/* Compass Button */}
        <button
          onClick={toggleCameraOrientation}
          title={cameraOrientation === 'heading-up' ? 'Heading-Up (Tap for North-Up)' : 'North-Up (Tap for Heading-Up)'}
          className="w-11 h-11 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl flex flex-col items-center justify-center text-slate-200 hover:text-white transition active:scale-95 cursor-pointer relative"
        >
          <Compass
            className="w-5 h-5 text-cyan-400 transition-transform duration-300"
            style={{ transform: `rotate(${compassBearing}deg)` }}
          />
          <span className="text-[8px] font-mono font-bold uppercase text-slate-400 leading-none mt-0.5">
            {cameraOrientation === 'heading-up' ? 'HEAD' : 'NORTH'}
          </span>
        </button>

        {/* Audio / Voice Guidance Toggle */}
        <button
          onClick={toggleVoice}
          title={voiceEnabled ? 'Mute Voice Guidance' : 'Unmute Voice Guidance'}
          className={`w-11 h-11 rounded-2xl backdrop-blur-md border shadow-2xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
            voiceEnabled
              ? 'bg-slate-900/95 text-cyan-400 border-slate-700/80 hover:bg-slate-800'
              : 'bg-red-950/80 text-red-400 border-red-700/80'
          }`}
        >
          {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* Route Overview Button */}
        <button
          onClick={onRouteOverview}
          title="Fit Full Route Corridor"
          className="w-11 h-11 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
        >
          <Route className="w-5 h-5 text-sky-400" />
        </button>

        {/* Basemap Style Selector */}
        <div className="relative">
          <button
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            title="Navigation Map Style"
            className={`w-11 h-11 rounded-2xl backdrop-blur-md border shadow-2xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
              showStyleMenu
                ? 'bg-sky-500 text-slate-950 border-sky-400'
                : 'bg-slate-900/95 text-slate-300 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-5 h-5 text-emerald-400" />
          </button>

          {showStyleMenu && (
            <div className="absolute right-full mr-2 bottom-0 w-44 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-2.5 shadow-2xl text-xs space-y-1 z-50 animate-in fade-in">
              <div className="text-[10px] font-black font-mono uppercase text-slate-400 border-b border-slate-800 pb-1 mb-1">
                MAP STYLE
              </div>
              {(
                [
                  { id: 'standard' as const, label: 'Standard' },
                  { id: 'satellite' as const, label: 'Satellite' },
                  { id: 'terrain' as const, label: 'Terrain' },
                  { id: 'night' as const, label: 'Night (Dark)' },
                ] as { id: NavigationMapStyle; label: string }[]
              ).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setMapStyle(opt.id);
                    setShowStyleMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition text-left ${
                    mapStyle === opt.id
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  {mapStyle === opt.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
