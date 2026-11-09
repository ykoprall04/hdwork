import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { canOpenWorkspace, accessibleWorkspaces, workspaceModules } from '../src/features/workflow/workspace-access.ts';
const require = createRequire(import.meta.url);
const backend = require('../../src/operations/modules.js');
test('four workspace module mappings exactly match backend scopes', () => {
  assert.deepEqual(Object.keys(workspaceModules), ['B2C', 'ASSUREN', 'B2B', 'REPLACEMENT']);
  for (const [workspace, modules] of Object.entries(workspaceModules)) assert.deepEqual(modules, backend.areas[workspace]);
  assert.deepEqual(accessibleWorkspaces(backend.modules), Object.keys(workspaceModules));
});
test('workspace scope helper reports assigned modules and rejects unknown workspaces', () => {
  assert.deepEqual(accessibleWorkspaces(['B2B']), ['B2B']);
  assert.deepEqual(accessibleWorkspaces(['REQ', 'ASSUREN']), ['B2C', 'ASSUREN']);
  assert.deepEqual(accessibleWorkspaces([]), []);
  assert.equal(canOpenWorkspace('REPLACEMENT', ['B2B']), false);
  assert.equal(canOpenWorkspace('unknown', backend.modules), false);
  assert.equal(canOpenWorkspace('__proto__', backend.modules), false);
});
