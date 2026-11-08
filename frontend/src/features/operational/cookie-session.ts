import type { User } from '../../contexts/auth-context.ts';
export type SessionSnapshot = { status: 'loading' | 'anonymous' | 'authenticated' | 'error'; user: User | null; error: string };
type Clock = { schedule: (fn: () => void, ms: number) => unknown; cancel: (id: unknown) => void };
type Options = { base: string; request: typeof fetch; csrf: (value: string) => void; change: (state: SessionSnapshot) => void; clear: () => void; clock?: Clock };
export function createCookieSession({ base, request, csrf, change, clear, clock = { schedule: (fn, ms) => setTimeout(fn, ms), cancel: id => clearTimeout(id as ReturnType<typeof setTimeout>) } }: Options) {
  let generation = 0, disposed = true, controller: AbortController | null = null, timer: unknown = null;
  function invalidate() { generation++; controller?.abort(); controller = null; if (timer !== null) clock.cancel(timer); timer = null; return generation; }
  const current = (id: number) => !disposed && generation === id;
  function anonymous() { csrf(''); clear(); change({ status: 'anonymous', user: null, error: '' }); }
  async function verify(loading: boolean) {
    if (disposed) return;
    const id = invalidate(), c = new AbortController(); controller = c;
    if (loading) change({ status: 'loading', user: null, error: '' });
    let poll = false;
    try {
      const response = await request(`${base}/auth/me`, { signal: c.signal });
      if (!current(id)) return;
      if (response.status === 401 || response.status === 403) { anonymous(); return; }
      if (!response.ok) throw Error('Sesi belum dapat diverifikasi.');
      const result = await response.json();
      if (!current(id)) return;
      if (!result.success || !result.data || !Array.isArray(result.data.modules) || !['SUPER_ADMIN', 'ADMIN', 'HD', 'SHOW_ONLY'].includes(result.data.role) || typeof result.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(result.csrf)) throw Error('Respons sesi tidak valid.');
      csrf(result.csrf); change({ status: 'authenticated', user: result.data, error: '' }); poll = true;
    } catch (cause) {
      if (!current(id)) return;
      csrf(''); change({ status: 'error', user: null, error: cause instanceof Error ? cause.message : 'Verifikasi gagal' }); poll = true;
    } finally {
      if (current(id)) { controller = null; if (poll) timer = clock.schedule(() => { timer = null; void verify(false); }, 60000); }
    }
  }
  return {
    start() { disposed = false; void verify(true); },
    refresh() { return verify(true); },
    async logout() {
      if (disposed) return false;
      const id = invalidate(), c = new AbortController(); controller = c;
      // Invalidate /me first; retain CSRF until the logout request is sent.
      change({ status: 'loading', user: null, error: '' });
      try {
        const response = await request(`${base}/auth/logout`, { method: 'POST', signal: c.signal });
        if (!current(id)) return false;
        if (!response.ok && response.status !== 401) throw Error('Logout belum berhasil.');
        anonymous(); return true;
      } catch {
        if (current(id)) { csrf(''); change({ status: 'error', user: null, error: 'Logout belum berhasil. Coba verifikasi kembali sebelum meninggalkan perangkat.' }); }
        return false;
      } finally { if (current(id)) controller = null; }
    },
    dispose() { disposed = true; invalidate(); },
  };
}
