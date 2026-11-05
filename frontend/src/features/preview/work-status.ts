import type { State, DemoUser } from "./model.ts";
export type WorkStatus = "ONLINE" | "SIBUK" | "OFFLINE";
export type Attendance = { status: WorkStatus; checkedAt: string };
export function workStatus(
  state: State,
  userId: string | null = state.sessionId,
): WorkStatus {
  return userId ? (state.attendance[userId]?.status ?? "OFFLINE") : "OFFLINE";
}
export function loginDestination(state: State, user: DemoUser) {
  return user.role !== "HD"
    ? "/preview/admin"
    : workStatus(state, user.id) === "OFFLINE"
      ? "/preview/check-in"
      : "/preview/jobs";
}
export function canClaim(state: State) {
  const user = state.users.find((u) => u.id === state.sessionId);
  return (
    !!user &&
    user.active &&
    user.approval === "APPROVED" &&
    user.role === "HD" &&
    workStatus(state, user.id) === "ONLINE"
  );
}
export function newOrderCount(state: State, userId = state.sessionId) {
  return state.orders.filter(
    (o) => o.handlerAlias === userId && userId && o.unopenedBy.includes(userId),
  ).length;
}
