import React from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

interface NavigationHazardBannerProps {
  onTriggerReroute: () => void;
}

export const NavigationHazardBanner: React.FC<NavigationHazardBannerProps> = ({
  onTriggerReroute,
}) => {
  const { activeHazardAlert, dismissHazardAlert } = useNavigation();

  if (!activeHazardAlert) return null;

  const eventType = activeHazardAlert.event_type || activeHazardAlert.disaster_type || 'Disaster Alert';
  const headline = activeHazardAlert.headline || activeHazardAlert.description || 'Hazard detected on remaining route corridor';
  const distanceKm = activeHazardAlert.distanceKmAhead ?? activeHazardAlert.distance_km;
  const isOfficial = activeHazardAlert.source === 'SACHET NDMA (Official)' || activeHazardAlert.identifier?.startsWith('NDMA');
  const severity = activeHazardAlert.severity || activeHazardAlert.risk_level || 'HIGH';

  return (
    <div className="w-full max-w-xl mx-auto bg-gradient-to-r from-red-950/95 via-red-900/90 to-amber-950/95 backdrop-blur-xl border-2 border-red-500 rounded-3xl p-3.5 shadow-2xl text-white animate-in slide-in-from-top-4 select-none pointer-events-auto">
      <div className="flex items-start justify-between gap-3">
        
        {/* Warning Icon */}
        <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-lg animate-pulse">
          <ShieldAlert className="w-6 h-6" />
        </div>

        {/* Hazard Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-red-300 font-mono">
              ⚠ {eventType} AHEAD
            </span>
            {distanceKm !== undefined && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950 text-amber-300 border border-amber-600">
                {distanceKm > 1 ? `${distanceKm} km ahead` : `${Math.round(distanceKm * 1000)} m ahead`}
              </span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
              isOfficial ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-sky-950 text-sky-300 border border-sky-700'
            }`}>
              {isOfficial ? 'OFFICIAL NDMA SACHET' : 'AI-VERIFIED CITIZEN REPORT'}
            </span>
          </div>

          <p className="text-xs text-slate-200 mt-1 line-clamp-2 leading-relaxed">
            {headline}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={onTriggerReroute}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg cursor-pointer uppercase tracking-wide"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Use Safer Route</span>
            </button>
            <button
              onClick={dismissHazardAlert}
              className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={dismissHazardAlert}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <X className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
};
