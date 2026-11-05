import {
  seedConversation,
  originalMessageId,
  reconcileChat,
  conversation,
  type ChatEntry,
} from "./chat-model.ts";
import { createDemoOrders, type DemoOrder } from "../operations/demo-data.ts";
export type DemoUser = {
  id: string;
  name: string;
  username: string;
  role: "HD" | "ADMIN" | "SUPER_ADMIN";
  active: boolean;
  disabledKind?: string;
  approval: "PENDING APPROVAL" | "APPROVED" | "REJECTED" | "RESUBMITTED";
  nik: string;
  telegram: string;
  telegramId: string;
};
export type Message = {
  orderId?: string;
  replyToMessageId?: string;
  id: string;
  text: string;
  images: string[];
  by: string;
  at: string;
  publicApproved: boolean;
  revisions: { text: string; at: string }[];
  session: number;
};
export type WorkOrder = DemoOrder & {
  originalMessageId: string;
  telegramMessages: ChatEntry[];
  readBy: Record<string, string[]>;
  participants: string[];
  module: "TIAL" | "LOGIC" | null;
  sto: string;
  messages: Message[];
  events: { text: string; at: string }[];
  session: number;
  credits: { by: string; status: string; session: number; at: string }[];
};
export type Transfer = {
  id: string;
  ids: string[];
  from: string;
  to: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  at: string;
};
export type State = {
  users: DemoUser[];
  sessionId: string | null;
  orders: WorkOrder[];
  transfers: Transfer[];
  templates: { id: string; text: string }[];
  audit: { text: string; at: string }[];
  notice: string;
  version: number;
};
export type Action =
  | { type: "login"; username: string }
  | { type: "logout" }
  | {
      type: "register";
      user: Omit<DemoUser, "id" | "role" | "active" | "approval">;
    }
  | { type: "resubmit"; id: string }
  | { type: "approval"; id: string; approved: boolean }
  | { type: "active"; id: string; active: boolean; kind?: string }
  | { type: "claim"; id: string }
  | { type: "transfer"; ids: string[]; to: string }
  | { type: "decide"; id: string; accept: boolean }
  | { type: "move"; ids: string[]; to: string }
  | { type: "message"; id: string; text: string; images: string[] }
  | { type: "edit"; id: string; messageId: string; text: string }
  | { type: "publish"; id: string; messageId: string }
  | { type: "finish"; id: string; status: "DONE" | "GAGAL" }
  | { type: "reopen"; id: string; reason: string }
  | { type: "template"; text: string }
  | { type: "notify" }
  | { type: "chat-read"; id: string }
  | { type: "telegram-incoming"; id: string; source: "bot" | "telegram" };
