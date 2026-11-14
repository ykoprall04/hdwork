export function workspaceBackFallback(historyState: unknown): boolean {
  if (!historyState || typeof historyState !== 'object') return true;
  const index = (historyState as { idx?: unknown }).idx;
  return typeof index !== 'number' || !Number.isInteger(index) || index <= 0;
}
