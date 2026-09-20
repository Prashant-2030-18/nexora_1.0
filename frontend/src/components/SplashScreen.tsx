import React from 'react';
import { Compass } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="NEXORA Initializing"
      style={{ zIndex: 7000 }}
      className="fixed inset-0 w-screen h-[100dvh] bg-[#020817] flex flex-col items-center justify-center p-6 select-none font-sans overflow-hidden z-splash"
    >
      {/* Soft central ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.07)_0%,_transparent_70%)] pointer-events-none" />

      {/* Centered Brand Experience */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full animate-in fade-in zoom-in-95 duration-500">
        {/* Subtle NEXORA Symbol: rounded square emblem with gentle breathing glow (no spinning) */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900/90 border border-sky-500/30 flex items-center justify-center shadow-2xl shadow-sky-950/60 mb-6 relative animate-emblem motion-reduce:animate-none">
          <Compass className="w-10 h-10 sm:w-12 sm:h-12 text-sky-400 stroke-[2.2]" />
        </div>

        {/* Wordmark */}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-widest text-white uppercase font-sans">
          NEXORA
        </h1>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm font-semibold tracking-wider text-sky-400/90 uppercase font-mono mt-2.5">
          Smart Logistics & Disaster Intelligence
        </p>

        {/* Subtle Route Motif: minimal corridor track with gentle shimmer */}
        <div className="w-48 sm:w-56 mt-8 flex items-center gap-2" aria-hidden="true">
          <div className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          <div className="flex-1 h-0.5 bg-slate-800/80 rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400 to-transparent w-2/3 animate-shimmer motion-reduce:hidden" />
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </div>
      </div>

      {/* Minimal Footer Attribution */}
      <div className="absolute bottom-6 text-center text-[10px] text-slate-500 font-mono tracking-wider">
        Ministry of Development of North Eastern Region (MDoNER)
      </div>
    </div>
  );
};
