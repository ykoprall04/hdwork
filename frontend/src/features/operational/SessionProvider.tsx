import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type User } from '@/contexts/auth-context';
import { API_URL } from '@/config/api';
import { AUTH_KEY, validateSession } from './session';
import CookieSessionProvider from './CookieSessionProvider';
import {cookieMode} from './cookie-http';
import { SessionState } from './session-state';
export default function SessionProvider({children}:{children:ReactNode}){return cookieMode ? <CookieSessionProvider>{children}</CookieSessionProvider> : <BearerSessionProvider>{children}</BearerSessionProvider>;}
function BearerSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(AUTH_KEY); } catch { return null; } });
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState(token ? 'loading' : 'anonymous');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const logout = useCallback(() => {
    try { localStorage.removeItem(AUTH_KEY); } catch { /* memory-only session */ }
    setToken(null); setUser(null); setStatus('anonymous'); setError('');
  }, []);
  const login = useCallback(function login(next: string, newUser: User) {
    try { sessionStorage.removeItem(`hdwork:operational:checkin:${newUser.id}`); } catch { /* local preference */ }
    try { localStorage.setItem(AUTH_KEY, next); } catch { /* memory-only session */ }
    setUser(null); setStatus('loading'); setError(''); setToken(next); setRevision(n => n + 1);
  }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function verify() {
      try {
        const profile = await validateSession(token!, API_URL, fetch, controller.signal);
        if (!controller.signal.aborted) { setUser(previous => previous && ['id', 'name', 'username', 'role', 'city_id'].every(key => previous[key as keyof User] === profile[key as keyof typeof profile]) ? previous : profile); setStatus('authenticated'); setError(''); }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setUser(null);
        if ((cause as { status?: number }).status === 401 || (cause as { status?: number }).status === 403) logout();
        else { setStatus('error'); setError(cause instanceof Error ? cause.message : 'Verifikasi sesi gagal'); }
      } finally { if (!controller.signal.aborted) timer = setTimeout(() => { void verify(); }, 60_000); }
    }
    void verify();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, revision, logout]);
  const retry = useCallback(() => { setStatus('loading'); setRevision(n => n + 1); }, []);
  const authValue = useMemo(() => ({ token, user, login, logout }), [token, user, login, logout]);
  const sessionValue = useMemo(() => ({ status, error, retry }), [status, error, retry]);
  return <AuthContext.Provider value={authValue}><SessionState.Provider value={sessionValue}>{children}</SessionState.Provider></AuthContext.Provider>;
}
