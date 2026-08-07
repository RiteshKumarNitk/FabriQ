'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http, tokenStore } from './api';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  companyId: string | null;
  factoryId: string | null;
  isPlatformAdmin: boolean;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  has: (permission: string) => boolean;
  hasAny: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh();
    try {
      if (refresh) await http.post('/auth/logout', { refreshToken: refresh });
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
    window.location.href = '/login';
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await http.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      '/auth/login',
      { email, password },
    );
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    window.location.href = '/dashboard';
  }, []);

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      setLoading(false);
      return;
    }
    http
      .get<SessionUser>('/auth/me')
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
      })
      .finally(() => setLoading(false));
  }, []);

  const hasPermission = useCallback(
    (permission: string) => user?.isPlatformAdmin === true || user?.permissions.includes(permission) === true,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      has: hasPermission,
      hasAny: (permissions) => permissions.some((p) => hasPermission(p)),
    }),
    [user, loading, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
