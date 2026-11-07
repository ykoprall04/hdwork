import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jakartaToday, tialQuery, tialTabs } from '../src/features/tial/query.ts';
test('import-day default uses Jakarta boundary, not UTC or an invented order time', () => {
  assert.equal(jakartaToday(new Date('2026-11-07T16:59:59Z')), '2026-11-07');
  assert.equal(jakartaToday(new Date('2026-11-07T17:00:00Z')), '2026-11-08');
});
test('source filters are passed directly; unknown status is never mapped to Preview statuses', () => {
  const query = tialQuery({ date: '2026-11-07', status: ' SOURCE_CUSTOM ', sto: ' DEMO ', q: ' SC/DEMO ' }, 2, true);
  assert.deepEqual(query, { module: 'TIAL', date: '2026-11-07', status: 'SOURCE_CUSTOM', sto: 'DEMO', q: 'SC/DEMO', page: 2 });
});
test('unknown STO mapping cannot silently turn into a real STO filter', () => {
  assert.equal(tialQuery({ date: '', status: '', sto: 'unconfirmed', q: '' }, 1, false).sto, '');
  assert.deepEqual([...tialTabs], ['MENUNGGU', 'PROSES CEK', 'SELESAI', 'DUPLICATE']);
});
