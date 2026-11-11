export type ActionPayload = { requestId: string; version: number; action: string; note?: string; confirm?: boolean };
const prefix = 'hdwork2:pending-action:';
export function readPendingAction(account: string, id: string): ActionPayload | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + account + ':' + id) || 'null');
    if (!value || !/^[a-f0-9-]{36}$/i.test(value.requestId) || !Number.isSafeInteger(value.version) || value.version < 0 ||
      !['PICK', 'TAKEOVER', 'DONE', 'FAILED', 'ESCALATE', 'REOPEN', 'CONTINUE_DUPLICATE', 'REJECT_DUPLICATE'].includes(value.action) ||
      (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 2000)) ||
      (value.confirm !== undefined && typeof value.confirm !== 'boolean')) return null;
    return { requestId: value.requestId, version: value.version, action: value.action, ...(value.note !== undefined ? { note: value.note } : {}), ...(value.confirm !== undefined ? { confirm: value.confirm } : {}) };
  } catch { return null; }
}
export function savePendingAction(account: string, id: string, value: ActionPayload | null) {
  try { if (value) sessionStorage.setItem(prefix + account + ':' + id, JSON.stringify(value)); else sessionStorage.removeItem(prefix + account + ':' + id); } catch { /* in-memory state still prevents double-clicks */ }
}
export function clearPendingActions() {
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith(prefix)) sessionStorage.removeItem(key); } } catch { /* unavailable storage */ }
}
