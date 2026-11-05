import type { State, WorkOrder, Action } from "./model.ts";
export type ChatEntry = {
  attachmentCount?: number;
  id: string;
  orderId: string;
  replyToMessageId: string;
  source: "bot" | "telegram" | "web";
  sender: string;
  at: string;
  text: string;
  images: string[];
};
export function originalMessageId(orderId: string) {
  return `TG-DEMO-ORDER-${orderId}`;
}
export function seedConversation(orderId: string, at: string): ChatEntry[] {
  return [
    {
      id: `${orderId}-bot`,
      orderId,
      replyToMessageId: originalMessageId(orderId),
      source: "bot",
      sender: "HD Work Bot",
      at,
      text: `DEMO · Order ${orderId} diterima dari Telegram.`,
      images: [],
    },
    {
      id: `${orderId}-telegram`,
      orderId,
      replyToMessageId: originalMessageId(orderId),
      source: "telegram",
      sender: "Petugas Telegram Demo",
      at,
      text: `DEMO · Mohon pengecekan untuk ${orderId}.`,
      images: [],
    },
  ];
}
export function conversation(order: WorkOrder): ChatEntry[] {
  return [
    ...order.telegramMessages,
    ...order.messages.map((m) => ({
      id: m.id,
      orderId: order.monitoringId,
      replyToMessageId: m.replyToMessageId ?? order.originalMessageId,
      source: "web" as const,
      sender: m.by,
      at: m.at,
      text: m.text,
      images: m.images,
      attachmentCount: m.attachmentCount,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function unreadCount(order: WorkOrder, userId: string) {
  if (order.handlerAlias !== userId) return 0;
  const seen = order.readBy[userId] ?? [];
  return conversation(order).filter(
    (m) => m.sender !== userId && !seen.includes(m.id),
  ).length;
}
export function latestActivity(order: WorkOrder) {
  return Math.max(
    Date.parse(order.receivedAt),
    ...conversation(order).map((m) => Date.parse(m.at)),
  );
}
// All ownership paths (claim, transfer, takeover, admin move, reopen) retain participation.
export function reconcileChat(
  before: State,
  after: State,
  action: Action,
  at: string,
): State {
  return {
    ...after,
    orders: after.orders.map((order) => {
      const previous = before.orders.find(
        (o) => o.monitoringId === order.monitoringId,
      );
      if (!previous || previous === order) return order;
      const participants = Array.from(
        new Set([
          ...previous.participants,
          ...order.participants,
          ...[previous.handlerAlias, order.handlerAlias].filter(
            (id): id is string => !!id,
          ),
        ]),
      );
      let telegramMessages = order.telegramMessages;
      if (
        action.type === "claim" &&
        order.monitoringId === action.id &&
        previous.handlerAlias !== order.handlerAlias
      ) {
        const name =
          after.users.find((u) => u.id === order.handlerAlias)?.name ??
          order.handlerAlias;
        telegramMessages = [
          ...telegramMessages,
          {
            id: crypto.randomUUID(),
            orderId: order.monitoringId,
            replyToMessageId: order.originalMessageId,
            source: "bot",
            sender: "HD Work Bot",
            at,
            text: `🟡 Data di cek ${name}`,
            images: [],
          },
        ];
      }
      return {
        ...order,
        participants,
        unopenedBy:
          order.handlerAlias && previous.handlerAlias !== order.handlerAlias
            ? Array.from(new Set([...order.unopenedBy, order.handlerAlias]))
            : order.unopenedBy,
        telegramMessages,
        messages: order.messages.map((m) => ({
          ...m,
          orderId: order.monitoringId,
          replyToMessageId: order.originalMessageId,
        })),
      };
    }),
  };
}
