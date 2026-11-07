import type { StagingOrder, StagingResult } from '../b2c-staging/api';
const fields: (keyof StagingOrder)[] = ['id', 'module', 'date', 'status', 'sto', 'scIn', 'inet', 'reference_verified', 'reference_syntax_valid', 'reference_complete'];
export function reconcileTial(previous: StagingResult | null, next: StagingResult): StagingResult {
  if (!previous) return next;
  const old = new Map(previous.data.map(row => [row.id, row]));
  const data = next.data.map(row => { const before = old.get(row.id); return before && fields.every(field => before[field] === row[field]) ? before : row; });
  const unchanged = data.length === previous.data.length && data.every((row, index) => row === previous.data[index]);
  if (unchanged && previous.page === next.page && previous.hasMore === next.hasMore && previous.stoFilterAvailable === next.stoFilterAvailable && previous.identityScope === next.identityScope && previous.dateBasis === next.dateBasis && previous.source === next.source && previous.readOnly === next.readOnly) return previous;
  return { ...next, data: unchanged ? previous.data : data };
}
