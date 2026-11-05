import type { State, Action } from "./model.ts";
import { canClaim } from "./work-status.ts";
export type ClaimRequest = {
  id: string;
  expectedOwner: string | null;
  expectedStatus: string;
  mode: "pick" | "takeover";
};
// This serializes claims only inside one frontend instance, never across devices.
export function createClaimService(
  getState: () => State,
  apply: (action: Action) => void,
  wait: () => Promise<void> = () => new Promise((r) => setTimeout(r, 120)),
) {
  const pending = new Set<string>();
  return async (request: ClaimRequest) => {
    const requestedBy = getState().sessionId;
    if (pending.has(request.id))
      return { ok: false, message: "PICK sedang diproses untuk order ini." };
    pending.add(request.id);
    try {
      await wait();
      const state = getState();
      if (state.sessionId !== requestedBy)
        return {
          ok: false,
          message: "Akun berubah selama PICK. Ulangi dari akun yang aktif.",
        };
      const order = state.orders.find((o) => o.monitoringId === request.id);
      if (!canClaim(state))
        return {
          ok: false,
          message: "Ubah status kerja menjadi ONLINE untuk PICK/Ambil Alih.",
        };
      if (
        !order ||
        order.handlerAlias !== request.expectedOwner ||
        order.status !== request.expectedStatus
      )
        return {
          ok: false,
          message:
            "Order telah berubah atau diambil petugas lain. Periksa pemilik terbaru.",
        };
      if (
        request.mode === "pick" &&
        (order.handlerAlias || order.status !== "MENUNGGU")
      )
        return { ok: false, message: "Order tidak lagi tersedia untuk PICK." };
      if (
        request.mode === "takeover" &&
        (order.status !== "PROSES CEK" ||
          !order.handlerAlias ||
          order.handlerAlias === state.sessionId)
      )
        return {
          ok: false,
          message: "Ambil Alih tidak tersedia untuk order ini.",
        };
      apply({ type: "claim", ...request });
      const updated = getState().orders.find(
        (o) => o.monitoringId === request.id,
      );
      return updated?.handlerAlias === state.sessionId &&
        updated.status === "PROSES CEK"
        ? {
            ok: true,
            message: `PICK berhasil · ${request.id} masuk Pekerjaan Saya.`,
          }
        : {
            ok: false,
            message: "PICK ditolak. Periksa status dan pemilik order.",
          };
    } finally {
      pending.delete(request.id);
    }
  };
}
