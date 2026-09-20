import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';
import { Footer } from '../components/Footer';
import { AICopilotDrawer } from '../components/AICopilotDrawer';
import { ConnectivityBanner } from '../components/ConnectivityBanner';
import { useNavigation } from '../context/NavigationContext';

export const RootLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isNavigating } = useNavigation();

  return (
    <div className={`${isNavigating ? 'h-screen h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white`}>
      {/* Top Navigation Bar */}
      <Navbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar: collapsed during active turn-by-turn navigation */}
        {!isNavigating && (
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col min-w-0 min-h-0 ${isNavigating ? 'overflow-hidden' : 'lg:pl-64 overflow-y-auto'}`}>
          <div className={isNavigating ? 'flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden relative' : 'flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto'}>
            <Outlet />
          </div>
          {!isNavigating && <Footer />}
        </main>
      </div>

      {/* Floating Autonomous AI Copilot Assistant (hidden during navigation to prevent obstruction) */}
      {!isNavigating && <AICopilotDrawer />}

      {/* Global Connectivity Status Strip — always visible, non-blocking */}
      <ConnectivityBanner />
    </div>
  );
};
