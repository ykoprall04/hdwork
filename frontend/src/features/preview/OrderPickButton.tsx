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
export default function OrderPickButton({ orderId }: { orderId: string }) {
  const { state, dispatch } = usePreview();
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
  if (order.status === "PROSES CEK" && order.handlerAlias === user.id)
    return (
      <Link
        to={`/preview/my-work/${orderId}`}
        className="shrink-0 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
      >
        Buka
      </Link>
    );
  const takeover = order.status === "PROSES CEK";
  const oldName =
    state.users.find((u) => u.id === snapshot?.owner)?.name ?? snapshot?.owner;
  return (
    <>
      <Button
        size="sm"
        variant={takeover ? "outline" : "default"}
        className="h-7 shrink-0 px-2.5 text-[11px]"
        onClick={() =>
          setSnapshot({ owner: order.handlerAlias, status: order.status })
        }
      >
        {takeover ? "Ambil Alih" : "PICK"}
      </Button>
      <Dialog
        open={!!snapshot}
        onOpenChange={(open) => {
          if (!open) setSnapshot(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {snapshot?.status === "PROSES CEK"
              ? "Konfirmasi Ambil Alih"
              : "Konfirmasi PICK"}
          </DialogTitle>
          <DialogDescription className="mt-3 leading-6">
            {orderId}.{" "}
            {snapshot?.status === "PROSES CEK"
              ? `Kepemilikan langsung berpindah dari ${oldName} ke ${user.name} tanpa persetujuan. Pemilik lama tetap tercatat dalam riwayat.`
              : `Tetapkan ${user.name} sebagai pemilik dan mulai PROSES CEK?`}{" "}
            Bot akan mensimulasikan reply “🟡 Data di cek {user.name}”. Tidak
            ada pesan Telegram sungguhan.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshot(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (snapshot)
                  dispatch({
                    type: "claim",
                    id: orderId,
                    expectedOwner: snapshot.owner,
                    expectedStatus: snapshot.status,
                  });
                setSnapshot(null);
              }}
            >
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
