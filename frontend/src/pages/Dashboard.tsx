import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, MapPin, Truck, AlertTriangle, ShieldCheck,
  TrendingUp, BarChart2, Radio, Layers, Sparkles,
  ArrowRight, CheckCircle2, ChevronRight, Activity,
  Warehouse, GitPullRequest, Eye, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { useDisasters } from '../context/DisasterContext';
import { GisMap } from '../components/GisMap';
import { DistrictData, LogisticsHubData, WarehouseData, IncidentData, StateData } from '../types';

export const Dashboard: React.FC = () => {
  const { selectedState } = useStateFilter();
  const { disasters, totalActiveDisasters, refreshDisasters, isRefreshing } = useDisasters();
  const navigate = useNavigate();

  const [kpis, setKpis] = useState<any>({
    states_count: 8,
    average_accessibility_score: 52.1,
    active_logistics_hubs: 7,
    active_incidents: 4,
    deliveries_in_transit: 5,
    critical_alerts: 2,
    at_risk_routes: 3,
    infrastructure_gaps: 5,
    ai_recommendation: "Meghalaya currently has elevated disruption risk due to heavy rainfall. Consider rerouting priority shipments through alternative corridors."
  });

  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [hubs, setHubs] = useState<LogisticsHubData[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [selectedDisasterId, setSelectedDisasterId] = useState<number | string | null>(null);
  const [states, setStates] = useState<StateData[]>([]);
  const [chartsData, setChartsData] = useState<any>(null);
  const [priorityDistricts, setPriorityDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [kpiRes, distRes, hubRes, whRes, incRes, stRes, chRes, prioRes] = await Promise.all([
        api.getDashboardKpis(selectedState),
        api.getDistricts(selectedState),
        api.getLogisticsHubs(selectedState),
        api.getWarehouses(selectedState),
        api.getIncidents(selectedState),
        api.getStates(),
        api.getAnalyticsCharts(selectedState),
        api.getPriorityDevelopmentAreas(),
      ]);

      setKpis(kpiRes);
      setDistricts(distRes);
      setHubs(hubRes);
      setWarehouses(whRes);
      setIncidents(incRes);
      setStates(stRes);
      setChartsData(chRes);
      setPriorityDistricts(prioRes);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedState]);

  const COLORS = ['#ef4444', '#f59e0b', '#0284c7', '#10b981'];

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Subtitle Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest font-mono">
              Live GIS Command Tower
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            NER Logistics Intelligence Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            AI-powered logistics and accessibility intelligence for India's North Eastern Region (MDoNER)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchDashboardData();
              refreshDisasters(true);
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing…' : 'Sync Real-Time Data'}</span>
          </button>
          <button
            onClick={() => navigate('/routes')}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg glow-sky transition-all"
          >
            <span>Plan Smart Route</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dynamic AI Recommendation Banner */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                AI Strategic Recommendation
              </span>
              <span className="text-[10px] text-slate-400">Autonomous Weather & Disruption Engine</span>
            </div>
            <p className="text-sm text-slate-200 font-medium mt-1 leading-relaxed">
              «{kpis.ai_recommendation}»
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/routes')}
          className="flex items-center gap-1 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded-xl transition-all flex-shrink-0 shadow-md"
        >
          <span>Evaluate Bypass</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 8 Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* KPI 1 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">NE States</span>
            <Compass className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-extrabold text-white">{kpis.states_count}</div>
          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">100% Region Covered</div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Avg Accessibility</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-emerald-400">{kpis.average_accessibility_score}<span className="text-xs text-slate-400">/100</span></div>
          <div className="text-[10px] text-slate-400 mt-0.5">Weighted 9-Factors</div>
        </div>

        {/* KPI 3 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Active Hubs</span>
            <Warehouse className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-extrabold text-sky-400">{kpis.active_logistics_hubs}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Railheads & Multi-Modal</div>
        </div>

        {/* KPI 4 */}
        <div
          onClick={() => navigate('/map?focus=true')}
          className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between cursor-pointer hover:border-red-500/60 hover:bg-slate-900/90 transition-all group"
          title="Click to view all active disasters on GIS map"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold group-hover:text-red-300">Active Disasters</span>
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl font-extrabold text-red-400">{totalActiveDisasters}</div>
          <div className="text-[10px] text-red-400/80 font-medium mt-0.5">NDMA SACHET Alerts</div>
        </div>

        {/* KPI 5 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Deliveries Transit</span>
            <Truck className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-extrabold text-indigo-300">{kpis.deliveries_in_transit}</div>
          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">Fleet GPS Active</div>
        </div>

        {/* KPI 6 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Critical Alerts</span>
            <Radio className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-amber-400">{kpis.critical_alerts}</div>
          <div className="text-[10px] text-amber-400/80 font-medium mt-0.5">Immediate Action</div>
        </div>

        {/* KPI 7 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">At-Risk Routes</span>
            <Activity className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl font-extrabold text-red-300">{kpis.at_risk_routes}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">NH-6, NH-10, NH-29</div>
        </div>

        {/* KPI 8 */}
        <div className="glass-card p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Infra Gaps</span>
            <GitPullRequest className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="text-xl font-extrabold text-teal-300">{kpis.infrastructure_gaps}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">PM-DevINE Targets</div>
        </div>
      </div>

      {/* Main Center GIS Map Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-sm text-white">Interactive NER GIS Logistics & Risk Map</h3>
            </div>
            <span className="text-xs text-slate-400">Click markers for details or route options</span>
          </div>

          <GisMap
            districts={districts}
            hubs={hubs}
            warehouses={warehouses}
            incidents={incidents}
            disasters={disasters}
            selectedDisasterId={selectedDisasterId}
            onDisasterSelect={(d) => setSelectedDisasterId(d.id)}
            height="520px"
            onDistrictSelect={(d) => navigate(`/accessibility`)}
          />
        </div>

        {/* Live Active Disruptions Feed */}
        <div className="lg:col-span-4 glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-400 animate-pulse" />
              <h3 className="font-bold text-sm text-white">Live Road & Disaster Radar</h3>
            </div>
            <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 font-bold px-2 py-0.5 rounded-full">
              SACHET NDMA Feeds: {totalActiveDisasters}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[460px]">
            {disasters.length > 0 ? (
              disasters.map((al) => {
                const isSelected = String(selectedDisasterId) === String(al.id);
                const isCrit = (al.severity || '').toLowerCase().includes('crit');
                const isHigh = (al.severity || '').toLowerCase().includes('high');
                return (
                  <div
                    key={al.id || al.identifier}
                    onClick={() => setSelectedDisasterId(al.id)}
                    className={`p-3 rounded-xl transition-all text-xs cursor-pointer border ${
                      isSelected
                        ? 'bg-sky-950/80 border-sky-400 shadow-md glow-sky'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                          isCrit
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : isHigh
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        }`}
                      >
                        {al.event || al.disaster_type || 'Disaster'}
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                        NDMA SACHET
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-100 mt-1 line-clamp-1">{al.headline || al.event}</h4>
                    {al.area_description && (
                      <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                        Area: <span className="text-slate-200">{al.area_description}</span>
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                      <span>Severity: <strong className={isCrit ? 'text-red-400' : isHigh ? 'text-orange-400' : 'text-amber-400'}>{al.severity}</strong></span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDisasterId(al.id);
                        }}
                        className="text-sky-400 hover:text-white font-bold hover:underline"
                      >
                        Focus Map →
                      </button>
                    </div>
                  </div>
                );
              })
            ) : incidents.length > 0 ? (
              incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all text-xs"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      {inc.type.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-400">{inc.state}</span>
                  </div>
                  <h4 className="font-bold text-slate-200 mt-1">{inc.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Corridor: <code className="text-sky-300">{inc.affected_route}</code></p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                    <span>Est. Closure: <strong className="text-amber-400">{inc.expected_duration}</strong></span>
                    <button
                      onClick={() => navigate('/routes')}
                      className="text-sky-400 hover:underline font-semibold"
                    >
                      AI Reroute →
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                No active disaster disruptions logged.
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/live-disasters')}
            className="w-full mt-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors text-center"
          >
            View Full Disaster Radar ({disasters.length || incidents.length} Active)
          </button>
        </div>
      </div>

      {/* Analytics & Priority Development Areas Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* State-wise Accessibility Comparison */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-white">State Accessibility Comparison Index (0–100)</h3>
              <p className="text-xs text-slate-400">Calculated from weighted composite transport metrics</p>
            </div>
            <button
              onClick={() => navigate('/accessibility')}
              className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Full Details</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-64">
            {chartsData?.state_comparison && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.state_comparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(val) => [`${val} / 100`, "Accessibility Score"]}
                  />
                  <Bar dataKey="accessibility" fill="#0284c7" radius={[6, 6, 0, 0]}>
                    {chartsData.state_comparison.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.accessibility < 45 ? '#ef4444' : entry.accessibility < 60 ? '#f59e0b' : '#0284c7'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Disruption & Transport Cost Trends */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-white">Seasonal Monsoon Disruption & Delivery Time Impact</h3>
              <p className="text-xs text-slate-400">Average freight transit hours vs logged natural disasters</p>
            </div>
            <button
              onClick={() => navigate('/analytics')}
              className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-64">
            {chartsData?.monthly_trends && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartsData.monthly_trends}>
                  <defs>
                    <linearGradient id="colorDelivery" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="avg_delivery_hours" name="Avg Transit Hours" stroke="#0284c7" fillOpacity={1} fill="url(#colorDelivery)" />
                  <Area type="monotone" dataKey="disruptions" name="Logged Disruptions" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Priority Development Areas (Top Low-Accessibility Districts) */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-white">MDoNER Priority Development Areas Ranking</h3>
              <p className="text-xs text-slate-400">Identified based on low accessibility, high disaster risk, and missing logistics infrastructure</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/government')}
            className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Government Policy Portal</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Rank & District</th>
                <th className="p-3">State</th>
                <th className="p-3">Accessibility Score</th>
                <th className="p-3">Primary Deficit</th>
                <th className="p-3">Disaster Risk</th>
                <th className="p-3">Priority Classification</th>
                <th className="p-3">Recommended Policy Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {priorityDistricts.map((d, index) => (
                <tr key={index} className="hover:bg-slate-900/60 transition-colors">
                  <td className="p-3 font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-sky-400 flex items-center justify-center text-[10px]">
                      #{index + 1}
                    </span>
                    <span>{d.district}</span>
                  </td>
                  <td className="p-3 text-slate-300">{d.state}</td>
                  <td className="p-3">
                    <span className="font-bold text-red-400 bg-red-950/40 border border-red-800/60 px-2 py-0.5 rounded-full">
                      {d.accessibility_score} / 100
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">
                    Road: {d.road_connectivity} | Rail: {d.railway_access}
                  </td>
                  <td className="p-3">
                    <span className="text-amber-400 font-semibold">{d.risk_score}/100</span>
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                      {d.priority_tier}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 font-medium">
                    {d.recommended_focus}
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
