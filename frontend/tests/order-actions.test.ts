import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reducePreview,
  type State,
  type Action,
} from "../src/features/preview/model.ts";
import { conversation } from "../src/features/preview/chat-model.ts";
const run = (s: State, ...actions: Action[]) =>
  actions.reduce(reducePreview, s);
const login = (username: string): Action => ({ type: "login", username });
function owned() {
  let state = run(initialState(), login("hd_demo_1"));
  const id = state.orders.find((o) => o.status === "MENUNGGU")!.monitoringId;
  state = run(state, { type: "claim", id });
  return { state, id };
}
test("PICK sets owner/status and creates an exact bot reply to original Telegram message", () => {
  let state = run(initialState(), login("hd_demo_1"));
  const before = state.orders.find((o) => o.status === "MENUNGGU")!;
  state = run(state, {
    type: "claim",
    id: before.monitoringId,
    expectedOwner: null,
    expectedStatus: "MENUNGGU",
  });
  const order = state.orders.find(
    (o) => o.monitoringId === before.monitoringId,
  )!;
  assert.equal(order.status, "PROSES CEK");
  assert.equal(order.handlerAlias, "hd_demo_1");
  const bot = order.telegramMessages.at(-1)!;
  assert.equal(bot.text, "🟡 Data di cek Alya Demo");
  assert.equal(bot.replyToMessageId, order.originalMessageId);
  assert.ok(order.participants.includes("hd_demo_1"));
});
test("takeover records both owners; stale confirmation cannot override a newly assigned owner", () => {
  const { state, id } = owned();
  let result = run(state, login("hd_demo_2"), {
    type: "claim",
    id,
    expectedOwner: "hd_demo_1",
    expectedStatus: "PROSES CEK",
  });
  const order = result.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.handlerAlias, "hd_demo_2");
  assert.deepEqual(order.participants, ["hd_demo_1", "hd_demo_2"]);
  assert.match(order.events.at(-1)!.text, /hd_demo_1.*hd_demo_2/);
  const orders = result.orders;
  result = run(result, login("hd_demo_3"), {
    type: "claim",
    id,
    expectedOwner: "hd_demo_1",
    expectedStatus: "PROSES CEK",
  });
  assert.equal(result.orders, orders);
});
test("DONE/GAGAL/DUPLICATE cannot be picked", () => {
  const state = run(initialState(), login("hd_demo_1"));
  for (const status of ["DONE", "GAGAL", "DUPLICATE"]) {
    const order = state.orders.find((o) => o.status === status)!;
    assert.equal(
      run(state, { type: "claim", id: order.monitoringId }).orders,
      state.orders,
    );
  }
});
test("DONE records actor/time and preserves conversation and historical credits", () => {
  let { state, id } = owned();
  state = run(
    state,
    { type: "message", id, text: "pesan tetap ada", images: [] },
    { type: "finish", id, status: "DONE" },
  );
  const order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.status, "DONE");
  assert.ok(order.finishedAt);
  assert.equal(order.outcomes.at(-1)!.name, "Alya Demo");
  assert.equal(order.outcomes.at(-1)!.at, order.finishedAt);
  assert.ok(conversation(order).some((m) => m.text === "pesan tetap ada"));
  assert.equal(order.credits.at(-1)!.by, "hd_demo_1");
});
test("GAGAL requires nonblank reason and retains it across reopen", () => {
  let { state, id } = owned();
  for (const reason of [undefined, " ", ""])
    assert.equal(
      run(state, { type: "finish", id, status: "GAGAL", reason }).orders,
      state.orders,
    );
  state = run(state, {
    type: "finish",
    id,
    status: "GAGAL",
    reason: "  Verifikasi gagal  ",
  });
  let order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.outcomes.at(-1)!.reason, "Verifikasi gagal");
  assert.match(
    order.events.at(-1)!.text,
    /Alya Demo.*Alasan: Verifikasi gagal/,
  );
  state = run(state, { type: "reopen", id, reason: "cek ulang" });
  order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.outcomes[0].reason, "Verifikasi gagal");
  assert.equal(order.session, 2);
});
test("escalation requires fields, retains owner/status/chat, supports repeated escalation and completion", () => {
  let { state, id } = owned();
  assert.equal(
    run(state, { type: "escalate", id, target: " ", description: "catatan" })
      .orders,
    state.orders,
  );
  assert.equal(
    run(state, { type: "escalate", id, target: "Tim Demo", description: "" })
      .orders,
    state.orders,
  );
  state = run(
    state,
    {
      type: "escalate",
      id,
      target: " Tim Demo ",
      description: " Perlu bantuan ",
    },
    { type: "message", id, text: "lanjut cek", images: [] },
    {
      type: "escalate",
      id,
      target: "Tim Lanjutan",
      description: "konfirmasi kedua",
    },
  );
  let order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.status, "PROSES CEK");
  assert.equal(order.handlerAlias, "hd_demo_1");
  assert.equal(order.escalations.length, 2);
  assert.equal(order.escalations[0].target, "Tim Demo");
  assert.equal(order.escalations[0].name, "Alya Demo");
  assert.ok(order.escalations[0].at);
  assert.ok(conversation(order).some((m) => m.text === "lanjut cek"));
  state = run(state, { type: "finish", id, status: "DONE" });
  order = state.orders.find((o) => o.monitoringId === id)!;
  assert.equal(order.escalations.length, 2);
  assert.equal(order.status, "DONE");
});
test("nonowners and terminal orders cannot complete or escalate", () => {
  const { state, id } = owned();
  let other = run(state, login("hd_demo_2"));
  for (const action of [
    { type: "finish", id, status: "DONE" },
    { type: "finish", id, status: "GAGAL", reason: "reason" },
    { type: "escalate", id, target: "team", description: "note" },
  ] as Action[])
    assert.equal(run(other, action).orders, other.orders);
  const done = run(state, { type: "finish", id, status: "DONE" });
  assert.equal(
    run(done, { type: "escalate", id, target: "team", description: "note" })
      .orders,
    done.orders,
  );
});
