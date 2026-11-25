import { useEffect } from 'react';
import { ownsActiveOrder, type Work } from './model';

export const orderOpenedEvent = 'hdwork2:order-opened';
const openedInMemory = new Set<string>();
const keyFor = (owner: number, order: Work) => `${orderOpenedEvent}:${owner}:${order.id}`;
// The assignment start resets on takeover/reopen. Escalation and chat leave it intact.
const assignment = (order: Work) => order.startedAt ?? order.receivedAt;

export function isUnopenedOrder(order: Work, owner?: number) {
  if (owner == null || !ownsActiveOrder(order, owner)) return false;
  const key = keyFor(owner, order), stamp = assignment(order);
  if (openedInMemory.has(key + ':' + stamp)) return false;
  try { return localStorage.getItem(key) !== stamp; }
  catch { return true; }
}

export function useMarkOrderOpened(order: Work | undefined, owner: number | undefined, verified: boolean) {
  useEffect(() => {
    if (!verified || !order || owner == null || !isUnopenedOrder(order, owner)) return;
    const key = keyFor(owner, order), stamp = assignment(order);
    try { localStorage.setItem(key, stamp); }
    catch { openedInMemory.add(key + ':' + stamp); }
    window.dispatchEvent(new Event(orderOpenedEvent));
  }, [order, owner, verified]);
}
