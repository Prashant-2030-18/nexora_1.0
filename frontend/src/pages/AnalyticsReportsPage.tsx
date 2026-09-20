import React, { useState, useEffect } from 'react';
import {
  BarChart3, Download, FileText, Table, Filter,
  PieChart as PieIcon, Activity, TrendingUp, Calendar, Check
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';

export const AnalyticsReportsPage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const [chartsData, setChartsData] = useState<any>(null);
  const [selectedReportType, setSelectedReportType] = useState('state_accessibility');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api.getAnalyticsCharts(selectedState);
        setChartsData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedState]);

  const reportTypes = [
    { id: "state_accessibility", name: "State Accessibility Scorecard", desc: "Comprehensive 8-state weighted connectivity rankings" },
    { id: "district_accessibility", name: "District Accessibility Audit", desc: "Full 40+ district 9-factor diagnostic dataset" },
    { id: "logistics_performance", name: "Logistics Fleet & Shipment Report", desc: "Active freight consignments, ETA, and transport expenditure" },
    { id: "disaster_impact", name: "Disaster Impact & Disruption Briefing", desc: "Logged landslides, floods, road blocks, and bypass routes" },
    { id: "infrastructure_gaps", name: "Infrastructure Gaps & PM-DevINE Priority", desc: "Identified structural bottlenecks and investment recommendations" },
  ];

  const PIE_COLORS = ['#ef4444', '#ea580c', '#0284c7', '#10b981'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest font-mono">
              Regional Telemetry & Reporting Engine
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Analytics & Executive Report Generator
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Export official government reports in PDF, CSV, or spreadsheet formats for ministry presentations.
          </p>
        </div>
      </div>

      {/* Report Download Generator Center */}
      <div className="glass-panel p-6 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-950/30 via-slate-900 to-slate-900 space-y-4 shadow-xl">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-400" />
          <span>Official MDoNER Report Generator</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-8">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Report Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reportTypes.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedReportType(r.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all text-xs ${
                    selectedReportType === r.id
                      ? 'bg-sky-500/20 border-sky-400 text-white glow-sky'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <h4 className="font-bold">{r.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-4 flex flex-col gap-2.5 justify-center">
            <a
              href={api.getReportDownloadUrl(selectedReportType, 'pdf')}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all text-center"
            >
              <Download className="w-4 h-4" />
              <span>Generate Official PDF</span>
            </a>

            <a
              href={api.getReportDownloadUrl(selectedReportType, 'csv')}
              download
              className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold rounded-xl text-xs border border-slate-700 transition-all text-center"
            >
              <Table className="w-4 h-4 text-emerald-400" />
              <span>Export CSV / Excel</span>
            </a>
          </div>
        </div>
      </div>

      {/* Multi-Dimensional Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Incident Severity Distribution */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <h3 className="font-bold text-sm text-white mb-2">Natural Disaster Incident Severity Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">Active and logged disruption events across the 8 NER states</p>

          <div className="h-64">
            {chartsData?.incident_distribution && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartsData.incident_distribution}
                    dataKey="count"
                    nameKey="severity"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.severity}: ${entry.count}`}
                  >
                    {chartsData.incident_distribution.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Disruption and Transit Cost Trends */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <h3 className="font-bold text-sm text-white mb-2">Seasonal Monsoon Disruption vs Transport Cost Index</h3>
          <p className="text-xs text-slate-400 mb-4">Transport cost inflation (Base = 100) vs seasonal rain events</p>

          <div className="h-64">
            {chartsData?.monthly_trends && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartsData.monthly_trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  <Line type="monotone" dataKey="transport_cost_idx" name="Freight Cost Index" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="disruptions" name="Logged Disruptions" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
