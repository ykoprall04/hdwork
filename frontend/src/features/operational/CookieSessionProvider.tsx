import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type User } from '@/contexts/auth-context';
import { SessionState } from './session-state';
import { cookieFetch, setCsrf } from './cookie-http';
import { createCookieSession, type SessionSnapshot } from './cookie-session';
import { clearDrafts } from '../workflow/drafts';
import { API_URL } from '@/config/api';
export default function CookieSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionSnapshot>({ status: 'loading', user: null, error: '' });
  const session = useMemo(() => createCookieSession({ base: API_URL, request: cookieFetch, csrf: setCsrf, change: setState, clear: clearDrafts }), []);
  useEffect(() => {
    try { localStorage.removeItem('hdwork:operational:auth:v1'); } catch { /* obsolete local token */ }
    session.start(); return () => session.dispose();
  }, [session]);
  const login = useCallback((_token: string, user: User) => {
    try { sessionStorage.removeItem(`hdwork:operational:checkin:${user.id}`); } catch { /* local preference */ }
    // Rendering requires /me verification, not the login response profile.
    void session.refresh();
  }, [session]);
  const logout = useCallback(() => session.logout(), [session]);
  const auth = useMemo(() => ({ user: state.user, token: state.user ? 'cookie-session' : null, login, logout }), [state.user, login, logout]);
  const retry = useCallback(() => { void session.refresh(); }, [session]);
  return <AuthContext.Provider value={auth}><SessionState.Provider value={{ status: state.status, error: state.error, retry }}>{children}</SessionState.Provider></AuthContext.Provider>;
}
