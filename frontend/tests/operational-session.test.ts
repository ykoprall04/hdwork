import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_KEY, validateSession } from '../src/features/operational/session.ts';
test('operational profile is fetched from me with bearer token and allowlisted separately from demo', async () => {
  const request = (async (url, init) => {
    assert.equal(url, 'https://api.example/api/auth/me');
    const headers = init?.headers as Record<string, string>; assert.ok(headers);
    assert.equal(headers.Authorization, 'Bearer dummy');
    return Response.json({ success: true, data: { id: 1, name: 'Dummy', username: 'dummy', role: 'SUPER_ADMIN', city_id: 1, password_hash: 'private' } });
  }) as typeof fetch;
  const profile = await validateSession('dummy', 'https://api.example/api', request);
  assert.equal(profile.role, 'SUPER_ADMIN'); assert.equal(Object.hasOwn(profile, 'password_hash'), false);
  assert.ok(!AUTH_KEY.startsWith('hdwork:workspace')); assert.ok(!AUTH_KEY.startsWith('hdwork:session'));
});
test('invalid, revoked or unavailable sessions are never accepted from local profile data', async () => {
  for (const status of [401, 403, 429, 503]) await assert.rejects(validateSession('dummy', '/api', (async () => Response.json({}, { status })) as typeof fetch));
  await assert.rejects(validateSession('dummy', '/api', (async () => Response.json({ success: true, data: { id: 1, role: 'SUPER_ADMIN' } })) as typeof fetch));
});
