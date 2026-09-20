import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/80 py-4 px-6 text-xs text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
          <span>Ministry of Development of North Eastern Region (MDoNER)</span>
          <span className="text-slate-600">|</span>
          <span className="text-sky-400">NER-SmartLogix Intelligence Platform</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-center md:text-right max-w-2xl">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong className="text-slate-300">Data Feeds:</strong> Live SACHET NDMA CAP XML, OpenWeatherMap & Open-Meteo, Project OSRM routing, and MDoNER deterministic accessibility indexing.
          </span>
        </div>
      </div>
    </footer>
  );
};
