import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Me } from './api';

type Ctx = { me: Me | null; loading: boolean; setMe: (m: Me | null) => void; refresh: () => Promise<void>; logout: () => Promise<void> };
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setMe(await api<Me>('/auth/me')); }
    catch (e) { if (e instanceof ApiError && e.status === 401) setMe(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => { await api('/auth/logout', { body: {} }).catch(() => {}); setMe(null); };
  return <AuthCtx.Provider value={{ me, loading, setMe, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
