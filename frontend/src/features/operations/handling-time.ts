export const DEFAULT_LONG_ORDER_MINUTES = 60;
export function handlingMs(
  order: {
    startedAt: string | null;
    finishedAt: string | null;
    handlingDurationMs?: number;
  },
  now = Date.now(),
) {
  if (order.finishedAt && order.handlingDurationMs !== undefined)
    return Math.max(0, order.handlingDurationMs);
  if (!order.startedAt) return 0;
  const result =
    (order.finishedAt ? Date.parse(order.finishedAt) : now) -
    Date.parse(order.startedAt);
  return Number.isFinite(result) ? Math.max(0, result) : 0;
}
export function formatHandling(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return minutes < 60
    ? `${minutes} menit`
    : `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`;
}
