import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, TrendingUp, AlertTriangle, Activity,
  Clock, CloudRain, Mountain, Compass, Sparkles, BarChart2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, LineChart, Line
} from 'recharts';
import { api } from '../services/api';

export const RiskPredictionPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await api.getPredictions();
        setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPredictions();
  }, []);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono">
              Predictive ML Hazard & Delay Forecasting
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Risk & Disaster Predictive Intelligence
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            24–72 hour probability forecasting for river floods, mountain slope failure, and commercial corridor disruption.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>Model Execution: <strong>Autonomous 6-Hour Interval</strong></span>
        </div>
      </div>

      {/* 24-Hour Hazard Probability Cards */}
      <div>
        <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span>Next 24-Hour Automated Hazard Probability Predictions</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data?.disaster_predictions?.map((pred: any, index: number) => {
            let badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
            let barColor = 'bg-amber-500';
            if (pred.probability_pct > 65) {
              badgeBg = 'bg-red-500/20 text-red-400 border-red-500/40';
              barColor = 'bg-red-500';
            }

            return (
              <div
                key={index}
                className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-3 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                      {pred.severity} Risk
                    </span>
                    <span className="font-extrabold text-sm text-white font-mono">
                      {pred.probability_pct}%
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-100 text-sm leading-snug">{pred.category}</h4>
                  <p className="text-[11px] text-sky-300 mt-1 font-medium">{pred.region}</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pred.probability_pct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">Disruption Probability</span>
                </div>

                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1 text-[11px]">
                  <p className="text-slate-400"><strong>Driver:</strong> {pred.primary_driver}</p>
                  <p className="text-slate-300"><strong>Action:</strong> {pred.recommended_action}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Road Disruption Probability Matrix */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">Major NER Highway Corridors Disruption Probability Matrix</h3>
            <p className="text-xs text-slate-400">Predicted delay impact and active designated alternative corridors</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Corridor</th>
                <th className="p-3">Current Condition</th>
                <th className="p-3">24h Disruption Probability</th>
                <th className="p-3">Expected Delay</th>
                <th className="p-3">AI Designated Alternative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.road_disruption_matrix?.map((road: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                  <td className="p-3 font-bold text-white font-mono">{road.corridor}</td>
                  <td className="p-3">
                    <span className={`text-[11px] font-medium ${
                      road.current_status.includes('Restricted') || road.current_status.includes('Caution')
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}>
                      {road.current_status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-white">{road.disruption_probability_24h}%</span>
                      <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            road.disruption_probability_24h > 60 ? 'bg-red-500' : road.disruption_probability_24h > 35 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${road.disruption_probability_24h}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-semibold text-amber-300">+{road.expected_delay_hours} hrs</td>
                  <td className="p-3 font-medium text-sky-400">{road.alternative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hourly Traffic & Logistics Demand Trends Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hourly Traffic Forecast */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-white">24-Hour Corridor Congestion & Average Speed Forecast</h3>
              <p className="text-xs text-slate-400">Predicted traffic flow patterns across key bottlenecks</p>
            </div>
          </div>

          <div className="h-64">
            {data?.traffic_forecast && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.traffic_forecast}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="congestion_index" name="Congestion Index (0-100)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="average_speed_kmh" name="Avg Speed (km/h)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Seasonal Logistics Demand Trends */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-white">Seasonal Logistics Freight Demand vs Capacity</h3>
              <p className="text-xs text-slate-400">Monsoon flood surges vs regional warehouse buffer utilization</p>
            </div>
          </div>

          <div className="h-64">
            {data?.freight_demand_trends && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.freight_demand_trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="demand_mt" name="Freight Demand (MT)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="capacity_mt" name="Buffer Storage Capacity (MT)" fill="#475569" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
