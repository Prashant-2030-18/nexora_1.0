import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, Check, CheckCheck, AlertTriangle, ShieldAlert,
  Info, Compass, ArrowRight, RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { AlertData } from '../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertsUpdated?: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose, onAlertsUpdated }) => {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setAlerts(data);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
      if (onAlertsUpdated) onAlertsUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      if (onAlertsUpdated) onAlertsUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const filteredAlerts = filterSeverity === 'All'
    ? alerts
    : alerts.filter(a => a.severity === filterSeverity);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="fixed inset-0 z-[2500] flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">Disaster & Freight Alerts</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Live Disruption Feeds & Safety Advisories</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Severity filter tabs & Mark all read */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  filterSeverity === sev
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
              <p>No alerts matching current filter.</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              let borderCol = 'border-slate-700/60 bg-slate-800/40';
              let badgeCol = 'bg-slate-700 text-slate-300';
              if (alert.severity === 'Critical') {
                borderCol = 'border-red-500/50 bg-red-950/20';
                badgeCol = 'bg-red-500/20 text-red-400 border border-red-500/40';
              } else if (alert.severity === 'High') {
                borderCol = 'border-amber-500/50 bg-amber-950/20';
                badgeCol = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
              }

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border transition-all text-xs ${borderCol} ${
                    !alert.is_read ? 'shadow-md ring-1 ring-sky-500/30' : 'opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeCol}`}>
                      {alert.severity.toUpperCase()} • {alert.type}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-100 text-xs mb-1">{alert.title}</h4>
                  <p className="text-slate-300 text-[11px] leading-relaxed mb-2.5">{alert.message}</p>

                  <div className="flex items-center justify-between border-t border-slate-700/40 pt-2">
                    <span className="text-[10px] text-slate-400">State: <strong className="text-slate-200">{alert.state}</strong></span>
                    <div className="flex items-center gap-2">
                      {!alert.is_read && (
                        <button
                          onClick={() => handleMarkRead(alert.id)}
                          className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigate('/live-disasters');
                          onClose();
                        }}
                        className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                      >
                        <span>View Corridor</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
