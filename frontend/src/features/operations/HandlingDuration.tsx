import { useEffect, useState } from "react";
import {
  DEFAULT_LONG_ORDER_MINUTES,
  handlingMs,
  formatHandling,
} from "./handling-time";
export default function HandlingDuration({
  order,
}: {
  order: {
    startedAt: string | null;
    finishedAt: string | null;
    handlingDurationMs?: number;
  };
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!order.startedAt || order.finishedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [order.startedAt, order.finishedAt]);
  if (!order.startedAt) return <span>—</span>;
  const minutes =
    Number(import.meta.env.VITE_LONG_ORDER_MINUTES) ||
    DEFAULT_LONG_ORDER_MINUTES;
  const elapsed = handlingMs(order, now);
  const long = !order.finishedAt && elapsed >= Math.max(1, minutes) * 60000;
  return (
    <span
      className={`tabular-nums ${long ? "font-medium text-amber-700 [.dark_&]:text-amber-300" : ""}`}
      title={
        long
          ? `Lebih dari ${Math.max(1, minutes)} menit (ambang demo, bukan SLA).`
          : undefined
      }
    >
      {formatHandling(elapsed)}
      {long && " · lama"}
    </span>
  );
}
