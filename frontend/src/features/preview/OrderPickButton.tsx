import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePreview } from "./context";
import { canClaim, workStatus } from "./work-status";
export default function OrderPickButton({
  orderId,
  quick = false,
}: {
  orderId: string;
  quick?: boolean;
}) {
  const { state, claimOrder } = usePreview();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    owner: string | null;
    status: string;
  } | null>(null);
  const order = state.orders.find((o) => o.monitoringId === orderId);
  const user = state.users.find((u) => u.id === state.sessionId);
  if (
    !order ||
    user?.role !== "HD" ||
    !user.active ||
    user.approval !== "APPROVED" ||
    !["MENUNGGU", "PROSES CEK"].includes(order.status)
  )
    return null;
  if (order.handlerAlias === user.id)
    return (
      <Link
        to={`/preview/my-work/${orderId}`}
        className="shrink-0 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary"
      >
        Buka
      </Link>
    );
  const takeover = order.status === "PROSES CEK";
  const allowed = canClaim(state);
  async function claim(owner: string | null, status: string) {
    setBusy(true);
    try {
      await claimOrder({
        id: orderId,
        expectedOwner: owner,
        expectedStatus: status,
        mode: status === "PROSES CEK" ? "takeover" : "pick",
      });
    } finally {
      setBusy(false);
      setSnapshot(null);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant={takeover ? "outline" : "default"}
        disabled={busy || !allowed}
        title={
          !allowed
            ? `Status ${workStatus(state)}: ubah ke ONLINE untuk mengambil pekerjaan baru.`
            : undefined
        }
        className="h-7 shrink-0 px-2.5 text-[11px]"
        onClick={() => {
          if (quick && !takeover) void claim(order.handlerAlias, order.status);
          else setSnapshot({ owner: order.handlerAlias, status: order.status });
        }}
      >
        {busy ? "Memproses…" : takeover ? "Ambil Alih" : "PICK"}
      </Button>
      <Dialog
        open={!!snapshot}
        onOpenChange={(open) => {
          if (!open && !busy) setSnapshot(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {takeover ? "Konfirmasi Ambil Alih" : "Konfirmasi PICK"}
          </DialogTitle>
          <DialogDescription className="mt-3 leading-6">
            {orderId}.{" "}
            {takeover
              ? `Kepemilikan berpindah dari ${state.users.find((u) => u.id === snapshot?.owner)?.name ?? snapshot?.owner} ke ${user.name}. Riwayat pemilik lama tetap tersimpan.`
              : `Tetapkan ${user.name} sebagai pemilik PROSES CEK?`}{" "}
            Status ONLINE diperlukan. Reply bot hanya simulasi.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setSnapshot(null)}
            >
              Batal
            </Button>
            <Button
              disabled={busy || !allowed}
              onClick={() => {
                if (snapshot) void claim(snapshot.owner, snapshot.status);
              }}
            >
              {busy ? "Memproses…" : "Konfirmasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
