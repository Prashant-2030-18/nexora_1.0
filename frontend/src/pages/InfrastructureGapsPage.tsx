import React, { useState, useEffect } from 'react';
import {
  GitPullRequest, AlertTriangle, Sparkles, CheckCircle2,
  TrendingUp, Compass, ArrowRight, ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { InfrastructureGapData } from '../types';

export const InfrastructureGapsPage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const [gaps, setGaps] = useState<InfrastructureGapData[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGaps = async () => {
      setLoading(true);
      try {
        const data = await api.getInfrastructureGaps(selectedState);
        setGaps(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchGaps();
  }, [selectedState]);

  const filteredGaps = severityFilter === 'All'
    ? gaps
    : gaps.filter(g => g.severity === severityFilter);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitPullRequest className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest font-mono">
              Structural Bottleneck & Deficit Matrix
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Infrastructure Gap & Investment Intelligence
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Identify critical infrastructure voids across the 8 NER states and prioritize targeted PM-DevINE capital investments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {['All', 'Critical', 'High', 'Medium'].map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                severityFilter === sev
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Gaps List / Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-white">Prioritized Critical Infrastructure Deficits ({filteredGaps.length})</h3>
          <span className="text-xs text-slate-400">Ranked by Composite Economic Multiplier</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredGaps.map((gap) => {
            let badgeBg = 'bg-slate-800 text-slate-300';
            let borderCol = 'border-slate-800';
            if (gap.severity === 'Critical') {
              badgeBg = 'bg-red-500/20 text-red-400 border border-red-500/40';
              borderCol = 'border-red-500/40 bg-gradient-to-r from-red-950/20 via-slate-900 to-slate-900';
            } else if (gap.severity === 'High') {
              badgeBg = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
              borderCol = 'border-amber-500/40 bg-gradient-to-r from-amber-950/20 via-slate-900 to-slate-900';
            }

            return (
              <div
                key={gap.id}
                className={`p-5 rounded-2xl border ${borderCol} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5 text-xs`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${badgeBg}`}>
                      {gap.severity} DEFICIT
                    </span>
                    <span className="text-sm font-extrabold text-white">{gap.district}</span>
                    <span className="text-slate-400">({gap.state})</span>
                  </div>

                  <h4 className="text-sm font-bold text-sky-300 leading-snug">{gap.gap_type}</h4>
                  <p className="text-slate-300 text-xs leading-relaxed max-w-3xl">{gap.description}</p>

                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs flex items-start gap-2.5 mt-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider block">Recommended Engineering & Logistics Action:</span>
                      <p className="text-slate-100 mt-0.5">{gap.recommended_action}</p>
                    </div>
                  </div>
                </div>

                {/* Expected Impact Card */}
                <div className="bg-slate-950/90 p-4 rounded-xl border border-emerald-500/40 md:w-64 flex flex-col justify-between flex-shrink-0 space-y-2">
                  <span className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Projected Impact
                  </span>
                  <div className="text-sm font-bold text-white leading-snug">
                    {gap.estimated_impact}
                  </div>
                  <span className="text-[10px] text-slate-500">MDoNER ROI Analysis</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
