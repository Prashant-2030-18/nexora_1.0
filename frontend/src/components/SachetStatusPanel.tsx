import React, { useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw,
  Shield, Clock, Database, Radio, Timer
} from 'lucide-react';
import { useDisasters } from '../context/DisasterContext';

const BADGE_STYLES: Record<string, string> = {
  LIVE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  'LIVE OFFICIAL DATA': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  NOT_MODIFIED: 'bg-sky-500/20 text-sky-300 border-sky-500/50',
  'NOT MODIFIED — USING CACHED OFFICIAL XML': 'bg-sky-500/20 text-sky-300 border-sky-500/50',
  CACHED: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  'CACHED OFFICIAL DATA': 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  TIMEOUT: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  'CHECK TIMEOUT — USING LAST SUCCESSFUL OFFICIAL DATA': 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  'SACHET CHECK UNAVAILABLE — USING LAST SUCCESSFUL OFFICIAL DATA': 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  INVALID_XML: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  'SACHET RESPONSE INVALID — USING LAST SUCCESSFUL OFFICIAL DATA': 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  UNAVAILABLE: 'bg-red-500/20 text-red-300 border-red-500/50',
  'FEED UNAVAILABLE': 'bg-red-500/20 text-red-300 border-red-500/50',
  NOT_CONFIGURED: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
  'NOT CONFIGURED': 'bg-slate-500/20 text-slate-300 border-slate-500/50',
};

function formatBrowserTs(dateOrIso?: string | Date | null): string {
  if (!dateOrIso) return 'Never';
  try {
    const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
    if (isNaN(d.getTime())) return String(dateOrIso);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateOrIso);
  }
}

interface Props {
  onSynced?: () => void;
}

export const SachetStatusPanel: React.FC<Props> = ({ onSynced }) => {
  const {
    sachetStatus: status,
    totalActiveDisasters,
    lastCheckedAt,
    lastSuccessfulUpdate,
    lastModifiedAt,
    countdownSeconds,
    refreshDisasters,
    isRefreshing
  } = useDisasters();

  const [notify, setNotify] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setNotify(null);
    try {
      await refreshDisasters(true); // forceSync = true bypasses backend cooldown
      setNotify({
        type: 'ok',
        text: 'Live official SACHET alerts synchronized and updated across all map layers.',
      });
      onSynced?.();
    } catch (e: any) {
      const detail = e?.message || 'Request failed';
      setNotify({
        type: 'err',
        text: `SACHET check unavailable: ${detail}. Preserving verified official disaster markers.`,
      });
    } finally {
      setTimeout(() => setNotify(null), 7000);
    }
  };

  const badge = status?.statusBadge || status?.status || 'FEED UNAVAILABLE';
  const badgeClass = BADGE_STYLES[badge] || BADGE_STYLES[status?.statusCode || ''] || BADGE_STYLES['FEED UNAVAILABLE'];

  const hasCachedAlerts = (totalActiveDisasters > 0) || ((status?.activeAlertCount ?? 0) > 0) || ((status?.alertCount ?? 0) > 0);
  const isTimeoutGraceful = status?.statusCode === 'TIMEOUT' || (status?.error && hasCachedAlerts && status?.statusCode !== 'LIVE');

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Radio className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white tracking-wide">SACHET NDMA</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${badgeClass}`}>
              {badge}
            </span>
            <div className="flex items-center gap-1.5 ml-2 text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
              <span className={`w-1.5 h-1.5 rounded-full ${isRefreshing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
              <span>AUTO REFRESH: 30s</span>
              <span className="text-slate-600">•</span>
              {isRefreshing ? (
                <span className="text-amber-300 font-bold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  REFRESHING...
                </span>
              ) : (
                <span className="text-sky-400 flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  Next check in: {countdownSeconds}s
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Official CAP 1.2 feed · ETag caching · Cached XML is never labelled LIVE
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-md active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing Live Alerts...' : 'Refresh Live Alerts'}
          </button>
          <a
            href="https://sachet.ndma.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Official SACHET Portal
          </a>
        </div>
      </div>

      {notify && (
        <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 border ${
          notify.type === 'ok'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
            : 'bg-amber-950/40 border-amber-800 text-amber-200'
        }`}>
          {notify.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{notify.text}</span>
        </div>
      )}

      {!status ? (
        <div className="text-xs text-sky-400 flex items-center gap-2 py-3">
          <Activity className="w-3.5 h-3.5 animate-pulse" /> Connecting to SACHET NDMA telemetry…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 flex items-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 text-sky-400" /> Last checked
            </div>
            <div className="text-slate-200 font-mono">
              {formatBrowserTs(lastCheckedAt || status?.lastCheckedAt || status?.last_sync_timestamp)}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 flex items-center gap-1 mb-0.5">
              <Shield className="w-3 h-3 text-emerald-400" /> Last successful update
            </div>
            <div className="text-slate-200 font-mono">
              {formatBrowserTs(lastSuccessfulUpdate || status?.lastSuccessfulFetch || status?.last_successful_fetch_time)}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 mb-0.5">Official last modified</div>
            <div className="text-slate-200 font-mono truncate" title={lastModifiedAt || status?.lastModifiedAt || '—'}>
              {lastModifiedAt || status?.lastModifiedAt || '—'}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 flex items-center gap-1 mb-0.5">
              <Database className="w-3 h-3 text-indigo-400" /> ETag
            </div>
            <div className="text-slate-200 font-mono">
              {status?.etagPresent ? 'Present' : 'Not stored yet'}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 mb-0.5">Active alerts</div>
            <div className="text-emerald-300 font-bold text-sm">
              {totalActiveDisasters || status?.activeAlertCount || status?.total_active_alerts || 0}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="text-slate-500 mb-0.5">Expired alerts</div>
            <div className="text-slate-300 font-bold text-sm">
              {status?.expiredAlertCount ?? 0}
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 col-span-2">
            <div className="text-slate-500 mb-0.5">Official source</div>
            <a
              href={status?.officialSourceUrl || 'https://sachet.ndma.gov.in'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline font-mono truncate block"
            >
              {status?.officialSourceUrl || 'https://sachet.ndma.gov.in'}
            </a>
          </div>

          {/* Graceful Non-Blocking Notice when Upstream SACHET check timed out or had network issue */}
          {isTimeoutGraceful && (
            <div className="col-span-2 md:col-span-4 text-amber-300 bg-amber-950/25 border border-amber-800/40 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Upstream SACHET feed check unavailable (network timeout). Operating normally using verified cached official data.
              </span>
            </div>
          )}

          {/* Only show blocking red error if feed is completely down with zero cached data */}
          {status?.error && !hasCachedAlerts && (
            <div className="col-span-2 md:col-span-4 text-red-300 bg-red-950/30 border border-red-800/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Error: {status.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
