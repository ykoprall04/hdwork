import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleWorkspaces, canOpenWorkspace } from '../src/features/workflow/workspace-access.ts';
import { readPendingAction, savePendingAction } from '../src/features/workflow/pending-action.ts';
import { clearDrafts } from '../src/features/workflow/drafts.ts';

test('ordinary roles see only B2C even with old grants to other workspaces', () => {
  for (const role of ['HD', 'ADMIN', 'SHOW_ONLY']) {
    assert.deepEqual(visibleWorkspaces({ role, modules: ['TIAL', 'B2B', 'ASSUREN', 'REPLACEMENT'] }), ['B2C']);
    assert.deepEqual(visibleWorkspaces({ role, modules: ['B2B'] }), []);
  }
});
test('Super Admin sees every category without granting access to unassigned data', () => {
  assert.deepEqual(visibleWorkspaces({ role: 'SUPER_ADMIN', modules: [] }), ['B2C', 'ASSUREN', 'B2B', 'REPLACEMENT']);
  assert.equal(canOpenWorkspace('B2B', []), false);
});
test('unknown action request survives remount with exact identity and payload, isolated by account/order; logout clears it', () => {
  const data = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } });
  try {
    const body = { requestId: '12345678-1234-4123-8123-123456789abc', version: 9, action: 'ESCALATE', note: 'Synthetic reason' };
    savePendingAction('7', 'first', body);
    assert.deepEqual(readPendingAction('7', 'first'), body);
    assert.equal(readPendingAction('7', 'second'), null);
    assert.equal(readPendingAction('8', 'first'), null);
    savePendingAction('7', 'second', { ...body, action: 'DONE', confirm: true });
    clearDrafts();
    assert.equal(readPendingAction('7', 'first'), null);
    assert.equal(readPendingAction('7', 'second'), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
