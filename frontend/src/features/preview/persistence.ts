import { initialState, type State, type WorkOrder } from "./model.ts";
import type { Attendance } from "./work-status.ts";
export const WORKSPACE_KEY = "hdwork:workspace:v2";
export const SESSION_KEY = "hdwork:session:v2";
export const accountKey = (id: string) =>
  `hdwork:account:v2:${encodeURIComponent(id)}`;
type StorageLike = Pick<Storage, "getItem" | "setItem">;
function parse(storage: StorageLike, key: string) {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function validState(value: unknown): value is State {
  const v = value as State;
  return (
    !!v &&
    Array.isArray(v.users) &&
    v.users.every(
      (u) => typeof u.id === "string" && typeof u.username === "string",
    ) &&
    Array.isArray(v.orders) &&
    v.orders.every(
      (o) =>
        typeof o.monitoringId === "string" &&
        typeof o.originalMessageId === "string" &&
        Array.isArray(o.messages) &&
        Array.isArray(o.telegramMessages) &&
        Array.isArray(o.participants) &&
        Array.isArray(o.outcomes) &&
        Array.isArray(o.escalations) &&
        Array.isArray(o.events) &&
        Array.isArray(o.history),
    ) &&
    Array.isArray(v.transfers) &&
    Array.isArray(v.templates) &&
    Array.isArray(v.audit)
  );
}
export function loadPreview(storage?: StorageLike): State {
  const seed = initialState();
  if (!storage) return seed;
  const saved = parse(storage, WORKSPACE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return seed;
  const shared = saved.state as State;
  const attendance: Record<string, Attendance> = {};
  let orders: WorkOrder[] = shared.orders.map((o) => ({
    ...o,
    unopenedBy: [],
    readBy: {},
  }));
  for (const user of shared.users) {
    const personal = parse(storage, accountKey(user.id));
    if (!personal || personal.version !== 2) continue;
    if (
      personal.attendance &&
      ["ONLINE", "SIBUK", "OFFLINE"].includes(personal.attendance.status) &&
      typeof personal.attendance.checkedAt === "string"
    )
      attendance[user.id] = personal.attendance;
    orders = orders.map((o) => {
      const read = personal.readBy?.[o.monitoringId];
      return {
        ...o,
        readBy: {
          ...o.readBy,
          ...(Array.isArray(read) &&
          read.every((id: unknown) => typeof id === "string")
            ? { [user.id]: read }
            : {}),
        },
        unopenedBy:
          Array.isArray(personal.unopened) &&
          personal.unopened.includes(o.monitoringId)
            ? [...o.unopenedBy, user.id]
            : o.unopenedBy,
      };
    });
  }
  const session = parse(storage, SESSION_KEY);
  const active = shared.users.find(
    (u) => u.id === session?.userId && u.active && u.approval === "APPROVED",
  );
  return {
    ...shared,
    orders,
    attendance,
    sessionId: active?.id ?? null,
    checkInRequired: !!active && active.role === "HD" && (session?.checkInRequired === true || !attendance[active.id]),
    notice: "",
  };
}
// Shared canonical orders, but attendance and read/new markers live in separate account keys.
// Attachments stay in memory to avoid localStorage quota failures and persisting screenshots.
export function savePreview(storage: StorageLike, state: State): string | null {
  try {
    for (const user of state.users)
      storage.setItem(
        accountKey(user.id),
        JSON.stringify({
          version: 2,
          attendance: state.attendance[user.id] ?? null,
          readBy: Object.fromEntries(
            state.orders.map((o) => [o.monitoringId, o.readBy[user.id] ?? []]),
          ),
          unopened: state.orders
            .filter((o) => o.unopenedBy.includes(user.id))
            .map((o) => o.monitoringId),
        }),
      );
    const orders = state.orders.map((o) => ({
      ...o,
      readBy: {},
      unopenedBy: [],
      messages: o.messages.map((m) => ({
        ...m,
        attachmentCount: m.images.length || m.attachmentCount || 0,
        images: [],
      })),
      telegramMessages: o.telegramMessages.map((m) => ({ ...m, images: [] })),
    }));
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          ...state,
          sessionId: null,
          attendance: {},
          checkInRequired: false,
          notice: "",
          orders,
        },
      }),
    );
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: state.sessionId,
        checkInRequired: state.checkInRequired,
      }),
    );
    return null;
  } catch {
    return "Penyimpanan demo tidak tersedia/penuh. Perubahan sesi ini tetap aktif tetapi belum dijamin tersimpan saat refresh.";
  }
}
