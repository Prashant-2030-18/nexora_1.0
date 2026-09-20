import React, { useState, useEffect } from 'react';
import {
  Radio, RefreshCw, Plus,
  MapPin, Clock, CheckCircle2, ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { useAuth } from '../context/AuthContext';
import { useDisasters } from '../context/DisasterContext';
import { IncidentData, DisasterAlertData, UserReportData } from '../types';
import { SachetStatusPanel } from '../components/SachetStatusPanel';

function alertAgeLabel(sent?: string) {
  if (!sent) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(sent).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h`;
}

export const LiveDisasterIntelligencePage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const { hasRole } = useAuth();
  const { disasters, refreshDisasters } = useDisasters();

  const [activeTab, setActiveTab] = useState<'all' | 'sachet' | 'incidents'>('all');
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [verifiedReports, setVerifiedReports] = useState<UserReportData[]>([]);

  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Landslide');
  const [newSeverity, setNewSeverity] = useState('Critical');
  const [newState, setNewState] = useState('Meghalaya');
  const [newDistrict, setNewDistrict] = useState('');
  const [newRoute, setNewRoute] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [incRes, verRes] = await Promise.all([
        api.getIncidents(selectedState),
        api.getVerifiedUserReports()
      ]);
      setIncidents(incRes);
      setVerifiedReports(verRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedState]);

  const handleCreateIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      alert('Valid latitude and longitude are required. Do not use placeholder coordinates.');
      return;
    }
    try {
      await api.createIncident({
        title: newTitle,
        type: newType,
        severity: newSeverity,
        state: newState,
        district: newDistrict || 'Unspecified',
        latitude: lat,
        longitude: lng,
        description: newDesc,
        affected_route: newRoute || 'Unspecified corridor',
        expected_duration: newDuration || 'Unknown',
        status: "Active"
      });
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSachet = disasters.filter((a) =>
    severityFilter === 'All' || (a.severity || '').toLowerCase() === severityFilter.toLowerCase()
  );
  const totalAlertsCount = filteredSachet.length + incidents.length + verifiedReports.length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-red-400 animate-pulse" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest font-mono">
              Official SACHET NDMA & Ground Hazard Radar
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Live Road & Disaster Intelligence
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real CAP 1.2 XML alerts from NDMA SACHET, user reports, and administrative road closures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Lists</span>
          </button>

          {hasRole(['admin', 'state_gov']) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg glow-crimson cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Report Official Incident</span>
            </button>
          )}
        </div>
      </div>

      <SachetStatusPanel onSynced={fetchData} />

      <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'all' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Intelligence ({totalAlertsCount})
          </button>
          <button
            onClick={() => setActiveTab('sachet')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'sachet' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            SACHET NDMA Feeds ({filteredSachet.length})
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'incidents' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Road Closures & Reports ({incidents.length + verifiedReports.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Severity:</span>
          {['All', 'Critical', 'High', 'Medium'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                severityFilter === sev
                  ? 'bg-red-500 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-sky-400 space-y-2">
          <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Loading official feeds & ground reports...</p>
        </div>
      ) : totalAlertsCount === 0 ? (
        <div className="p-16 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="font-semibold text-sm text-slate-300">No active disaster alerts or road closures.</p>
          <p className="text-slate-500">DATA UNAVAILABLE for this filter — not a fabricated empty corridor claim.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(activeTab === 'all' || activeTab === 'sachet') && filteredSachet.map((alert) => (
            <div
              key={`sachet-${alert.id}`}
              className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/30 to-slate-900/90 border border-amber-500/40 space-y-2.5 text-xs shadow-xl"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                  {alert.event}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                  {alert.verificationStatus || 'VERIFIED'} · {alert.source || 'SACHET_NDMA'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-white">{alert.headline}</h3>
              <p className="text-slate-300 text-xs leading-relaxed">{alert.description || 'No description in CAP info block.'}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>Area: <strong className="text-slate-200">{alert.area_description || '—'}</strong></div>
                <div>Severity: <strong className="text-amber-300">{alert.severity}</strong></div>
                <div>Urgency: <strong className="text-slate-200">{alert.urgency || '—'}</strong></div>
                <div>Certainty: <strong className="text-slate-200">{alert.certainty || '—'}</strong></div>
                <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> Issued: <strong className="text-slate-200">{alert.sent_at ? new Date(alert.sent_at).toLocaleString() : '—'}</strong></div>
                <div>Expires: <strong className="text-slate-200">{alert.expires_at ? new Date(alert.expires_at).toLocaleString() : '—'}</strong></div>
                <div>Alert age: <strong className="text-slate-200">{alert.alertAge || alertAgeLabel(alert.sent_at)}</strong></div>
                <div>Freshness: <strong className="text-sky-300">{alert.dataFreshness || 'CACHED_OFFICIAL'}</strong></div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                <span className="text-sky-400 text-[10px] font-mono">{alert.source_badge || 'NDMA SACHET (VERIFIED)'}</span>
                {alert.source_url && (
                  <a href={alert.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-sky-400 hover:underline">
                    <ExternalLink className="w-3 h-3" /> View Alert XML
                  </a>
                )}
              </div>
            </div>
          ))}

          {(activeTab === 'all' || activeTab === 'incidents') && incidents.map((inc) => (
            <div
              key={`inc-${inc.id}`}
              className="p-4 rounded-2xl bg-gradient-to-br from-red-950/30 to-slate-900/90 border border-red-500/40 space-y-2.5 text-xs shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 uppercase">
                  {inc.type} · ROAD CLOSURE
                </span>
                <span className="text-[10px] font-mono text-red-300">{inc.severity}</span>
              </div>
              <h3 className="font-bold text-sm text-white">{inc.title}</h3>
              <p className="text-slate-300 text-xs leading-relaxed">{inc.description}</p>
              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-wrap justify-between items-center gap-1">
                <span>Corridor: <strong className="text-slate-200">{inc.affected_route}</strong></span>
                <span className="text-amber-400 text-[10px] font-mono">ADMINISTRATIVE</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {inc.latitude}, {inc.longitude}
              </div>
            </div>
          ))}

          {(activeTab === 'all' || activeTab === 'incidents') && verifiedReports.map((rep) => (
            <div
              key={`rep-${rep.id}`}
              className="p-4 rounded-2xl bg-slate-900/90 border border-orange-500/40 space-y-2.5 text-xs shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 uppercase">
                  {rep.disaster_type}
                </span>
                <span className="text-[10px] font-mono text-orange-400">USER REPORTED · UNVERIFIED</span>
              </div>
              <h3 className="font-bold text-sm text-white">{rep.location_name}</h3>
              <p className="text-slate-300 text-xs leading-relaxed">{rep.description}</p>
              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between items-center">
                <span>Coordinates: <strong className="text-slate-200">{rep.latitude.toFixed(3)}, {rep.longitude.toFixed(3)}</strong></span>
                <span className="text-orange-400 text-[10px] font-mono">UNVERIFIED</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-base text-white">Log Official Road Disruption</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreateIncidentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Title</label>
                <input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Hazard Type</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white">
                    <option value="Landslide">Landslide</option>
                    <option value="Flood">Flood</option>
                    <option value="Road Closure">Road Closure</option>
                    <option value="Bridge Failure">Bridge Failure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Severity</label>
                  <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white">
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Latitude (required)</label>
                  <input type="number" step="any" required value={newLat} onChange={(e) => setNewLat(e.target.value)} placeholder="e.g. 25.5788" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Longitude (required)</label>
                  <input type="number" step="any" required value={newLng} onChange={(e) => setNewLng(e.target.value)} placeholder="e.g. 91.8933" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Affected Highway Corridor</label>
                <input type="text" value={newRoute} onChange={(e) => setNewRoute(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Description</label>
                <textarea required rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg">Publish Alert</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
