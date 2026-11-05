import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reducePreview,
  type State,
  type Action,
} from "../src/features/preview/model.ts";
import {
  workStatus,
  loginDestination,
  newOrderCount,
} from "../src/features/preview/work-status.ts";
import { createClaimService } from "../src/features/preview/claim-service.ts";
import {
  conversation,
  unreadCount,
} from "../src/features/preview/chat-model.ts";
import {
  loadPreview,
  savePreview,
  accountKey,
  WORKSPACE_KEY,
} from "../src/features/preview/persistence.ts";
import {
  handlingMs,
  formatHandling,
} from "../src/features/operations/handling-time.ts";
const run = (s: State, ...a: Action[]) => a.reduce(reducePreview, s);
const login = (username = "hd_demo_1"): Action => ({ type: "login", username });
const online = () =>
  run(initialState(), login(), { type: "work-status", status: "ONLINE" });
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

test("OFFLINE/first login requires check-in; ONLINE and SIBUK logins skip it", () => {
  let s = run(initialState(), login());
  assert.equal(s.checkInRequired, true);
  assert.equal(loginDestination(s, s.users[0]), "/preview/check-in");
  s = run(s, { type: "work-status", status: "ONLINE" }, login());
  assert.equal(s.checkInRequired, false);
  assert.equal(loginDestination(s, s.users[0]), "/preview/jobs");
  s = run(s, { type: "work-status", status: "SIBUK" }, login());
  assert.equal(s.checkInRequired, false);
  assert.equal(workStatus(s), "SIBUK");
});
test("logout marks only active account OFFLINE without releasing orders and next login requires check-in", () => {
  let s = online();
  s = run(
    s,
    login("hd_demo_2"),
    { type: "work-status", status: "SIBUK" },
    login(),
  );
  const orders = s.orders;
  s = run(s, { type: "logout" });
  assert.equal(workStatus(s, "hd_demo_1"), "OFFLINE");
  assert.equal(workStatus(s, "hd_demo_2"), "SIBUK");
  assert.equal(s.orders, orders);
  assert.equal(run(s, login()).checkInRequired, true);
});
test("OFFLINE/SIBUK cannot PICK; ONLINE claims an unowned order and repeat PICK is rejected", () => {
  for (const status of ["OFFLINE", "SIBUK"] as const) {
    const s = run(online(), { type: "work-status", status });
    const id = s.orders.find((o) => o.status === "MENUNGGU")!.monitoringId;
    assert.equal(run(s, { type: "claim", id }).orders, s.orders);
  }
  let s = online();
  const id = s.orders.find((o) => o.status === "MENUNGGU")!.monitoringId;
  s = run(s, { type: "claim", id });
  assert.equal(
    s.orders.find((o) => o.monitoringId === id)!.handlerAlias,
    "hd_demo_1",
  );
  assert.equal(run(s, { type: "claim", id }).orders, s.orders);
});
test("SIBUK/OFFLINE can handle and complete already owned work", () => {
  for (const status of ["OFFLINE", "SIBUK"] as const) {
    let s = run(online(), { type: "work-status", status });
    const id = s.orders.find(
      (o) => o.handlerAlias === s.sessionId && o.status === "PROSES CEK",
    )!.monitoringId;
    s = run(
      s,
      { type: "message", id, text: "cek sendiri", images: [] },
      { type: "finish", id, status: "DONE" },
    );
    assert.equal(s.orders.find((o) => o.monitoringId === id)!.status, "DONE");
  }
});
test("PICK preserves TIAL/LOGIC separation and marks only its owner as BARU until that order is opened", () => {
  let s = online();
  const order = s.orders.find(
    (o) => o.module === "TIAL" && o.status === "MENUNGGU",
  )!;
  s = run(s, { type: "claim", id: order.monitoringId });
  assert.equal(
    s.orders.find((o) => o.monitoringId === order.monitoringId)!.module,
    "TIAL",
  );
  assert.equal(
    s.orders
      .filter((o) => o.module === "LOGIC")
      .some((o) => o.monitoringId === order.monitoringId),
    false,
  );
  assert.equal(newOrderCount(s), 1);
  s = run(s, login("hd_demo_2"));
  assert.equal(newOrderCount(s), 0);
  s = run(s, login());
  assert.equal(newOrderCount(s), 1);
  s = run(s, { type: "order-opened", id: order.monitoringId });
  assert.equal(newOrderCount(s), 0);
});
test("new-order flag and message unread are independent; read only supplied visible messages", () => {
  let s = online();
  const id = s.orders.find((o) => o.status === "MENUNGGU")!.monitoringId;
  s = run(
    s,
    { type: "claim", id },
    { type: "telegram-incoming", id, source: "telegram" },
  );
  const before = s.orders.find((o) => o.monitoringId === id)!;
  const unread = unreadCount(before, s.sessionId!);
  s = run(s, { type: "order-opened", id });
  assert.equal(newOrderCount(s), 0);
  assert.equal(
    unreadCount(s.orders.find((o) => o.monitoringId === id)!, s.sessionId!),
    unread,
  );
  const first = conversation(before)[0].id;
  s = run(s, { type: "chat-read", id, messageIds: [first] });
  assert.equal(
    unreadCount(s.orders.find((o) => o.monitoringId === id)!, s.sessionId!),
    unread - 1,
  );
});
test("refresh restores session, account status, new flags and message reads without mixing accounts", () => {
  let s = online();
  const id = s.orders.find((o) => o.status === "MENUNGGU")!.monitoringId;
  s = run(
    s,
    { type: "claim", id },
    login("hd_demo_2"),
    { type: "work-status", status: "SIBUK" },
    login(),
  );
  const store = storage();
  assert.equal(savePreview(store, s), null);
  const restored = loadPreview(store);
  assert.equal(restored.sessionId, "hd_demo_1");
  assert.equal(workStatus(restored), "ONLINE");
  assert.equal(workStatus(restored, "hd_demo_2"), "SIBUK");
  assert.equal(newOrderCount(restored), 1);
  assert.ok(store.values.has(accountKey("hd_demo_1")));
  assert.ok(store.values.has(accountKey("hd_demo_2")));
  assert.equal(newOrderCount(run(restored, login("hd_demo_2"))), 0);
  store.values.delete(accountKey("hd_demo_1"));
  assert.equal(loadPreview(store).checkInRequired,true);
});
test("bad/missing local state safely falls back and write failures are reported", () => {
  const store = storage();
  store.setItem(WORKSPACE_KEY, "bad-json");
  assert.equal(loadPreview(store).sessionId, null);
  const error = savePreview(
    {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    },
    online(),
  );
  assert.ok(error?.includes("belum dijamin"));
});
test("claim service serializes duplicate clicks and rechecks state before applying", async () => {
  let s = online();
  const order = s.orders.find((o) => o.status === "MENUNGGU")!;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const service = createClaimService(
    () => s,
    (a) => {
      s = reducePreview(s, a);
    },
    () => gate,
  );
  const request = {
    id: order.monitoringId,
    expectedOwner: null,
    expectedStatus: "MENUNGGU",
    mode: "pick" as const,
  };
  const first = service(request);
  assert.equal((await service(request)).ok, false);
  release();
  assert.equal((await first).ok, true);
  assert.equal((await service(request)).ok, false);
  assert.equal(
    s.orders.filter((o) => o.monitoringId === order.monitoringId).length,
    1,
  );
});
test("claim service detects a changed owner/work status during its delay", async () => {
  let s = online();
  const order = s.orders.find((o) => o.status === "MENUNGGU")!;
  const service = createClaimService(
    () => s,
    (a) => {
      s = reducePreview(s, a);
    },
    async () => {
      s = run(s, { type: "work-status", status: "SIBUK" });
    },
  );
  assert.equal(
    (
      await service({
        id: order.monitoringId,
        expectedOwner: null,
        expectedStatus: "MENUNGGU",
        mode: "pick",
      })
    ).ok,
    false,
  );
  assert.equal(
    s.orders.find((o) => o.monitoringId === order.monitoringId)!.status,
    "MENUNGGU",
  );
});
test("handling durations are from PICK timestamps, freeze at completion, and format correctly", () => {
  const order = { startedAt: "2026-11-05T01:00:00Z", finishedAt: null };
  assert.equal(
    formatHandling(handlingMs(order, Date.parse("2026-11-05T01:03:00Z"))),
    "3 menit",
  );
  assert.equal(
    formatHandling(handlingMs(order, Date.parse("2026-11-05T02:12:00Z"))),
    "1 jam 12 menit",
  );
  const finished = { ...order, finishedAt: "2026-11-05T01:18:00Z" };
  assert.equal(
    formatHandling(handlingMs(finished, Date.parse("2026-11-06T01:00:00Z"))),
    "18 menit",
  );
  let s = online();
  const id = s.orders.find(
    (o) => o.handlerAlias === s.sessionId && o.status === "PROSES CEK",
  )!.monitoringId;
  s = run(s, { type: "finish", id, status: "DONE" });
  assert.equal(
    typeof s.orders.find((o) => o.monitoringId === id)!.handlingDurationMs,
    "number",
  );
});

test("PICK cannot switch actors when another account logs in while it is pending", async () => {
  let state = online();
  const order = state.orders.find((o) => o.status === "MENUNGGU")!;
  const service = createClaimService(
    () => state,
    (a) => {
      state = reducePreview(state, a);
    },
    async () => {
      state = run(state, login("hd_demo_2"), {
        type: "work-status",
        status: "ONLINE",
      });
    },
  );
  assert.equal(
    (
      await service({
        id: order.monitoringId,
        expectedOwner: null,
        expectedStatus: "MENUNGGU",
        mode: "pick",
      })
    ).ok,
    false,
  );
  assert.equal(
    state.orders.find((o) => o.monitoringId === order.monitoringId)!
      .handlerAlias,
    null,
  );
});
