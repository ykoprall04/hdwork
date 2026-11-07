import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInFlightRequests } from '../src/lib/in-flight.ts';
import { reconcileTial } from '../src/features/tial/reconcile.ts';
import type { StagingResult } from '../src/features/b2c-staging/api.ts';
test('pending requests coalesce, caller abort does not cancel other subscriber, no fulfilled cache', async () => {
  const request = createInFlightRequests(); let calls = 0;
  let resolve: (value: string) => void = () => {};
  const run = async () => { calls++; return new Promise<string>(done => { resolve = done; }); };
  const controller = new AbortController();
  const a = request('same-token', run, controller.signal); const rejected = assert.rejects(a, { name: 'AbortError' });
  const b = request('same-token', run); await Promise.resolve(); controller.abort(); resolve('ok');
  await rejected; assert.equal(await b, 'ok'); assert.equal(calls, 1);
  assert.equal(await request('same-token', async () => { calls++; return 'fresh'; }), 'fresh'); assert.equal(calls, 2);
});
test('tokens do not share requests and an abandoned request is cancelled', async () => {
  const request = createInFlightRequests(); let calls = 0;
  const run = async () => { calls++; return 'ok'; };
  await Promise.all([request('token-A', run), request('token-B', run)]); assert.equal(calls, 2);
  const controller = new AbortController(); let aborted = false;
  const pending = request('abandon', signal => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); })), controller.signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' }); await Promise.resolve(); controller.abort(); await rejected;
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(aborted, true);
});
const result: StagingResult = { source: 'MYSQL_STAGING', readOnly: true, page: 1, hasMore: false, data: [1, 2].map(id => ({ id: String(id), module: 'TIAL', date: '2026-11-07', status: 'source', sto: null, scIn: 'SAME', inet: null, reference_verified: false, reference_syntax_valid: true, reference_complete: true })) };
test('unchanged rows retain identity; one changed row does not rerender its unchanged neighbor', () => {
  const same = reconcileTial(result, structuredClone(result)); assert.equal(same, result);
  const changed = structuredClone(result); changed.data[1].status = 'changed';
  const merged = reconcileTial(result, changed); assert.equal(merged.data[0], result.data[0]); assert.notEqual(merged.data[1], result.data[1]);
  assert.equal(merged.data.length, 2); // no deduplication by SC/IN
});
test('row order, pagination and metadata changes are preserved exactly', () => {
  const changed = structuredClone(result); changed.data.reverse(); changed.page = 2; changed.hasMore = true;
  const merged = reconcileTial(result, changed); assert.deepEqual(merged, changed); assert.equal(merged.data[0], result.data[1]);
});