export function initialState(): State {
  const users: DemoUser[] = [
    "hd_demo_1",
    "hd_demo_2",
    "hd_demo_3",
    "admin_demo",
    "superadmin_demo",
  ].map((username, i) => ({
    id: username,
    username,
    name: [
      "Alya Demo",
      "Bima Demo",
      "Citra Demo",
      "Admin Demo",
      "Super Admin Demo",
    ][i],
    role: i === 4 ? "SUPER_ADMIN" : i === 3 ? "ADMIN" : "HD",
    active: true,
    approval: "APPROVED",
    nik: `DEMO-EMP-${i + 1}`,
    telegram: `${username}_tg`,
    telegramId: `900000${i + 1}`,
  }));
  users.push({
    id: "applicant_demo",
    name: "Dina Demo",
    username: "dina_demo",
    role: "HD",
    active: true,
    approval: "PENDING APPROVAL",
    nik: "DEMO-EMP-6",
    telegram: "dina_demo_tg",
    telegramId: "9000006",
  });
  const orders = createDemoOrders().map(
    (o, i): WorkOrder => ({
      ...o,
      module:
        o.category === "B2C"
          ? Math.floor(i / 4) % 2
            ? "LOGIC"
            : "TIAL"
          : null,
      sto: ["STO-DEMO-A", "STO-DEMO-B", "STO-DEMO-C"][i % 3],
      originalMessageId: originalMessageId(o.monitoringId),
      telegramMessages: seedConversation(o.monitoringId, o.receivedAt),
      readBy: o.handlerAlias
        ? {
            [o.handlerAlias]: seedConversation(
              o.monitoringId,
              o.receivedAt,
            ).map((m) => m.id),
          }
        : {},
      participants: o.handlerAlias ? [o.handlerAlias] : [],
      messages: [],
      events: [{ text: "Order DEMO diterima", at: o.receivedAt }],
      session: 1,
      credits: o.finishedAt
        ? [
            {
              by: o.handlerAlias!,
              status: o.status,
              session: 1,
              at: o.finishedAt,
            },
          ]
        : [],
    }),
  );
  return {
    users,
    sessionId: null,
    orders,
    transfers: [],
    templates: [
      {
        id: "template-demo",
        text: "Pengecekan sedang dilakukan. Pembaruan akan disampaikan setelah verifikasi.",
      },
    ],
    audit: [],
    notice: "",
    version: 0,
  };
}
export function reducePreview(state: State, action: Action): State {
  const at = new Date().toISOString();
  const id = () => globalThis.crypto.randomUUID();
  const fail = (notice: string) => ({ ...state, notice });
  const user = state.users.find((u) => u.id === state.sessionId);
  const admin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  let next = {
    ...state,
    notice: "Simulasi berhasil.",
    version: state.version + 1,
  };
  let log = "";
  if (action.type === "logout")
    return {
      ...next,
      sessionId: null,
      notice:
        "Logout preview. Kepemilikan order tetap tersimpan selama sesi browser ini.",
    };
  if (action.type === "login") {
    const account = state.users.find((u) => u.username === action.username);
    if (!account || !account.active || account.approval !== "APPROVED")
      return fail(
        "Login ditolak: akun belum disetujui, nonaktif, atau tidak ditemukan.",
      );
    return {
      ...next,
      sessionId: account.id,
      notice: "Login DEMO berhasil. Tidak ada autentikasi ke server.",
    };
  }
  if (action.type === "register") {
    if (
      state.users.some(
        (u) => u.username.toLowerCase() === action.user.username.toLowerCase(),
      )
    )
      return fail("Username sudah digunakan.");
    next.users = [
      ...state.users,
      {
        ...action.user,
        id: id(),
        role: "HD",
        active: true,
        approval: "PENDING APPROVAL",
      },
    ];
    log = `Registrasi ${action.user.username}: PENDING APPROVAL. Telegram belum diverifikasi.`;
  } else if (action.type === "resubmit") {
    next.users = state.users.map((u) =>
      u.id === action.id && u.approval === "REJECTED"
        ? { ...u, approval: "RESUBMITTED" }
        : u,
    );
    log = "Pendaftaran DEMO diajukan ulang.";
  } else {
    if (!user || !user.active || user.approval !== "APPROVED")
      return fail("Silakan login dengan akun preview aktif.");
    if (action.type === "chat-read" || action.type === "telegram-incoming") {
      const order = state.orders.find((o) => o.monitoringId === action.id);
      if (!order || order.handlerAlias !== user.id)
        return fail("Percakapan ini bukan milik akun aktif.");
      if (action.type === "chat-read") {
        const ids = conversation(order).map((m) => m.id);
        if (ids.every((id) => (order.readBy[user.id] ?? []).includes(id)))
          return state;
        return {
          ...state,
          orders: state.orders.map((o) =>
            o === order ? { ...o, readBy: { ...o.readBy, [user.id]: ids } } : o,
          ),
        };
      }
      const incoming: ChatEntry = {
        id: id(),
        orderId: order.monitoringId,
        replyToMessageId: order.originalMessageId,
        source: action.source,
        sender:
          action.source === "bot" ? "HD Work Bot" : "Petugas Telegram Demo",
        at,
        text:
          action.source === "bot"
            ? `DEMO · Bot memperbarui ${order.monitoringId}.`
            : `DEMO · Pesan Telegram masuk untuk ${order.monitoringId}.`,
        images: [],
      };
      return {
        ...next,
        orders: state.orders.map((o) =>
          o === order
            ? { ...o, telegramMessages: [...o.telegramMessages, incoming] }
            : o,
        ),
        notice: "Pesan masuk disimulasikan lokal. Tidak ada koneksi Telegram.",
      };
    }
    if (
      action.type === "approval" ||
      action.type === "active" ||
      action.type === "template" ||
      action.type === "notify" ||
      action.type === "move"
    ) {
      if (!admin)
        return fail(
          "Tindakan ini hanya tersedia untuk Admin/Super Admin preview.",
        );
      if (action.type === "approval") {
        next.users = state.users.map((u) =>
          u.id === action.id
            ? { ...u, approval: action.approved ? "APPROVED" : "REJECTED" }
            : u,
        );
        log = `Pendaftaran ${action.id}: ${action.approved ? "APPROVED" : "REJECTED"}`;
      }
      if (action.type === "active") {
        if (action.id === user.id)
          return fail("Gunakan akun admin lain untuk menonaktifkan akun ini.");
        next.users = state.users.map((u) =>
          u.id === action.id
            ? {
                ...u,
                active: action.active,
                disabledKind: action.active ? undefined : action.kind,
              }
            : u,
        );
        log = `Akun ${action.id}: ${action.active ? "diaktifkan" : `dinonaktifkan ${action.kind}`}. Kepemilikan order dipertahankan.`;
      }
      if (action.type === "template") {
        if (!action.text.trim()) return fail("Isi template terlebih dahulu.");
        next.templates = [
          ...state.templates,
          { id: id(), text: action.text.trim() },
        ];
        log = "Template pesan DEMO ditambahkan.";
      }
      if (action.type === "notify")
        log =
          "Notifikasi simulasi: event pendaftaran/pengiriman baru diterima. Bot tetap offline.";
    }
    if (action.type === "transfer" || action.type === "move") {
      const target = state.users.find(
        (u) =>
          u.id === action.to &&
          u.role === "HD" &&
          u.active &&
          u.approval === "APPROVED",
      );
      const selected = state.orders.filter((o) =>
        action.ids.includes(o.monitoringId),
      );
      if (
        !target ||
        !selected.length ||
        selected.length !== new Set(action.ids).size ||
        selected.some(
          (o) =>
            o.status !== "PROSES CEK" ||
            (action.type === "transfer" && o.handlerAlias !== user.id),
        ) ||
        (target.id === user.id && action.type === "transfer")
      )
        return fail(
          "Pilih order aktif milik Anda dan penerima HD aktif yang berbeda.",
        );
      if (action.type === "transfer") {
        if (
          state.transfers.some(
            (t) =>
              t.status === "PENDING" &&
              t.ids.some((i) => action.ids.includes(i)),
          )
        )
          return fail(
            "Salah satu order sudah memiliki permintaan transfer tertunda.",
          );
        next.transfers = [
          ...state.transfers,
          {
            id: id(),
            ids: action.ids,
            from: user.id,
            to: target.id,
            status: "PENDING",
            at,
          },
        ];
        log = `Permintaan ${action.ids.length} order ke ${target.id}, menunggu persetujuan tanpa kedaluwarsa.`;
      } else {
        next.orders = state.orders.map((o) =>
          action.ids.includes(o.monitoringId)
            ? {
                ...o,
                handlerAlias: target.id,
                events: [
                  ...o.events,
                  {
                    text: `Admin memindahkan ${o.handlerAlias} → ${target.id}`,
                    at,
                  },
                ],
              }
            : o,
        );
        next.transfers = state.transfers.map((t) =>
          t.status === "PENDING" && t.ids.some((i) => action.ids.includes(i))
            ? { ...t, status: "CANCELLED" }
            : t,
        );
        log = "Admin memindahkan kepemilikan order aktif.";
      }
    }
    if (action.type === "decide") {
      const transfer = state.transfers.find(
        (t) => t.id === action.id && t.status === "PENDING" && t.to === user.id,
      );
      if (!transfer) return fail("Permintaan tidak tersedia untuk akun ini.");
      if (
        action.accept &&
        transfer.ids.some(
          (i) =>
            !state.orders.some(
              (o) =>
                o.monitoringId === i &&
                o.handlerAlias === transfer.from &&
                o.status === "PROSES CEK",
            ),
        )
      )
        return fail("Paket berubah; tidak ada order yang dipindahkan.");
      next.transfers = state.transfers.map((t) =>
        t.id === transfer.id
          ? { ...t, status: action.accept ? "ACCEPTED" : "REJECTED" }
          : t,
      );
      if (action.accept)
        next.orders = state.orders.map((o) =>
          transfer.ids.includes(o.monitoringId)
            ? {
                ...o,
                handlerAlias: user.id,
                events: [
                  ...o.events,
                  {
                    text: `Transfer disetujui: ${transfer.from} → ${user.id}`,
                    at,
                  },
                ],
              }
            : o,
        );
      log = `Bulk transfer ${action.accept ? "Terima Semua" : "Tolak Semua"}: ${transfer.ids.join(", ")}`;
    }
    if (
      "id" in action &&
      ["claim", "message", "edit", "publish", "finish", "reopen"].includes(
        action.type,
      )
    ) {
      const order = state.orders.find((o) => o.monitoringId === action.id);
      if (!order) return fail("Order tidak ditemukan.");
      let changed = { ...order };
      if (action.type === "claim") {
        if (!["MENUNGGU", "PROSES CEK"].includes(order.status))
          return fail("Hanya order menunggu/proses yang dapat diambil.");
        changed = {
          ...order,
          status: "PROSES CEK",
          handlerAlias: user.id,
          startedAt: order.startedAt ?? at,
          history:
            order.status === "MENUNGGU"
              ? [...order.history, { status: "PROSES CEK", at }]
              : order.history,
        };
        log = `Kepemilikan ${order.handlerAlias ?? "belum ditugaskan"} → ${user.id}`;
        next.transfers = state.transfers.map((t) =>
          t.status === "PENDING" && t.ids.includes(order.monitoringId)
            ? { ...t, status: "CANCELLED" }
            : t,
        );
      }
      if (action.type === "message" || action.type === "finish")
        if (order.handlerAlias !== user.id || order.status !== "PROSES CEK")
          return fail(
            "Tindakan ini membutuhkan pemilik aktif pada status PROSES CEK.",
          );
      if (action.type === "message") {
        if (!action.text.trim() && !action.images.length)
          return fail("Tulis pesan atau tambahkan gambar.");
        if (action.images.length > 10)
          return fail("Maksimal 10 gambar per pengiriman.");
        changed.messages = [
          ...order.messages,
          {
            id: id(),
            text: action.text.trim(),
            images: action.images,
            by: user.id,
            at,
            publicApproved: false,
            revisions: [],
            session: order.session,
          },
        ];
        log =
          "Pesan pengecekan disimpan di memori preview. Tidak dikirim Telegram.";
      }
      if (action.type === "edit") {
        const message = order.messages.find(
          (m) => m.id === action.messageId && m.by === user.id,
        );
        if (!message || !action.text.trim())
          return fail(
            "Hanya pesan sendiri yang dapat dikoreksi; teks wajib diisi.",
          );
        changed.messages = order.messages.map((m) =>
          m.id === message.id
            ? {
                ...m,
                text: action.text.trim(),
                publicApproved: false,
                revisions: [...m.revisions, { text: m.text, at }],
              }
            : m,
        );
        log =
          "Pesan dikoreksi; versi lama tersimpan, persetujuan publik direset.";
      }
      if (action.type === "publish") {
        if (!admin && order.handlerAlias !== user.id)
          return fail(
            "Hanya pemilik aktif/admin yang dapat menandai pesan aman.",
          );
        changed.messages = order.messages.map((m) =>
          m.id === action.messageId
            ? { ...m, publicApproved: !m.publicApproved }
            : m,
        );
        log =
          "Penandaan aman publik diubah secara simulasi. Gambar tetap privat.";
      }
      if (action.type === "finish") {
        changed = {
          ...order,
          status: action.status,
          finishedAt: at,
          history: [...order.history, { status: action.status, at }],
          credits: [
            ...order.credits,
            { by: user.id, status: action.status, session: order.session, at },
          ],
        };
        log = `${user.id} menetapkan ${action.status} pada sesi ${order.session}`;
        next.transfers = state.transfers.map((t) =>
          t.status === "PENDING" && t.ids.includes(order.monitoringId)
            ? { ...t, status: "CANCELLED" }
            : t,
        );
      }
      if (action.type === "reopen") {
        if (!["DONE", "GAGAL"].includes(order.status) || !action.reason.trim())
          return fail("Reopen membutuhkan order selesai dan alasan.");
        changed = {
          ...order,
          status: "PROSES CEK",
          handlerAlias: user.id,
          startedAt: at,
          waitingStartedAt: at,
          finishedAt: null,
          session: order.session + 1,
          history: [...order.history, { status: "PROSES CEK", at }],
        };
        log = `Reopen sesi ${changed.session} oleh ${user.id}; pemilik ${order.handlerAlias} → ${user.id}. Alasan: ${action.reason.trim()}`;
      }
      changed.events = [...changed.events, { text: log, at }];
      next.orders = state.orders.map((o) =>
        o.monitoringId === changed.monitoringId ? changed : o,
      );
    }
  }
  return reconcileChat(
    state,
    {
      ...next,
      notice: log || next.notice,
      audit: [{ text: log, at }, ...state.audit],
    },
    action,
    at,
  );
}
// Explicit public projection. Private messages, revisions, images and employee records never leave this boundary.
export function publicProjection(orders: WorkOrder[]): DemoOrder[] {
  return orders.map((o) => ({
    monitoringId: o.monitoringId,
    category: o.category,
    module: o.module,
    sto: o.sto,
    status: o.status,
    receivedAt: o.receivedAt,
    waitingStartedAt: o.waitingStartedAt,
    startedAt: o.startedAt,
    finishedAt: o.finishedAt,
    handlerAlias: publicAlias(o.handlerAlias),
    duplicateOf: o.duplicateOf,
    history: o.history.map((h) => ({ status: h.status, at: h.at })),
    publicMessages: [
      ...o.publicMessages,
      ...o.messages
        .filter((m) => m.publicApproved)
        .map((m) => ({
          text: m.text,
          handlerAlias: publicAlias(m.by)!,
          at: m.at,
          publicApproved: true as const,
        })),
    ],
  }));
}

function publicAlias(id: string | null) {
  return id
    ? id.startsWith("hd_demo_")
      ? id
      : `hd_demo_${id.replace(/-/g, "").slice(0, 8)}`
    : null;
}
