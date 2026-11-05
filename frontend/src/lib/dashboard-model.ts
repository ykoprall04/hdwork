import type { Order } from "@/services/order.service"

const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
})

export function jakartaDay(value: string | Date) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateKey.format(date)
}

export function orderTrend(orders: Order[], now = new Date()) {
  const anchor = new Date(`${jakartaDay(now)}T12:00:00+07:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor.getTime() - (6 - index) * 86400000)
    const key = jakartaDay(date)
    return {
      key,
      label: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric" }).format(date),
      incoming: orders.filter((order) => jakartaDay(order.created_at) === key).length,
      completed: orders.filter((order) => order.status === "DONE" && order.completed_at && jakartaDay(order.completed_at) === key).length,
    }
  })
}

export function priorityOrders(orders: Order[]) {
  const rank: Record<Order["status"], number> = { ESCALATED: 0, WAITING: 1, IN_PROGRESS: 2, DONE: 3 }
  return orders.filter((order) => order.status !== "DONE").sort((a, b) =>
    rank[a.status] - rank[b.status] || new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id,
  )
}

export function segmentSummary(orders: Order[], userId?: number) {
  return {
    waiting: orders.filter((order) => order.status === "WAITING").length,
    in_progress: orders.filter((order) => order.status === "IN_PROGRESS").length,
    escalated: orders.filter((order) => order.status === "ESCALATED").length,
    done_today: orders.filter((order) => order.status === "DONE" && order.completed_at && jakartaDay(order.completed_at) === jakartaDay(new Date()) && (userId === undefined || Number(order.performance_owner_id) === userId)).length,
  }
}
