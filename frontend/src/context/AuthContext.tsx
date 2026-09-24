import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api, apiClient, TOKEN_KEY, USER_KEY } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  registerAndLogin: (userData: { name: string; email: string; password: string; role?: string; state?: string; phone?: string; mobile_number?: string; sms_alerts_enabled?: boolean }) => Promise<User>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize user and token from localStorage to preserve session across reloads immediately
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }
    return savedToken;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    const hasUser = !!localStorage.getItem(USER_KEY);
    // Only block initial render if we have a token but haven't cached user yet
    return hasToken && !hasUser;
  });

  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;

      try {
        const userData = await api.getMe();
        if (isMounted) {
          setUser(userData);
          localStorage.setItem(USER_KEY, JSON.stringify(userData));
        }
      } catch (err: any) {
        const status = err?.response?.status;
        console.warn('[NEXORA AUTH] Session check status:', status);

        // ONLY clear credentials on genuine authentication failure (401 Unauthorized or 403 Forbidden)
        if (status === 401 || status === 403) {
          console.warn('[NEXORA AUTH] Token rejected by server. Clearing credentials.');
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          delete apiClient.defaults.headers.common['Authorization'];
          if (isMounted) {
            setToken(null);
            setUser(null);
          }
        } else {
          // If server is cold-starting, network error, 502, 503, 504, or timeout:
          // DO NOT delete the stored token or user! Keep session alive.
          console.log('[NEXORA AUTH] Server sleeping or network delayed. Retaining cached authenticated session.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    validateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await api.login({ email: cleanEmail, password });
      localStorage.setItem(TOKEN_KEY, res.access_token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`;
      setToken(res.access_token);

      let meUser: User = res.user;
      try {
        const fetched = await api.getMe();
        if (fetched) meUser = fetched;
      } catch (meErr) {
        console.warn('[NEXORA AUTH] getMe fallback to res.user:', meErr);
      }

      localStorage.setItem(USER_KEY, JSON.stringify(meUser));
      setUser(meUser);
      return meUser;
    } finally {
      setIsLoading(false);
    }
  };

  const registerAndLogin = async (userData: { name: string; email: string; password: string; role?: string; state?: string; phone?: string; mobile_number?: string; sms_alerts_enabled?: boolean }): Promise<User> => {
    setIsLoading(true);
    const cleanUserData = {
      ...userData,
      email: userData.email.trim().toLowerCase(),
    };
    try {
      await api.register(cleanUserData);
      // Auto-login upon successful registration
      const res = await api.login({ email: cleanUserData.email, password: cleanUserData.password });
      localStorage.setItem(TOKEN_KEY, res.access_token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`;
      setToken(res.access_token);

      let meUser: User = res.user;
      try {
        const fetched = await api.getMe();
        if (fetched) meUser = fetched;
      } catch (meErr) {
        console.warn('[NEXORA AUTH] getMe fallback to res.user:', meErr);
      }

      localStorage.setItem(USER_KEY, JSON.stringify(meUser));
      setUser(meUser);
      return meUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete apiClient.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, isLoading, login, registerAndLogin, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
