import React, { useState, useEffect } from 'react';
import {
  Compass, ArrowUpDown, Sparkles, AlertCircle, CheckCircle2,
  TrendingDown, TrendingUp, Search, Layers, ChevronRight, BarChart2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { AccessibilityScorecard } from '../types';

export const AccessibilityPage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const [data, setData] = useState<{ districts_scored_count: number; state_averages: any[]; districts: AccessibilityScorecard[] }>({
    districts_scored_count: 0,
    state_averages: [],
    districts: []
  });
  const [selectedDistrict, setSelectedDistrict] = useState<AccessibilityScorecard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // asc: lowest/critical first
  const [loading, setLoading] = useState(true);

  const fetchAccessibilityData = async () => {
    setLoading(true);
    try {
      const res = await api.getAccessibilityScores(selectedState, sortOrder);
      setData(res);
      if (res.districts.length > 0 && !selectedDistrict) {
        setSelectedDistrict(res.districts[0]);
      } else if (res.districts.length > 0) {
        // match existing or default
        const match = res.districts.find(d => d.district_name === selectedDistrict?.district_name);
        setSelectedDistrict(match || res.districts[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessibilityData();
  }, [selectedState, sortOrder]);

  const filteredDistricts = (data.districts || []).filter(d =>
    (d.district_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.state_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Prepare radar chart data for selected district safely
  const b = selectedDistrict?.breakdown || {};
  const fs = selectedDistrict?.factor_scores || {};
  const radarData = selectedDistrict ? [
    { factor: "Road Conn (25%)", value: b.road_connectivity ?? fs.road_density ?? 50, fullMark: 100 },
    { factor: "Highway (15%)", value: b.highway_access ?? fs.highway_access ?? 50, fullMark: 100 },
    { factor: "Rail Access (10%)", value: b.railway_access ?? fs.railway_access ?? 50, fullMark: 100 },
    { factor: "Airport (10%)", value: b.airport_access ?? fs.airport_access ?? 50, fullMark: 100 },
    { factor: "Logistics Hub (15%)", value: b.logistics_access ?? fs.warehouse_coverage ?? 50, fullMark: 100 },
    { factor: "Travel Time (10%)", value: b.travel_time_score ?? fs.terrain_factor ?? 50, fullMark: 100 },
    { factor: "Weather Resilience (5%)", value: b.weather_resilience ?? fs.monsoon_resilience ?? 50, fullMark: 100 },
    { factor: "Emergency Access (5%)", value: b.emergency_access ?? fs.area_scale ?? 50, fullMark: 100 },
    { factor: "Network Reliability (5%)", value: b.network_reliability ?? 50, fullMark: 100 },
  ] : [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest font-mono">
              MDoNER Weighted Multi-Factor Formula
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            AI Accessibility Intelligence & Explainability Engine
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            District-level 0–100 accessibility index diagnosing structural bottlenecks and prioritizing development intervention.
          </p>
        </div>

        <button
          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>Sort: {sortOrder === 'asc' ? "Critical First (Ascending)" : "Highest First (Descending)"}</span>
        </button>
      </div>

      {/* State Average Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {(data.state_averages || []).map((sa) => (
          <div key={sa.state} className="glass-card p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-400 truncate">{sa.state}</span>
            <div className="text-lg font-black text-white mt-1">
              <span className={(sa.avg_accessibility ?? 0) < 45 ? "text-red-400" : (sa.avg_accessibility ?? 0) < 60 ? "text-amber-400" : "text-emerald-400"}>
                {sa.avg_accessibility ?? "N/A"}
              </span>
              <span className="text-[10px] text-slate-500 font-normal">/100</span>
            </div>
            <span className="text-[10px] text-slate-500">{sa.district_count} Districts</span>
          </div>
        ))}
      </div>

      {/* Main Grid: Left Table, Right Diagnostic Radar & AI Explainability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: District Ranking Table */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-sm text-white">District Accessibility Indices ({filteredDistricts.length})</h3>
            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search district..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[580px] space-y-2 pr-1 scrollbar-thin">
            {filteredDistricts.map((d, index) => {
              const isSelected = selectedDistrict?.district_name === d.district_name;
              const scoreVal = d.overall_score ?? d.score ?? 0;
              let badgeBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
              if (scoreVal < 45) {
                badgeBg = 'bg-red-500/20 text-red-400 border-red-500/40';
              } else if (scoreVal < 60) {
                badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
              }

              return (
                <div
                  key={d.district_id || index}
                  onClick={() => setSelectedDistrict(d)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-sky-950/50 border-sky-400 glow-sky shadow-md'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-sky-400 font-bold text-[10px] flex items-center justify-center">
                        #{index + 1}
                      </span>
                      <h4 className="font-bold text-sm text-white">{d.district_name}</h4>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeBg}`}>
                      {scoreVal} / 100
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>State: <strong className="text-slate-300">{d.state_name}</strong></span>
                    <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-0.5">
                      <span>Inspect Breakdown</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed 9-Factor Diagnostic & AI Explainability Panel */}
        <div className="lg:col-span-6 space-y-4">
          {selectedDistrict ? (
            <>
              {/* AI Explainability Banner */}
              <div className="glass-panel p-5 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-950/40 to-slate-900/90 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <h3 className="font-bold text-sm text-white">
                      AI Diagnostic Explainability: {selectedDistrict.district_name}
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-sky-300 bg-sky-950 px-2.5 py-0.5 rounded-full border border-sky-700">
                    {selectedDistrict.priority_level || 'Normal'}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-200 leading-relaxed">
                  «{selectedDistrict.ai_explanation || selectedDistrict.reason || "MDoNER deterministic accessibility score computed across regional connectivity telemetry."}»
                </div>

                {/* Key Bottlenecks Identified */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Critical Root Bottlenecks Identified:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(selectedDistrict.key_bottlenecks || selectedDistrict.bottlenecks || []).length > 0 ? (
                      (selectedDistrict.key_bottlenecks || selectedDistrict.bottlenecks || []).map((b, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-red-950/30 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <span className="truncate">{b}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-slate-500 italic">No acute bottlenecks identified.</div>
                    )}
                  </div>
                </div>

                {/* Strategic Interventions */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Recommended Policy Interventions (PM-DevINE):
                  </h4>
                  <div className="space-y-1.5">
                    {(selectedDistrict.recommended_interventions || []).length > 0 ? (
                      (selectedDistrict.recommended_interventions || []).map((item, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-slate-500 italic">Standard routine infrastructure maintenance active.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* 9-Factor Radar Chart */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-white">9-Factor Weighted Accessibility Radar</h3>
                  <span className="text-xs text-slate-400">Target Benchmark: 100 pts</span>
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="factor" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" tick={{ fontSize: 9 }} />
                      <Radar name="Score" dataKey="value" stroke="#0284c7" fill="#0284c7" fillOpacity={0.4} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-panel p-12 rounded-2xl border border-slate-800 text-center text-slate-400">
              Select a district to view the diagnostic scorecard.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
