import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRefreshLoop } from '../src/features/b2c-staging/refresh-loop.ts';
test('refresh waits for completion then 60s, does not overlap and cancels on unmount', async () => {
  let calls = 0;
  let resolve: () => void = () => {};
  let scheduled: (() => void) | undefined;
  let cleared = false;
  const stop = startRefreshLoop(() => { calls++; return new Promise<void>(done => { resolve = done; }); }, {
    setTimeout: ((callback: () => void, delay: number) => { assert.equal(delay, 60_000); scheduled = callback; return 1; }) as unknown as typeof setTimeout,
    clearTimeout: (() => { cleared = true; }) as typeof clearTimeout,
  });
  assert.equal(calls, 1); assert.equal(scheduled, undefined);
  resolve(); await Promise.resolve(); assert.ok(scheduled);
  scheduled(); assert.equal(calls, 2);
  stop(); resolve(); await Promise.resolve(); assert.equal(cleared, true); assert.equal(calls, 2);
});
