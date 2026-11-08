import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCookieSession, type SessionSnapshot } from '../src/features/operational/cookie-session.ts';
const profile = { id: 1, name: 'Synthetic HD', username: 'synthetic', role: 'HD', modules: ['B2B'], city_id: null };
const ok = () => Response.json({ success: true, data: profile, csrf: 'a'.repeat(64) });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const pending: { resolve: (r: Response) => void; signal?: AbortSignal | null }[] = [], states: SessionSnapshot[] = [], tokens: string[] = [], timers = new Map<number, () => void>();
  let sequence = 0, cleared = 0;
  const request = ((_url, init) => new Promise<Response>(resolve => pending.push({ resolve, signal: init?.signal }))) as typeof fetch;
  // Ignore abort deliberately, reproducing responses that arrive after cancellation.
  const session = createCookieSession({ base: '/api', request, change: s => states.push(s), csrf: v => tokens.push(v), clear: () => { cleared++; }, clock: { schedule: fn => { timers.set(++sequence, fn); return sequence; }, cancel: id => { timers.delete(id as number); } } });
  session.start(); return { session, pending, states, tokens, timers, cleared: () => cleared };
}
test('late /me 401 cannot erase a newly verified login', async () => {
  const f = fixture(), refresh = f.session.refresh(); f.pending[1].resolve(ok()); await refresh;
  f.pending[0].resolve(new Response(null, { status: 401 })); await flush();
  assert.equal(f.states.at(-1)?.status, 'authenticated'); assert.equal(f.cleared(), 0); assert.equal(f.pending[0].signal?.aborted, true); f.session.dispose();
});
test('late /me success after logout cannot restore UI or CSRF', async () => {
  const f = fixture(), logout = f.session.logout(); f.pending[1].resolve(new Response(null, { status: 200 })); assert.equal(await logout, true);
  f.pending[0].resolve(ok()); await flush(); assert.equal(f.states.at(-1)?.status, 'anonymous'); assert.equal(f.tokens.at(-1), ''); assert.equal(f.timers.size, 0); f.session.dispose();
});
test('old logout response cannot erase a later login', async () => {
  const f = fixture(), logout = f.session.logout(), refresh = f.session.refresh(); f.pending[2].resolve(ok()); await refresh;
  f.pending[1].resolve(new Response(null, { status: 200 })); assert.equal(await logout, false); assert.equal(f.states.at(-1)?.status, 'authenticated'); f.pending[0].resolve(ok()); f.session.dispose();
});
test('dashboard remains unauthenticated until /me verification and timers clean up', async () => {
  const f = fixture(); assert.equal(f.states.at(-1)?.user, null); assert.equal(f.states.at(-1)?.status, 'loading');
  f.pending[0].resolve(ok()); await flush(); assert.equal(f.states.at(-1)?.user?.id, 1); assert.equal(f.timers.size, 1); f.session.dispose(); assert.equal(f.timers.size, 0);
});
test('session expiry clears user and CSRF without continued polling', async () => {
  const f = fixture(); f.pending[0].resolve(ok()); await flush(); const refresh = f.session.refresh();
  f.pending[1].resolve(new Response(null, { status: 401 })); await refresh;
  assert.equal(f.states.at(-1)?.status, 'anonymous'); assert.equal(f.states.at(-1)?.user, null); assert.equal(f.tokens.at(-1), ''); assert.equal(f.timers.size, 0); f.session.dispose();
});
test('unmount suppresses late results', async () => {
  const f = fixture(), before = f.states.length; f.session.dispose(); f.pending[0].resolve(ok()); await flush(); assert.equal(f.states.length, before); assert.equal(f.timers.size, 0);
});
test('server errors and malformed CSRF fail closed', async () => {
  for (const response of [new Response(null, { status: 503 }), Response.json({ success: true, data: profile, csrf: 'invalid' })]) {
    const f = fixture(); f.pending[0].resolve(response); await flush(); assert.equal(f.states.at(-1)?.status, 'error'); assert.equal(f.states.at(-1)?.user, null); f.session.dispose();
  }
});
test('logout failure reports failure and allows explicit verification retry', async () => {
  const f = fixture(), logout = f.session.logout(); f.pending[1].resolve(new Response(null, { status: 503 })); assert.equal(await logout, false); assert.equal(f.states.at(-1)?.status, 'error');
  const retry = f.session.refresh(); f.pending[2].resolve(ok()); await retry; assert.equal(f.states.at(-1)?.status, 'authenticated'); f.pending[0].resolve(ok()); f.session.dispose();
});
