import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Compass, Search, Bell, User, LogOut,
  ChevronDown, ShieldAlert, CheckCircle, Menu, X,
  MapPin, Warehouse, AlertTriangle, Route, Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStateFilter } from '../context/StateFilterContext';
import { useNavigation } from '../context/NavigationContext';
import { api } from '../services/api';
import { NotificationDrawer } from './NotificationDrawer';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const { selectedState, setSelectedState } = useStateFilter();
  const { isNavigating, stopNavigationSession } = useNavigation();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [services, setServices] = useState<any | null>(null);
  const [showServices, setShowServices] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const statesList = [
    "All", "Assam", "Arunachal Pradesh", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Tripura", "Sikkim"
  ];

  // Refresh alert count
  const refreshAlertCount = async () => {
    try {
      const data = await api.getNotifications(undefined, true);
      setUnreadAlertsCount(data.length);
    } catch (err) {
      // ignore
    }
  };

  // Poll real API connectivity + per-service status
  const checkApiStatus = async () => {
    try {
      await api.getDashboardKpis();
      setApiStatus('connected');
      try {
        const s = await api.getServicesStatus();
        setServices(s);
      } catch {
        setServices(null);
      }
    } catch {
      setApiStatus('offline');
    }
  };

  useEffect(() => {
    refreshAlertCount();
    checkApiStatus();
    const alertInterval = setInterval(refreshAlertCount, 30000);
    const statusInterval = setInterval(checkApiStatus, 45000);
    return () => {
      clearInterval(alertInterval);
      clearInterval(statusInterval);
    };
  }, []);

  // Global search lookup across entities
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = searchQuery.toLowerCase();
        const results: any[] = [];

        // Check states & districts
        const districts = await api.getDistricts();
        districts.filter(d => d.name.toLowerCase().includes(q)).slice(0, 3).forEach(d => {
          results.push({ type: 'District', title: d.name, subtitle: `District`, path: '/accessibility' });
        });

        // Check hubs
        const hubs = await api.getLogisticsHubs();
        hubs.filter(h => h.name.toLowerCase().includes(q)).slice(0, 3).forEach(h => {
          results.push({ type: 'Logistics Hub', title: h.name, subtitle: `${h.state}`, path: '/logistics' });
        });

        // Check incidents
        const incidents = await api.getIncidents();
        incidents.filter(inc => inc.title.toLowerCase().includes(q) || (inc.affected_route && inc.affected_route.toLowerCase().includes(q))).slice(0, 3).forEach(inc => {
          results.push({ type: 'Incident', title: inc.title, subtitle: `${inc.severity} • ${inc.affected_route || 'Road'}`, path: '/live-disasters' });
        });

        setSearchResults(results);
        setShowSearchDropdown(true);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchResultClick = (path: string) => {
    setShowSearchDropdown(false);
    setSearchQuery('');
    navigate(path);
  };

  return (
    <>
      <header className="sticky top-0 z-[2000] bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
          {/* Left: Mobile Toggle & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div 
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-white group-hover:text-sky-400 transition-colors">
                    NEXORA
                  </span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    MDoNER
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-none hidden sm:block">
                  NER Smart Logistics & Accessibility Platform
                </p>
              </div>
            </div>
          </div>

          {/* Middle: Universal Search Bar & State Filter */}
          <div className="flex-1 max-w-xl mx-2 hidden md:flex items-center gap-2">
            {/* Search Input */}
            <div ref={searchRef} className="relative flex-1">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search districts, logistics hubs, corridors, incidents..."
                  className="w-full bg-slate-900/90 border border-slate-700/60 text-xs rounded-xl pl-9 pr-8 py-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search Results Autocomplete Dropdown */}
              {showSearchDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-[2200] max-h-80 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-4 text-center text-xs text-slate-400">Searching NER spatial index...</div>
                  ) : searchResults.length > 0 ? (
                    <div className="p-1.5 space-y-1">
                      {searchResults.map((res, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSearchResultClick(res.path)}
                          className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors"
                        >
                          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            {res.type === 'District' && <MapPin className="w-3.5 h-3.5" />}
                            {res.type === 'Logistics Hub' && <Warehouse className="w-3.5 h-3.5" />}
                            {res.type === 'Incident' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">{res.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{res.subtitle}</p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-800">
                            {res.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">No matching spatial entities found.</div>
                  )}
                </div>
              )}
            </div>

            {/* State Selector Filter */}
            <div className="relative">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="bg-slate-900 border border-slate-700/60 text-xs text-sky-300 font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {statesList.map(s => (
                  <option key={s} value={s} className="bg-slate-900 text-white">
                    State: {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Live Telemetry Indicator, Alerts, User Profile */}
          <div className="flex items-center gap-2.5">
            {/* Active Turn-by-Turn Navigation Exit Button */}
            {isNavigating && (
              <button
                type="button"
                onClick={() => stopNavigationSession()}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold font-mono flex items-center gap-1.5 shadow-lg shadow-red-950 transition cursor-pointer"
                title="Exit Navigation (Return to Planner)"
              >
                <X className="w-3.5 h-3.5" />
                <span>EXIT NAVIGATION</span>
              </button>
            )}

            {/* Per-service status (not a single fake API CONNECTED badge) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowServices((v) => !v)}
                className={`flex items-center gap-1.5 bg-slate-900/90 border px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-medium ${
                  apiStatus === 'connected'
                    ? 'border-emerald-500/30 text-emerald-400'
                    : apiStatus === 'checking'
                    ? 'border-amber-500/30 text-amber-400'
                    : 'border-red-500/30 text-red-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  apiStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : apiStatus === 'checking'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-red-400'
                }`}></span>
                <span className="hidden sm:inline">
                  {apiStatus === 'connected' ? 'SERVICES' : apiStatus === 'checking' ? 'CHECKING...' : 'API OFFLINE'}
                </span>
              </button>
              {showServices && services && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl p-3 z-[2000] text-[10px] space-y-1.5">
                  <div className="font-bold text-slate-300 uppercase tracking-wider mb-1">Service Status</div>
                  {[
                    ['Backend API', services.backendApi?.status],
                    ['Database', services.database?.status],
                    ['SACHET NDMA', services.sachetNdma?.status],
                    ['GPS', services.gps?.status],
                    ['Routing', services.routingProvider?.status],
                    ['Weather', services.weatherProvider?.status],
                    ['AI', services.aiProvider?.status],
                    ['Google Maps', services.googleMapsProvider?.status],
                    ['OpenStreetMap', services.openStreetMapProvider?.status],
                  ].map(([label, st]) => (
                    <div key={String(label)} className="flex justify-between gap-2 text-slate-400">
                      <span>{label}</span>
                      <span className="text-slate-200 font-mono text-right">{String(st || 'Unavailable')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Notifications Bell */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
              title="Disaster & Route Alerts"
            >
              <Bell className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {/* User Profile / Role Dropdown */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(prev => !prev)}
                className="flex items-center gap-2 p-1.5 sm:px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold border border-sky-500/30">
                  {user?.name ? user.name[0] : 'U'}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <p className="font-semibold text-slate-200 leading-tight truncate max-w-[120px]">
                    {user?.name || "User"}
                  </p>
                  <p className="text-[10px] text-sky-400 uppercase font-mono">
                    {user?.role?.replace('_', ' ') || "Citizen"}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 z-[2200] text-xs space-y-2.5 animate-in fade-in zoom-in-95">
                  <div className="border-b border-slate-800 pb-2">
                    <p className="font-bold text-white">{user?.name}</p>
                    <p className="text-slate-400 text-[11px]">{user?.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
                        Role: {user?.role}
                      </span>
                      <span className="text-[10px] text-slate-400">({user?.state || 'All'})</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-red-400 bg-red-950/30 hover:bg-red-950/60 border border-red-800/40 transition-colors font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onAlertsUpdated={refreshAlertCount}
      />
    </>
  );
};
