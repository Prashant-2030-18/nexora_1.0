import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StateFilterProvider } from './context/StateFilterContext';
import { DisasterProvider } from './context/DisasterContext';
import { GPSProvider } from './context/GPSContext';
import { ConnectivityProvider } from './context/ConnectivityContext';
import { NavigationProvider } from './context/NavigationContext';
import { AppBootstrapProvider, useAppBootstrap } from './context/AppBootstrapContext';
import { SplashScreen } from './components/SplashScreen';
import { RootLayout } from './layouts/RootLayout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { GisMapPage } from './pages/GisMapPage';
import { SmartRoutePlanner } from './pages/SmartRoutePlanner';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { LogisticsOptimizationPage } from './pages/LogisticsOptimizationPage';
import { LiveDisasterIntelligencePage } from './pages/LiveDisasterIntelligencePage';
import { RiskPredictionPage } from './pages/RiskPredictionPage';
import { InfrastructureGapsPage } from './pages/InfrastructureGapsPage';
import { LogisticsHubPlannerPage } from './pages/LogisticsHubPlannerPage';
import { WhatIfSimulatorPage } from './pages/WhatIfSimulatorPage';
import { AnalyticsReportsPage } from './pages/AnalyticsReportsPage';
import { GovernmentDashboardPage } from './pages/GovernmentDashboardPage';
import { CitizenPortalPage } from './pages/CitizenPortalPage';
import { AdminManagementPage } from './pages/AdminManagementPage';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Main App Router rendered after bootstrap sequence
const MainAppContent: React.FC = () => {
  const { bootState } = useAppBootstrap();
  const { isAuthenticated, isLoading } = useAuth();

  // Show splash during boot sequence or auth token restoration
  if (bootState !== 'READY' || isLoading) {
    return <SplashScreen />;
  }

  return (
    <Routes>
      {/* Public Authentication: redirect authenticated users straight to dashboard */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Protected Platform Core */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RootLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="map" element={<GisMapPage />} />
        <Route path="routes" element={<SmartRoutePlanner />} />
        <Route path="accessibility" element={<AccessibilityPage />} />
        <Route path="optimization" element={<LogisticsOptimizationPage />} />
        <Route path="disasters" element={<LiveDisasterIntelligencePage />} />
        <Route path="predictions" element={<RiskPredictionPage />} />
        <Route path="gaps" element={<InfrastructureGapsPage />} />
        <Route path="hubs" element={<LogisticsHubPlannerPage />} />
        <Route path="simulator" element={<WhatIfSimulatorPage />} />
        <Route path="analytics" element={<AnalyticsReportsPage />} />
        <Route path="government" element={<GovernmentDashboardPage />} />
        <Route path="citizen" element={<CitizenPortalPage />} />
        <Route path="admin" element={<AdminManagementPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <AppBootstrapProvider>
        <AuthProvider>
          <StateFilterProvider>
            <DisasterProvider>
              <GPSProvider>
                <ConnectivityProvider>
                  <NavigationProvider>
                    <MainAppContent />
                  </NavigationProvider>
                </ConnectivityProvider>
              </GPSProvider>
            </DisasterProvider>
          </StateFilterProvider>
        </AuthProvider>
      </AppBootstrapProvider>
    </BrowserRouter>
  );
}

export default App;
