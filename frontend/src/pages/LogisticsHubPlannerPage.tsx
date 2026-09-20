import React, { useState, useEffect } from 'react';
import {
  Warehouse, Compass, Sparkles, TrendingUp, DollarSign,
  Clock, MapPin, CheckCircle2, ArrowRight, ShieldCheck,
  Building, Layers, ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { GisMap } from '../components/GisMap';
import { HubEvaluationResult, DistrictData } from '../types';

export const LogisticsHubPlannerPage: React.FC = () => {
  const [targetDistrict, setTargetDistrict] = useState('Cachar (Silchar)');
  const [targetCapacity, setTargetCapacity] = useState<number>(5000);
  const [evalResult, setEvalResult] = useState<HubEvaluationResult | null>(null);
  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [loading, setLoading] = useState(false);

  const candidateOptions = [
    { name: "Cachar (Silchar)", lat: 24.8333, lng: 92.7789, state: "Assam" },
    { name: "West Garo Hills (Tura)", lat: 25.5138, lng: 90.2202, state: "Meghalaya" },
    { name: "Dimapur", lat: 25.9068, lng: 93.7274, state: "Nagaland" },
    { name: "Dima Hasao (Haflong)", lat: 25.1764, lng: 93.0232, state: "Assam" },
    { name: "East Siang (Pasighat)", lat: 28.0667, lng: 95.3333, state: "Arunachal Pradesh" },
    { name: "Kolasib", lat: 24.2167, lng: 92.6833, state: "Mizoram" }
  ];

  const handleEvaluate = async (selectedName?: string) => {
    const name = selectedName || targetDistrict;
    const match = candidateOptions.find(c => c.name === name) || candidateOptions[0];
    
    setLoading(true);
    try {
      const res = await api.evaluateHubLocation(match.lat, match.lng, targetCapacity);
      setEvalResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const data = await api.getDistricts();
        setDistricts(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchDistricts();
    handleEvaluate("Cachar (Silchar)");
  }, []);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Warehouse className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-mono">
              Spatial Gravity & Network Siting AI
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            AI Logistics Hub & Cold Chain Planner
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Optimize regional freight depot placement by computing population reach, accessibility delta, and transit cost savings.
          </p>
        </div>
      </div>

      {/* Siting Controls */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-400" />
          <span>Select Candidate Siting Location</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Candidate Strategic Node</label>
            <select
              value={targetDistrict}
              onChange={(e) => {
                setTargetDistrict(e.target.value);
                handleEvaluate(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              {candidateOptions.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.state})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Planned Capacity (Metric Tonnes)</label>
            <input
              type="number"
              step="500"
              value={targetCapacity}
              onChange={(e) => setTargetCapacity(parseFloat(e.target.value) || 5000)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => handleEvaluate()}
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-slate-950 font-bold py-2 px-4 rounded-xl shadow-lg glow-sky transition-all flex items-center justify-center gap-1.5 text-xs h-[38px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? "Evaluating..." : "Evaluate Candidate Site"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Siting Evaluation Results Grid */}
      {evalResult && (
        <div className="space-y-6">
          {/* Top 4 ROI & Impact Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold">Population Served Catchment</span>
              <div className="text-2xl font-black text-white mt-1">{evalResult.population_served}</div>
              <p className="text-[11px] text-emerald-400 mt-1">Direct Supply Line</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold">Regional Travel Time Drop</span>
              <div className="text-2xl font-black text-amber-400 mt-1">-{evalResult.travel_time_reduction_pct}%</div>
              <p className="text-[11px] text-slate-400 mt-1">Average Corridor Speed</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold">Projected Accessibility Uplift</span>
              <div className="text-2xl font-black text-sky-400 mt-1">
                {evalResult.projected_accessibility.current_score} <span className="text-slate-500 font-normal">➔</span> {evalResult.projected_accessibility.projected_score}
              </div>
              <p className="text-[11px] text-emerald-400 mt-1">+{evalResult.projected_accessibility.gain_points} Points Surge</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold">Estimated Freight Cost Cut</span>
              <div className="text-2xl font-black text-teal-400 mt-1">-{evalResult.estimated_cost_reduction_pct}%</div>
              <p className="text-[11px] text-slate-400 mt-1">Logistics Overhead Savings</p>
            </div>
          </div>

          {/* AI Recommendation Explainability Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-sky-500/40 bg-gradient-to-br from-sky-950/30 to-slate-900 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <h3 className="font-bold text-sm text-white">
                    AI Siting Recommendation & Governance Rationale
                  </h3>
                </div>
                <span className="text-xs font-bold text-sky-300 bg-sky-950 px-2.5 py-0.5 rounded-full border border-sky-700">
                  Suitability: {evalResult.suitability_score} / 100
                </span>
              </div>

              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-200">
                <strong className="text-sky-300">{evalResult.location_name}</strong> is strongly recommended for deployment under the PM-DevINE strategic logistics modernization masterplan.
              </div>

              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Key Structural Justifications:
                </h4>
                {evalResult.ai_recommendation_breakdown.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* Distances to Key Multi-Modal Gateways */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Highway:</span>
                  <p className="font-bold text-white mt-0.5">{evalResult.highway_proximity_km} km</p>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Railway Head:</span>
                  <p className="font-bold text-white mt-0.5">{evalResult.railway_proximity_km} km</p>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Airport Cargo:</span>
                  <p className="font-bold text-white mt-0.5">{evalResult.airport_proximity_km} km</p>
                </div>
              </div>
            </div>

            {/* Visual Before vs After Catchment & Accessibility */}
            <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-white">Before vs After Investment Scenario Metrics</h3>

              <div className="space-y-3 text-xs">
                {/* Metric 1 */}
                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-semibold">District Accessibility Index</span>
                    <span className="text-emerald-400 font-bold">
                      {evalResult.projected_accessibility.current_score} ➔ {evalResult.projected_accessibility.projected_score} (+{evalResult.projected_accessibility.gain_points} pts)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                    <div className="bg-slate-500 h-full" style={{ width: `${evalResult.projected_accessibility.current_score}%` }} />
                    <div className="bg-emerald-400 h-full" style={{ width: `${evalResult.projected_accessibility.gain_points}%` }} />
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-semibold">Coverage Radius & Reachable Districts</span>
                    <span className="text-sky-400 font-bold">
                      3 Districts ➔ {evalResult.coverage_increase_districts} Districts
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                    <div className="bg-slate-500 h-full" style={{ width: '20%' }} />
                    <div className="bg-sky-400 h-full" style={{ width: '60%' }} />
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-semibold">Average Freight Transit Delay Risk</span>
                    <span className="text-amber-400 font-bold">
                      Reduced by {evalResult.travel_time_reduction_pct}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                    <div className="bg-amber-400 h-full" style={{ width: `${100 - evalResult.travel_time_reduction_pct}%` }} />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Geotechnical Risk Profile: <strong>{evalResult.disaster_risk}</strong>. Safe from severe flood washouts.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
