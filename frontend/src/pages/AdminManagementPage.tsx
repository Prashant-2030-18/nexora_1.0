import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, ShieldAlert, FileText, Plus,
  Trash2, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Database, MapPin, Clock, Cpu, ShieldCheck, RotateCw
} from 'lucide-react';
import { api } from '../services/api';
import { User, IncidentData, AuditLogData, UserReportData } from '../types';

type AdminTab = 'users' | 'incidents' | 'citizen_reports' | 'data_sources' | 'audit_logs';

export const AdminManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [citizenReports, setCitizenReports] = useState<UserReportData[]>([]);
  const [dataSourcesInfo, setDataSourcesInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<number | null>(null);
  const [reverifyingId, setReverifyingId] = useState<number | null>(null);
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<number, string>>({});

  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Password@123');
  const [newRole, setNewRole] = useState('state_gov');
  const [newState, setNewState] = useState('Assam');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, incRes, audRes, reportRes, dsRes] = await Promise.all([
        api.getAdminUsers(),
        api.getIncidents(),
        api.getAuditLogs(),
        api.getAllUserReports(),
        api.getDataSourcesStatus()
      ]);
      setUsers(uRes);
      setIncidents(incRes);
      setAuditLogs(audRes);
      setCitizenReports(reportRes);
      setDataSourcesInfo(dsRes);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try { await api.toggleUserStatus(userId, !currentStatus); fetchData(); } catch (err) { console.error(err); }
  };

  const handleUpdateRole = async (userId: number, role: string) => {
    try { await api.updateUserRole(userId, role); fetchData(); } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('Delete this user?')) return;
    try { await api.deleteUser(userId); fetchData(); } catch (err: any) { alert(err?.response?.data?.detail || 'Delete failed'); }
  };

  const handleDeleteIncident = async (incId: number) => {
    if (!window.confirm('Delete this incident?')) return;
    try { await api.deleteIncident(incId); fetchData(); } catch (err) { console.error(err); }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminUser({ name: newName, email: newEmail, password: newPassword, role: newRole, state: newState });
      setShowNewUserModal(false);
      fetchData();
    } catch (err: any) { alert(err?.response?.data?.detail || 'Failed to create user'); }
  };

  const handleReverifyReport = async (reportId: number) => {
    setReverifyingId(reportId);
    try {
      await api.reverifyUserReport(reportId);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'AI Re-verification failed');
    } finally {
      setReverifyingId(null);
    }
  };

  const handleModerateReport = async (reportId: number, newStatus: string) => {
    setModeratingId(reportId);
    const notes = reviewNotesMap[reportId] || '';
    try {
      if (newStatus === 'Verified' || newStatus === 'APPROVED') {
        await api.approveUserReport(reportId, notes || 'Verified by admin.');
      } else {
        await api.rejectUserReport(reportId, notes || 'Rejected by admin.');
      }
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Moderation failed');
    } finally {
      setModeratingId(null);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!window.confirm('Delete this citizen report permanently? Uploaded evidence files will also be purged.')) return;
    try {
      await api.deleteUserDisaster(reportId);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Delete failed');
    }
  };

  const handleSyncSachet = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const result = await api.syncSachetAlerts();
      setSyncResult(`Sync complete: ${result.inserted ?? 0} inserted, ${result.skipped ?? 0} skipped, ${result.errors ?? 0} errors, ${result.fetched ?? 0} fetched from NDMA.`);
      fetchData();
    } catch (err: any) { setSyncResult('Sync failed: ' + (err?.response?.data?.detail || err?.message || 'Unknown error')); }
    finally { setSyncing(false); }
  };

  const tabs = [
    { id: 'users' as AdminTab, label: 'User Accounts', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'incidents' as AdminTab, label: 'Incident Control', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { id: 'citizen_reports' as AdminTab, label: 'Citizen Reports', icon: <MapPin className="w-3.5 h-3.5" /> },
    { id: 'data_sources' as AdminTab, label: 'Data Sources', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'audit_logs' as AdminTab, label: 'Audit Trail', icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  const pendingCount = citizenReports.filter(r => ['Pending Verification', 'PENDING'].includes((r.status || '').toUpperCase())).length;
  const verifiedCount = citizenReports.filter(r => ['VERIFIED', 'APPROVED', 'ACTIVE'].includes((r.status || '').toUpperCase())).length;
  const rejectedCount = citizenReports.filter(r => ['REJECTED'].includes((r.status || '').toUpperCase())).length;

  const severityClass = (s?: string) => {
    if (!s) return 'bg-slate-700/30 text-slate-300';
    const sl = s.toLowerCase();
    if (sl === 'critical' || sl === 'high') return 'bg-red-500/20 text-red-400';
    if (sl === 'moderate' || sl === 'medium') return 'bg-amber-500/20 text-amber-400';
    return 'bg-emerald-500/20 text-emerald-400';
  };

  const statusClass = (s?: string) => {
    if (!s) return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    const sl = s.toUpperCase();
    if (sl.includes('VERIFIED') || sl.includes('APPROVED')) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    if (sl.includes('REJECTED')) return 'bg-red-500/20 text-red-400 border border-red-500/40';
    return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest font-mono">Root Administration &amp; Governance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Admin Management Console</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage users, moderate citizen reports, sync data pipelines, and inspect audit trails.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[110px] py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${activeTab === tab.id ? 'bg-sky-500 text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-white'}`}>
            {tab.icon}<span>{tab.label}</span>
            {tab.id === 'citizen_reports' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-slate-400 text-xs py-12">Loading admin data...</div>}

      {!loading && activeTab === 'users' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">Registered Users &amp; Role-Based Access Control</h3>
              <p className="text-xs text-slate-400">{users.length} registered accounts</p>
            </div>
            <button onClick={() => setShowNewUserModal(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs">
              <Plus className="w-4 h-4" /><span>Create New User</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">State</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-900/60">
                    <td className="p-3 font-bold text-white">{u.name}</td>
                    <td className="p-3 font-mono text-slate-300">{u.email}</td>
                    <td className="p-3">
                      <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-sky-400 font-semibold">
                        <option value="admin">Admin / MDoNER</option>
                        <option value="state_gov">State Government</option>
                        <option value="logistics_operator">Logistics Operator</option>
                        <option value="citizen">Citizen</option>
                      </select>
                    </td>
                    <td className="p-3 text-slate-300">{u.state || 'All'}</td>
                    <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span></td>
                    <td className="p-3 flex items-center gap-2">
                      <button onClick={() => handleToggleUserStatus(u.id, u.is_active)} className="text-[11px] text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-lg">{u.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'incidents' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-sm text-white">Active Incident &amp; Road Disruption Operations</h3>
          {incidents.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No live data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                  <tr><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Severity</th><th className="p-3">Corridor</th><th className="p-3">State</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-900/60">
                      <td className="p-3 font-bold text-white max-w-xs truncate">{inc.title}</td>
                      <td className="p-3">{inc.type}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityClass(inc.severity)}`}>{inc.severity}</span></td>
                      <td className="p-3 font-mono text-sky-300">{inc.affected_route}</td>
                      <td className="p-3">{inc.state}</td>
                      <td className="p-3"><span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">{inc.status}</span></td>
                      <td className="p-3"><button onClick={() => handleDeleteIncident(inc.id)} className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'citizen_reports' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest font-mono">
                  Autonomous Intelligence Layer
                </span>
              </div>
              <h3 className="font-bold text-base text-white">AI Citizen Report Intelligence & Verification Monitor</h3>
              <p className="text-xs text-slate-400">
                Multi-signal automated AI verification evaluates geofence bounds, hazard taxonomy, and photographic evidence.
              </p>
            </div>
            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg flex items-center gap-1.5 text-xs font-semibold self-start sm:self-auto cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Telemetry</span>
            </button>
          </div>

          {/* Quick AI Verification KPI stats ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Total Reports</span>
              <span className="text-lg font-extrabold text-white font-mono">{citizenReports.length}</span>
            </div>
            <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-800/40">
              <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold block flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> AI Verified
              </span>
              <span className="text-lg font-extrabold text-emerald-300 font-mono">
                {citizenReports.filter(r => (r.verification_status || '').toUpperCase() === 'AI_VERIFIED' || ['VERIFIED', 'APPROVED', 'ACTIVE'].includes((r.status || '').toUpperCase())).length}
              </span>
            </div>
            <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-800/40">
              <span className="text-[10px] uppercase font-mono text-amber-400 font-bold block flex items-center gap-1">
                <Clock className="w-3 h-3" /> AI Review
              </span>
              <span className="text-lg font-extrabold text-amber-300 font-mono">
                {citizenReports.filter(r => (r.verification_status || '').toUpperCase() === 'AI_REVIEW' || ['Pending Verification', 'PENDING'].includes((r.status || '').toUpperCase())).length}
              </span>
            </div>
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block flex items-center gap-1">
                <XCircle className="w-3 h-3" /> AI Rejected
              </span>
              <span className="text-lg font-extrabold text-slate-400 font-mono">
                {citizenReports.filter(r => (r.verification_status || '').toUpperCase() === 'AI_REJECTED' || ['REJECTED'].includes((r.status || '').toUpperCase())).length}
              </span>
            </div>
          </div>

          {citizenReports.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center font-mono">No citizen disaster reports currently registered in database.</p>
          ) : (
            <div className="space-y-3 pt-2">
              {citizenReports.map((report) => {
                const vStatus = (report.verification_status || 'AI_REVIEW').toUpperCase();
                const rawSt = (report.status || 'PENDING').toUpperCase();
                const isVerified = vStatus === 'AI_VERIFIED' || (['VERIFIED', 'APPROVED', 'ACTIVE'].includes(rawSt) && vStatus !== 'AI_REJECTED');
                const isRejected = vStatus === 'AI_REJECTED' || rawSt === 'REJECTED';
                const isPending = !isVerified && !isRejected;

                const evUrl = report.evidence_url || (report as any).image_url;
                const confScore = report.ai_confidence !== undefined ? report.ai_confidence : (report.confidence || 0.70);
                const confPct = Math.round(confScore * 100);

                return (
                  <div
                    key={report.id}
                    className={`rounded-xl border p-4 space-y-3 ${
                      isVerified
                        ? 'border-emerald-600/30 bg-emerald-950/10'
                        : isRejected
                        ? 'border-red-700/30 bg-red-950/10 opacity-75'
                        : 'border-amber-600/40 bg-amber-950/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                              isVerified
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : isRejected
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {isVerified ? (
                              <>
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span>AI VERIFIED CITIZEN REPORT</span>
                              </>
                            ) : isRejected ? (
                              <>
                                <XCircle className="w-3 h-3 text-red-400" />
                                <span>AI REJECTED</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>AI REVIEW REQUIRED</span>
                              </>
                            )}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityClass(report.severity)}`}>
                            {report.severity}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                            {report.disaster_type}
                          </span>
                        </div>
                        <p className="font-bold text-white text-sm">{report.location_name || 'Reported Location'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{report.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-mono">{report.created_at ? new Date(report.created_at).toLocaleString() : ''}</p>
                        <p className="text-xs text-slate-400">By: <span className="text-slate-300 font-semibold">{report.reporter_name}</span></p>
                        {report.reporter_phone && <p className="text-xs text-slate-500">{report.reporter_phone}</p>}
                      </div>
                    </div>

                    {/* AI Verification Transparency Details */}
                    <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800/90 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-sky-400" />
                          <span>AI Verification Confidence</span>
                        </span>
                        <strong className={isVerified ? 'text-emerald-400' : isRejected ? 'text-red-400' : 'text-amber-400'}>
                          {confPct}%
                        </strong>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${isVerified ? 'bg-emerald-400' : isRejected ? 'bg-red-500' : 'bg-amber-400'}`}
                          style={{ width: `${confPct}%` }}
                        />
                      </div>
                      {report.ai_reason && (
                        <p className="text-[10px] text-slate-400 font-mono leading-tight pt-1 border-t border-slate-800/60">
                          {report.ai_reason}
                        </p>
                      )}
                    </div>

                    {/* Coordinates & Evidence Section */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{typeof report.latitude === 'number' ? report.latitude.toFixed(4) : '-'}, {typeof report.longitude === 'number' ? report.longitude.toFixed(4) : '-'}</span>
                      </div>

                      {evUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={evUrl}
                            alt="Field Evidence"
                            className="w-14 h-10 object-cover rounded-lg border border-slate-700 hover:scale-105 transition-transform cursor-pointer"
                            onClick={() => window.open(evUrl, '_blank')}
                          />
                          <span className="text-[11px] text-sky-400 hover:underline cursor-pointer" onClick={() => window.open(evUrl, '_blank')}>
                            Evidence Photo &nearr;
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">No evidence photo provided</span>
                      )}
                    </div>

                    {/* Moderation & AI Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={reverifyingId === report.id}
                          onClick={() => handleReverifyReport(report.id!)}
                          className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 font-semibold cursor-pointer disabled:opacity-50"
                          title="Re-run AI verification engine with live corroboration"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${reverifyingId === report.id ? 'animate-spin' : ''}`} />
                          <span>Re-Verify with AI</span>
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col sm:flex-row gap-2 justify-end">
                        <input
                          type="text"
                          placeholder="Optional override notes..."
                          value={reviewNotesMap[report.id!] || ''}
                          onChange={(e) => setReviewNotesMap((prev) => ({ ...prev, [report.id!]: e.target.value }))}
                          className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-slate-600"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={moderatingId === report.id}
                            onClick={() => handleModerateReport(report.id!, 'APPROVED')}
                            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs disabled:opacity-50 cursor-pointer"
                            title="Force approve report"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{moderatingId === report.id ? 'Saving...' : 'Override: Approve'}</span>
                          </button>
                          <button
                            disabled={moderatingId === report.id}
                            onClick={() => handleModerateReport(report.id!, 'REJECTED')}
                            className="flex items-center gap-1.5 px-3 py-1 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg text-xs disabled:opacity-50 cursor-pointer"
                            title="Force reject report"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Override: Reject</span>
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteReport(report.id!)}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer self-end sm:self-auto"
                        title="Delete Report Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'data_sources' && (
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">SACHET NDMA - Live Alert Sync</h3>
                <p className="text-xs text-slate-400">Manually trigger a poll of the SACHET CAP RSS feed to ingest new NDMA disaster alerts.</p>
              </div>
              <button onClick={handleSyncSachet} disabled={syncing} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync SACHET Alerts Now'}</span>
              </button>
            </div>
            {syncResult && (
              <div className={`p-3 rounded-xl border text-xs font-mono ${syncResult.startsWith('Sync failed') ? 'border-red-600/40 bg-red-950/30 text-red-300' : 'border-emerald-600/40 bg-emerald-950/30 text-emerald-300'}`}>
                {syncResult}
              </div>
            )}
          </div>

          {dataSourcesInfo?.sources?.length > 0 && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
              <h3 className="font-bold text-sm text-white">External Data Pipeline Status</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                    <tr><th className="p-3">Data Source</th><th className="p-3">Type</th><th className="p-3">Base URL</th><th className="p-3">Status</th><th className="p-3">Last Synced</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dataSourcesInfo.sources.map((src: any) => (
                      <tr key={src.id} className="hover:bg-slate-900/60">
                        <td className="p-3 font-bold text-white">{src.name || '-'}</td>
                        <td className="p-3 font-mono">{src.source_type || '-'}</td>
                        <td className="p-3 text-sky-400 font-mono truncate max-w-[200px]">{src.base_url || '-'}</td>
                        <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${src.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{src.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td className="p-3 text-slate-400 font-mono text-[10px]">{src.last_synced_at ? new Date(src.last_synced_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {dataSourcesInfo?.recent_sync_logs?.length > 0 && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /><h3 className="font-bold text-sm text-white">Recent Sync Logs (Last 15)</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                    <tr><th className="p-3">Timestamp</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">Records</th><th className="p-3">Message</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dataSourcesInfo.recent_sync_logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-900/60">
                        <td className="p-3 font-mono text-slate-400 text-[10px] whitespace-nowrap">{log.synced_at ? new Date(log.synced_at).toLocaleString() : '-'}</td>
                        <td className="p-3 font-semibold text-white">{log.source_name || '-'}</td>
                        <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{log.status || '-'}</span></td>
                        <td className="p-3">{log.records_fetched ?? '-'}</td>
                        <td className="p-3 text-slate-400 max-w-xs truncate">{log.message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!dataSourcesInfo?.sources?.length && !dataSourcesInfo?.recent_sync_logs?.length && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">No live data available. Data source records will appear here after first sync.</div>
          )}
        </div>
      )}

      {!loading && activeTab === 'audit_logs' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-sm text-white">System Audit Trail &amp; Security Logs</h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No audit events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                  <tr><th className="p-3">Timestamp</th><th className="p-3">User Email</th><th className="p-3">Action</th><th className="p-3">Event Details</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/60">
                      <td className="p-3 font-mono text-slate-400 text-[10px] whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="p-3 font-bold text-white">{log.user_email}</td>
                      <td className="p-3 font-mono text-sky-400 font-semibold text-[11px]">{log.action}</td>
                      <td className="p-3 text-slate-300">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNewUserModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-base text-white">Add User Account (Admin Provisioning)</h3>
            <form onSubmit={handleCreateUserSubmit} className="space-y-3">
              <div><label className="block text-slate-300 font-semibold mb-1">Full Name</label><input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" /></div>
              <div><label className="block text-slate-300 font-semibold mb-1">Email</label><input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" /></div>
              <div><label className="block text-slate-300 font-semibold mb-1">Password</label><input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-slate-300 font-semibold mb-1">Role</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white">
                    <option value="admin">Admin / MDoNER</option><option value="state_gov">State Government</option><option value="logistics_operator">Logistics Operator</option><option value="citizen">Citizen</option>
                  </select>
                </div>
                <div><label className="block text-slate-300 font-semibold mb-1">State</label>
                  <select value={newState} onChange={(e) => setNewState(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white">
                    {['All','Assam','Arunachal Pradesh','Manipur','Meghalaya','Mizoram','Nagaland','Tripura','Sikkim'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowNewUserModal(false)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700">Cancel</button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 font-bold text-slate-950">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
