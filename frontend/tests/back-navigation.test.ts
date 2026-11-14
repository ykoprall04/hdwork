import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showOperationalBackButton, workspaceBackFallback } from '../src/features/operational/back-navigation.ts';

test('direct entry or missing router history falls back to Workspace home', () => {
  assert.equal(workspaceBackFallback(null), true);
  assert.equal(workspaceBackFallback({}), true);
  assert.equal(workspaceBackFallback({ idx: 0 }), true);
});

test('an existing in-app history entry enables browser-router back navigation', () => {
  assert.equal(workspaceBackFallback({ idx: 1 }), false);
  assert.equal(workspaceBackFallback({ idx: 4 }), false);
});

test('invalid history indexes safely fall back to Workspace home', () => {
  assert.equal(workspaceBackFallback({ idx: -1 }), true);
  assert.equal(workspaceBackFallback({ idx: '2' }), true);
});

test('shared operational layout shows back on workspace, dashboard, orders, chat, and settings', () => {
  for (const path of ['/jobs', '/work/B2C', '/work/B2C/TIAL', '/orders/42', '/chat', '/admin/system', '/check-in']) {
    assert.equal(showOperationalBackButton(path), true, path);
  }
});

test('login does not show the global back button', () => {
  assert.equal(showOperationalBackButton('/login'), false);
  assert.equal(showOperationalBackButton('/login/reset'), false);
});
