import { usePreview } from "./context";
import { formatTimestamp } from "../operations/demo-data";
export default function OrderEscalationBadge({ orderId }: { orderId: string }) {
  const { state } = usePreview();
  const order = state.orders.find((o) => o.monitoringId === orderId);
  const escalations =
    order?.escalations.filter((e) => e.session === order.session) ?? [];
  const latest = escalations.at(-1);
  if (!latest) return null;
  return (
    <span
      title={`${latest.target}: ${latest.description} · ${latest.name} · ${formatTimestamp(latest.at)}`}
      className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-primary"
    >
      Dieskalasi · {escalations.length}×
    </span>
  );
}
