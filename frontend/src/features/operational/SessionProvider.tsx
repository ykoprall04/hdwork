import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext, type User } from '@/contexts/auth-context';
import { API_URL } from '@/config/api';
import { AUTH_KEY, validateSession } from './session';
import { SessionState } from './session-state';
export default function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(AUTH_KEY); } catch { return null; } });
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState(token ? 'loading' : 'anonymous');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  function logout() {
    try { localStorage.removeItem(AUTH_KEY); } catch { /* memory-only session */ }
    setToken(null); setUser(null); setStatus('anonymous'); setError('');
  }
  function login(next: string, newUser: User) {
    try { sessionStorage.removeItem(`hdwork:operational:checkin:${newUser.id}`); } catch { /* local preference */ }
    try { localStorage.setItem(AUTH_KEY, next); } catch { /* memory-only session */ }
    setUser(null); setStatus('loading'); setError(''); setToken(next); setRevision(n => n + 1);
  }
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function verify() {
      try {
        const profile = await validateSession(token!, API_URL, fetch, controller.signal);
        if (!controller.signal.aborted) { setUser(profile); setStatus('authenticated'); setError(''); }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setUser(null);
        if ((cause as { status?: number }).status === 401 || (cause as { status?: number }).status === 403) logout();
        else { setStatus('error'); setError(cause instanceof Error ? cause.message : 'Verifikasi sesi gagal'); }
      } finally { if (!controller.signal.aborted) timer = setTimeout(() => { void verify(); }, 60_000); }
    }
    void verify();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, revision]);
  return <AuthContext.Provider value={{ token, user, login, logout }}><SessionState.Provider value={{ status, error, retry: () => { setStatus('loading'); setRevision(n => n + 1); } }}>{children}</SessionState.Provider></AuthContext.Provider>;
}
