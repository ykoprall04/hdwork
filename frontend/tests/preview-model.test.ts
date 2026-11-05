import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reducePreview,
  publicProjection,
  type State,
  type Action,
} from "../src/features/preview/model.ts";
function run(state: State, ...actions: Action[]) {
  return actions.reduce(reducePreview, state);
}
const login = (username: string): Action => ({ type: "login", username });
function owned() {
  let state = run(initialState(), login("hd_demo_1"));
  const ids = state.orders
    .filter((o) => o.status === "MENUNGGU")
    .slice(0, 2)
    .map((o) => o.monitoringId);
  state = run(state, ...ids.map((id) => ({ type: "claim" as const, id })));
  return { state, ids };
}

test("bulk transfer preserves ownership until accepted and moves the entire batch atomically", () => {
  const setup = owned();
  let state = run(setup.state, {
    type: "transfer",
    ids: setup.ids,
    to: "hd_demo_2",
  });
  assert.equal(state.transfers[0].status, "PENDING");
  assert.ok(
    setup.ids.every(
      (id) =>
        state.orders.find((o) => o.monitoringId === id)?.handlerAlias ===
        "hd_demo_1",
    ),
  );
  state = run(state, { type: "logout" }, login("hd_demo_2"), {
    type: "decide",
    id: state.transfers[0].id,
    accept: true,
  });
  assert.equal(state.transfers[0].status, "ACCEPTED");
  assert.ok(
    setup.ids.every(
      (id) =>
        state.orders.find((o) => o.monitoringId === id)?.handlerAlias ===
        "hd_demo_2",
    ),
  );
  assert.ok(
    state.orders
      .find((o) => o.monitoringId === setup.ids[0])!
      .events.some((e) => e.text.includes("Transfer disetujui")),
  );
});
test("reject-all retains old owner; takeover invalidates stale pending packages", () => {
  const setup = owned();
  let state = run(setup.state, {
    type: "transfer",
    ids: setup.ids,
    to: "hd_demo_2",
  });
  const request = state.transfers[0].id;
  state = run(state, login("hd_demo_2"), {
    type: "decide",
    id: request,
    accept: false,
  });
  assert.ok(
    setup.ids.every(
      (id) =>
        state.orders.find((o) => o.monitoringId === id)?.handlerAlias ===
        "hd_demo_1",
    ),
  );
  state = run(
    state,
    login("hd_demo_1"),
    { type: "transfer", ids: setup.ids, to: "hd_demo_2" },
    login("hd_demo_3"),
    { type: "claim", id: setup.ids[0] },
  );
  assert.equal(state.transfers.at(-1)!.status, "CANCELLED");
  const before = state.orders;
  state = run(state, login("hd_demo_2"), {
    type: "decide",
    id: state.transfers.at(-1)!.id,
    accept: true,
  });
  assert.equal(state.orders, before);
});
test("logout and account deactivation retain ownership; inactive accounts cannot login", () => {
  const setup = owned();
  let state = run(
    setup.state,
    { type: "logout" },
    login("admin_demo"),
    { type: "active", id: "hd_demo_1", active: false, kind: "permanen" },
    { type: "logout" },
    login("hd_demo_1"),
  );
  assert.equal(state.sessionId, null);
  assert.equal(
    state.orders.find((o) => o.monitoringId === setup.ids[0])!.handlerAlias,
    "hd_demo_1",
  );
  state = run(
    state,
    login("admin_demo"),
    { type: "active", id: "hd_demo_1", active: true },
    login("hd_demo_1"),
  );
  assert.equal(state.sessionId, "hd_demo_1");
});
test("messages do not complete orders, corrections retain old text and revoke public approval", () => {
  const setup = owned();
  const id = setup.ids[0];
  let state = run(setup.state, {
    type: "message",
    id,
    text: "original",
    images: ["data:image/png;base64,DEMO"],
  });
  const message = state.orders.find((o) => o.monitoringId === id)!.messages[0];
  assert.equal(
    state.orders.find((o) => o.monitoringId === id)!.status,
    "PROSES CEK",
  );
  state = run(state, { type: "publish", id, messageId: message.id });
  assert.ok(
    state.orders.find((o) => o.monitoringId === id)!.messages[0].publicApproved,
  );
  state = run(state, {
    type: "edit",
    id,
    messageId: message.id,
    text: "corrected",
  });
  const corrected = state.orders.find((o) => o.monitoringId === id)!
    .messages[0];
  assert.equal(corrected.revisions[0].text, "original");
  assert.equal(corrected.publicApproved, false);
  const before = state.orders;
  state = run(state, {
    type: "message",
    id,
    text: "bad",
    images: Array(11).fill("image"),
  });
  assert.equal(state.orders, before);
});
test("reopen needs reason, creates sessions, retains messages and historical credit", () => {
  const setup = owned();
  const id = setup.ids[0];
  let state = run(
    setup.state,
    { type: "message", id, text: "check", images: [] },
    { type: "finish", id, status: "DONE" },
    login("hd_demo_2"),
  );
  const before = state.orders;
  state = run(state, { type: "reopen", id, reason: " " });
  assert.equal(state.orders, before);
  state = run(
    state,
    { type: "reopen", id, reason: "verify again" },
    { type: "finish", id, status: "GAGAL" },
  );
  const order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.session, 2);
  assert.equal(order.waitingStartedAt, order.startedAt);
  assert.equal(order.messages.length, 1);
  assert.deepEqual(
    order.credits.map((c) => c.by),
    ["hd_demo_1", "hd_demo_2"],
  );
  assert.equal(order.status, "GAGAL");
});
test("there is no active-order cap in the preview model", () => {
  let state = run(initialState(), login("hd_demo_1"));
  const fixture = state.orders[0];
  state = {
    ...state,
    orders: Array.from({ length: 15 }, (_, i) => ({
      ...fixture,
      monitoringId: `DEMO-BULK-${i}`,
      status: "MENUNGGU" as const,
      handlerAlias: null,
    })),
  };
  state = run(
    state,
    ...state.orders.map((o) => ({
      type: "claim" as const,
      id: o.monitoringId,
    })),
  );
  assert.equal(
    state.orders.filter((o) => o.handlerAlias === "hd_demo_1").length,
    15,
  );
});
test("registration approval/rejection/resubmission flow and admin-only mutation", () => {
  let state = run(initialState(), {
    type: "register",
    user: {
      name: "Fictional",
      username: "new_demo",
      nik: "DEMO-ONLY",
      telegram: "demo_tg",
      telegramId: "9000007",
    },
  });
  const account = state.users.at(-1)!;
  assert.equal(account.approval, "PENDING APPROVAL");
  state = run(state, login("new_demo"));
  assert.equal(state.sessionId, null);
  state = run(
    state,
    login("admin_demo"),
    { type: "approval", id: account.id, approved: false },
    { type: "logout" },
    { type: "resubmit", id: account.id },
  );
  assert.equal(state.users.at(-1)!.approval, "RESUBMITTED");
  state = run(
    state,
    login("superadmin_demo"),
    { type: "approval", id: account.id, approved: true },
    login("new_demo"),
  );
  assert.equal(state.sessionId, account.id);
  const before = state.users;
  state = run(state, { type: "active", id: "hd_demo_1", active: false });
  assert.equal(state.users, before);
});
test("public projection excludes private messages, employee identity, images and internal events", () => {
  const setup = owned();
  const id = setup.ids[0];
  let state = run(setup.state, {
    type: "message",
    id,
    text: "private-marker",
    images: ["SECRET-IMAGE"],
  });
  let projected = publicProjection(state.orders).find(
    (o) => o.monitoringId === id,
  )!;
  assert.ok(!JSON.stringify(projected).includes("private-marker"));
  const messageId = state.orders.find((o) => o.monitoringId === id)!.messages[0]
    .id;
  state = run(state, { type: "publish", id, messageId });
  projected = publicProjection(state.orders).find(
    (o) => o.monitoringId === id,
  )!;
  assert.ok(JSON.stringify(projected).includes("private-marker"));
  assert.ok(!JSON.stringify(projected).includes("SECRET-IMAGE"));
  assert.ok(!("events" in projected));
  assert.ok(!("messages" in projected));
  assert.ok(!("nik" in projected));
  assert.equal(
    publicProjection(initialState().orders).find(
      (o) => o.status === "MENUNGGU",
    )!.handlerAlias,
    null,
  );
});
