import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePreview } from "./context";
import { field } from "./PreviewAuth";
import { formatTimestamp } from "../operations/demo-data";
export default function OrderOutcomeActions({ orderId }: { orderId: string }) {
  const { state, dispatch } = usePreview();
  const order = state.orders.find((o) => o.monitoringId === orderId);
  const [kind, setKind] = useState<"DONE" | "GAGAL" | "ESKALASI" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  if (!order) return null;
  const canAct =
    order.status === "PROSES CEK" && order.handlerAlias === state.sessionId;
  const escalation = order.escalations
    .filter((e) => e.session === order.session)
    .at(-1);
  const valid =
    kind === "DONE" ||
    (kind === "GAGAL" ? !!reason.trim() : !!reason.trim() && !!target.trim());
  function close() {
    setKind(null);
    setConfirmed(false);
    setReason("");
    setTarget("");
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["DONE", "GAGAL", "ESKALASI"] as const).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={value === "DONE" ? "default" : "outline"}
          className="h-8 px-2.5 text-[11px]"
          disabled={!canAct}
          onClick={() => {
            setKind(value);
            setConfirmed(value === "DONE");
            setReason("");
            setTarget("");
          }}
        >
          {value}
        </Button>
      ))}
      {escalation && (
        <span
          title={`${escalation.target}: ${escalation.description} · ${escalation.name} · ${formatTimestamp(escalation.at)}`}
          className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-primary"
        >
          Dieskalasi ·{" "}
          {order.escalations.filter((e) => e.session === order.session).length}×
        </span>
      )}
      <Dialog
        open={!!kind}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>
            {confirmed
              ? `Konfirmasi ${kind}`
              : kind === "GAGAL"
                ? "Alasan kegagalan"
                : "Form eskalasi"}
          </DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            {orderId} ·{" "}
            {confirmed
              ? kind === "ESKALASI"
                ? "Catat eskalasi? Status tetap PROSES CEK dan kepemilikan tidak berpindah."
                : "Simpan penyelesaian dan pindahkan ke Riwayat? Percakapan tetap tersimpan."
              : "Isi informasi wajib sebelum mengonfirmasi. Seluruh tindakan hanya simulasi frontend."}
          </DialogDescription>
          {!confirmed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) setConfirmed(true);
              }}
              className="mt-4 space-y-4"
            >
              {kind === "ESKALASI" && (
                <label className="block text-xs font-medium">
                  Tujuan eskalasi
                  <input
                    aria-label="Tujuan eskalasi"
                    className={field}
                    required
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Tim / tujuan eskalasi"
                  />
                </label>
              )}
              <label className="block text-xs font-medium">
                {kind === "GAGAL" ? "Alasan kegagalan" : "Keterangan eskalasi"}
                <textarea
                  aria-label={
                    kind === "GAGAL"
                      ? "Alasan kegagalan"
                      : "Keterangan eskalasi"
                  }
                  className={`${field} min-h-24`}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Batal
                </Button>
                <Button type="submit" disabled={!valid}>
                  Lanjutkan
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              {kind !== "DONE" && (
                <div className="mt-4 whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-sm">
                  {kind === "ESKALASI" && (
                    <p className="mb-2 font-medium">Tujuan: {target.trim()}</p>
                  )}
                  {reason.trim()}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Batal
                </Button>
                {kind !== "DONE" && (
                  <Button variant="outline" onClick={() => setConfirmed(false)}>
                    Ubah
                  </Button>
                )}
                <Button
                  disabled={!valid || !canAct}
                  onClick={() => {
                    if (kind === "ESKALASI")
                      dispatch({
                        type: "escalate",
                        id: orderId,
                        target,
                        description: reason,
                      });
                    else if (kind)
                      dispatch({
                        type: "finish",
                        id: orderId,
                        status: kind,
                        reason,
                      });
                    close();
                  }}
                >
                  Konfirmasi {kind}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
