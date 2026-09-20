import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export type BootState = 'BOOTING' | 'CHECKING_SESSION' | 'READY' | 'BOOT_ERROR';

export interface AppBootstrapContextType {
  bootState: BootState;
  statusMessage: string;
  bootstrapProgress: number;
  isBackendOnline: boolean | null;
  canContinueOffline: boolean;
  retryBootstrap: () => Promise<void>;
  continueOffline: () => void;
}

const AppBootstrapContext = createContext<AppBootstrapContextType | null>(null);

export const AppBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bootState, setBootState] = useState<BootState>('BOOTING');
  const [statusMessage, setStatusMessage] = useState<string>('NEXORA Intelligence Core');
  const [bootstrapProgress, setBootstrapProgress] = useState<number>(0);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [canContinueOffline] = useState<boolean>(true);

  const runBootstrap = useCallback(async () => {
    setBootState('BOOTING');
    setStatusMessage('INITIALIZING INTELLIGENCE PLATFORM');

    const hasSeenSplash = sessionStorage.getItem('nexora_boot_splash_shown') === 'true';
    const splashDuration = hasSeenSplash ? 800 : 1300; // Fast ~1.3s professional brand transition
    const startTime = Date.now();

    // Check backend health concurrently in the background without blocking the splash
    const healthCheckPromise = api.getHealth()
      .then(() => {
        setIsBackendOnline(true);
      })
      .catch((err) => {
        console.warn('[Bootstrap] Backend unreachable, running in resilient mode:', err);
        setIsBackendOnline(false);
      });

    // Clean timer to conclude splash sequence smoothly
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, splashDuration - elapsed);

    await new Promise(r => setTimeout(r, remaining));
    await Promise.race([
      healthCheckPromise,
      new Promise(r => setTimeout(r, 200)), // Don't hold splash if health check takes long
    ]);

    sessionStorage.setItem('nexora_boot_splash_shown', 'true');
    setBootState('READY');
  }, []);

  useEffect(() => {
    runBootstrap();
  }, [runBootstrap]);

  const continueOffline = useCallback(() => {
    sessionStorage.setItem('nexora_boot_splash_shown', 'true');
    setBootState('READY');
  }, []);

  return (
    <AppBootstrapContext.Provider
      value={{
        bootState,
        statusMessage,
        bootstrapProgress,
        isBackendOnline,
        canContinueOffline,
        retryBootstrap: runBootstrap,
        continueOffline,
      }}
    >
      {children}
    </AppBootstrapContext.Provider>
  );
};

export const useAppBootstrap = () => {
  const ctx = useContext(AppBootstrapContext);
  if (!ctx) {
    throw new Error('useAppBootstrap must be used within an AppBootstrapProvider');
  }
  return ctx;
};
