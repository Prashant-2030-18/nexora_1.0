import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark, Compass, AlertTriangle, GitPullRequest,
  TrendingUp, ShieldCheck, Download, Sparkles, Building,
  ArrowRight, CheckCircle2, ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useStateFilter } from '../context/StateFilterContext';
import { StateData, InfrastructureGapData } from '../types';

export const GovernmentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedState, setSelectedState } = useStateFilter();
  const navigate = useNavigate();

  const [states, setStates] = useState<StateData[]>([]);
  const [priorityDistricts, setPriorityDistricts] = useState<any[]>([]);
  const [gaps, setGaps] = useState<InfrastructureGapData[]>([]);
  const [loading, setLoading] = useState(true);

  // If user is state_gov, lock state filter to their state
  useEffect(() => {
    if (user?.role === 'state_gov' && user.state && user.state !== 'All') {
      setSelectedState(user.state);
    }
  }, [user]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [stRes, prioRes, gapsRes] = await Promise.all([
          api.getStates(),
          api.getPriorityDevelopmentAreas(),
          api.getInfrastructureGaps(selectedState)
        ]);
        setStates(stRes);
        setPriorityDistricts(prioRes);
        setGaps(gapsRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedState]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono">
              Ministry of Development of North Eastern Region (MDoNER)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Government Strategic Planning & Policy Portal
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Macro-level infrastructure gap analysis, district vulnerability indices, and PM-DevINE capital investment prioritization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={api.getReportDownloadUrl('state_accessibility', 'pdf')}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>Download Official PDF Brief</span>
          </a>
        </div>
      </div>

      {/* State Gov Scope Banner if active */}
      {user?.role === 'state_gov' && (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-400" />
            <span>Authorized State Session: <strong>{user.state} State Government Portal</strong>. Regional isolation in effect.</span>
          </div>
          <span className="text-[10px] bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded font-mono font-semibold">
            Restricted Domain
          </span>
        </div>
      )}

      {/* State-by-State Executive Policy Ranking */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="font-bold text-sm text-white">8 North Eastern States Comprehensive Accessibility & Risk Ledger</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {states.map((s) => (
            <div key={s.id} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold">
                  {s.code}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  s.risk_level === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  Risk: {s.risk_level}
                </span>
              </div>

              <h4 className="font-bold text-base text-white">{s.name}</h4>
              <p className="text-slate-400 text-xs">Population: <strong className="text-slate-200">{(s.population / 100000).toFixed(1)} Lakh</strong></p>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Accessibility Index:</span>
                <strong className={`text-sm font-black ${s.accessibility_score < 45 ? 'text-red-400' : s.accessibility_score < 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {s.accessibility_score} / 100
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PM-DevINE Priority Development Areas Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">Priority Development Areas (Targeted Capital Interventions)</h3>
            <p className="text-xs text-slate-400">Districts ranked by vulnerability, terrain friction, and economic return on investment</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Rank & District</th>
                <th className="p-3">State</th>
                <th className="p-3">Accessibility Score</th>
                <th className="p-3">Road / Rail Index</th>
                <th className="p-3">Intervention Tier</th>
                <th className="p-3">Strategic Action Required</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {priorityDistricts.map((d, index) => (
                <tr key={index} className="hover:bg-slate-900/60 transition-colors">
                  <td className="p-3 font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-sky-400 text-[10px] flex items-center justify-center font-bold">
                      #{index + 1}
                    </span>
                    <span>{d.district}</span>
                  </td>
                  <td className="p-3">{d.state}</td>
                  <td className="p-3 font-bold text-red-400">{d.accessibility_score}/100</td>
                  <td className="p-3 text-slate-400">Road: {d.road_connectivity} | Rail: {d.railway_access}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                      {d.priority_tier}
                    </span>
                  </td>
                  <td className="p-3 text-slate-200 font-medium">{d.recommended_focus}</td>
                  <td className="p-3">
                    <button
                      onClick={() => navigate('/hub-planner')}
                      className="text-sky-400 hover:underline font-semibold"
                    >
                      Site Hub →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
