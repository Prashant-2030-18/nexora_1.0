import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Route, Compass, Truck, Radio,
  ShieldAlert, GitPullRequest, Warehouse, PlaySquare,
  BarChart3, Landmark, Users, Settings, LogOut,
  AlertTriangle, Bot, Layers, Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems: NavItem[] = [
    {
      label: "Overview",
      path: "/dashboard",
      icon: <LayoutDashboard className="w-4 h-4" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator', 'citizen'],
    },
    {
      label: "GIS Intelligence Map",
      path: "/map",
      icon: <Layers className="w-4 h-4" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator', 'citizen'],
    },
    {
      label: "AI Smart Routes",
      path: "/routes",
      icon: <Route className="w-4 h-4 text-sky-400" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator', 'citizen'],
      badge: "AI Reroute"
    },
    {
      label: "Accessibility Intel",
      path: "/accessibility",
      icon: <Compass className="w-4 h-4 text-emerald-400" />,
      allowedRoles: ['admin', 'state_gov', 'citizen'],
    },
    {
      label: "Smart Logistics & Fleet",
      path: "/logistics",
      icon: <Truck className="w-4 h-4 text-indigo-400" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator'],
    },
    {
      label: "Live Disaster Radar",
      path: "/live-disasters",
      icon: <Radio className="w-4 h-4 text-red-400" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator', 'citizen'],
      badge: "Live"
    },
    {
      label: "Risk & ML Predictions",
      path: "/risk-prediction",
      icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator'],
    },
    {
      label: "Infrastructure Gaps",
      path: "/infrastructure-gaps",
      icon: <GitPullRequest className="w-4 h-4 text-teal-400" />,
      allowedRoles: ['admin', 'state_gov'],
    },
    {
      label: "Logistics Hub Planner",
      path: "/hub-planner",
      icon: <Warehouse className="w-4 h-4 text-cyan-400" />,
      allowedRoles: ['admin', 'state_gov'],
      badge: "Gravity AI"
    },
    {
      label: "What-If Simulator",
      path: "/simulator",
      icon: <PlaySquare className="w-4 h-4 text-fuchsia-400" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator'],
    },
    {
      label: "Analytics & Reports",
      path: "/analytics",
      icon: <BarChart3 className="w-4 h-4" />,
      allowedRoles: ['admin', 'state_gov', 'logistics_operator'],
    },
    {
      label: "Government Policy Portal",
      path: "/government",
      icon: <Landmark className="w-4 h-4 text-amber-400" />,
      allowedRoles: ['admin', 'state_gov'],
    },
    {
      label: "Citizen Safety Portal",
      path: "/citizen",
      icon: <Users className="w-4 h-4 text-emerald-400" />,
      allowedRoles: ['admin', 'citizen'],
    },
  ];

  const adminItems: NavItem[] = [
    {
      label: "Admin Management",
      path: "/admin",
      icon: <Settings className="w-4 h-4 text-slate-300" />,
      allowedRoles: ['admin'],
      badge: "Root"
    },
  ];

  const currentRole = user?.role || 'citizen';
  const visibleNav = navItems.filter(item => item.allowedRoles.includes(currentRole));
  const visibleAdmin = adminItems.filter(item => item.allowedRoles.includes(currentRole));

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 z-[1850] lg:hidden backdrop-blur-sm"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-[1900] w-64 glass-panel bg-slate-950/95 border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 font-bold text-xs">
              NE
            </div>
            <div>
              <h2 className="font-bold text-sm text-white tracking-tight leading-none">
                NER-SmartLogix
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Autonomous Control Tower</p>
            </div>
          </div>
        </div>

        {/* Navigation Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 py-1.5">
            Intelligence Modules
          </div>

          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 glow-sky'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}

          {visibleAdmin.length > 0 && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 pt-3 pb-1">
                Administration
              </div>
              {visibleAdmin.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/60">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </div>

        {/* User Card & Logout Bottom */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950">
          <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {user?.name ? user.name[0] : 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate">{user?.name || "Transporter"}</p>
                <p className="text-[10px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Sign Out"
              className="text-slate-400 hover:text-red-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
