# Batch 5 — Node.js B2C workflow foundation (disabled)

Five change groups: strict parser/configuration; daily deduplication; trusted reply/status transitions; atomic inbox/order/audit/outbox integration; isolated tests and documentation. No production service or database has been used. Frontend Preview, staging read-only API, legacy bot and existing order tables remain unchanged.

## Contract and activation boundary

`createB2CProcessor({store,config}).processNext()` consumes one persistent inbox event inside the Batch 4 transaction. No startup file imports this processor, no timer or worker is started, and no new HTTP mutation endpoint is registered. The web's PICK/CEK/DONE actions remain disabled. Python is only the transport; every workflow decision is in Node.js. Before any future activation, approve the manual `004` and `005` SQL files in an isolated MySQL rehearsal, verify groups/topics and HD identities, and define worker supervision and database grants. Do not run migrations on production now.

Configuration is supplied explicitly by the future composition root, not read from legacy .env:

```js
const config = {
  enabled: true,                    // omit/false fails closed
  botId: '<new-courier-alias>',
  identityKey: '<new-private-key-at-least-32-bytes>',
  dedupeBy: 'both',                 // explicit: sc_in | inet | both
  groups: [{ module: 'TIAL', chatId: '<verified-chat-id>',
             threadId: '<verified-thread-id>', threadMode: 'thread' }],
  actors: [{ id: '<verified-HD-telegram-user-id>', name: '<approved-display-name>' }]
};
```

Placeholders are not valid live configuration. Modules allowed: TIAL, LOGIC_PSB, LOGIC_MO. Each chat/topic tuple maps to exactly one module. Only a deliberately confirmed non-topic group can use `threadMode:'non_topic', threadId:null`. A missing topic is not assumed to mean General. Actor identities are a private server allowlist, never trusted from message text. Future account-backed authorization must replace/synchronize this mapping before operational rollout. IDs remain strings.

## Parser and daily identity

The deliberately narrow initial grammar accepts labelled lines `SC/IN: value`, `INET: value` or `NO INET/TELP: value`. Values are ASCII identifier tokens (letters/digits/slash/underscore/hyphen), uppercased; duplicate labels, empty or ambiguous values are rejected. It never extracts arbitrary digits or interprets customer text. This grammar needs approval against sanitized real templates before use; historical message edits are audited and ignored, not silently reparsed. Unrecognized messages are retained in inbox and marked IGNORED with an audit reason.

Business date is the original Telegram message timestamp in **Asia/Jakarta**, not MySQL import/processing date. Deduplication scope is (bot alias, module, business day, HMAC of explicitly selected normalized reference fields). Policy `both` requires both SC/IN and INET, distinguishes same SC/IN with a different INET, and must not silently fall back. Policy is a business decision: changing policy/key after activation requires a reviewed data migration. This is a foundation policy, not a claim that source staging rows can already be merged safely.

A unique daily reservation is locked transactionally. Each distinct original Telegram message creates its own order row, including DUPLICATE rows pointing to the canonical order. No order is deleted or merged. The original message anchor (bot, chat, message ID) separately prevents re-creation; update ID prevents event replay. Module and date boundaries separate otherwise identical references. Unknown/unsupported events remain traceable. No reference is claimed to be Telegram-verified merely because syntax parses.

## Status replies and delivery

A trusted HD must reply **directly to the original canonical order message** in the configured chat/topic. Replying to a bot acknowledgement, unknown message, duplicate order, another topic or from an unapproved sender is ignored/audited. Exact commands:

- `PROSES CEK`: MENUNGGU → PROSES CEK.
- `DONE`: PROSES CEK → DONE.
- `GAGAL` followed by a newline and a nonempty reason (maximum 1000 characters): PROSES CEK → GAGAL.

Repeated status or invalid transitions produce an audit entry without another outbound status message. Final orders cannot be reopened by these commands. Takeover/transfer/reopen/full account ownership rules are not implemented here and existing prototype behavior is unchanged. `last_actor_id`, processing start/completion timestamps and audit history are stored; this is not a productivity credit formula.

Each successful status change queues one generic status reply to the original message anchor in the same transaction as the order/audit/inbox update. Failure reasons stay in restricted audit JSON and are not echoed to Telegram. No automatic acknowledgement is sent on order ingestion. Queued replies use the explicit thread policy and server-derived idempotency key. The Python courier can claim them through the already protected internal contract only when separately enabled. Transaction errors roll everything back, then use the bounded inbox retry/dead-letter policy.

## Tests and remaining checks

`node --test --test-isolation=none tests/b2c-workflow.test.js tests/courier-mysql.test.js tests/courier.test.js`

All tests use synthetic data and the SQL contract double; no real Telegram/MySQL connection. Covers parser ambiguity, Jakarta day boundary, per-module/day dedup, duplicate retention, concurrent processors, event replay, authorized transitions, required failure reason, direct anchor/thread routing, ignored duplicate replies, and transaction rollback/retry.

Before activation: disposable MySQL DDL/locking/deadlock rehearsal, reviewed real message grammar/dedup policy, verified topics/actors, least-privilege grants, privacy/retention/backup policies, worker monitoring and dead-letter handling. Telegram delivery remains at least once; lost send ACK may duplicate a remote reply. Transaction deadlocks are retried through inbox policy, not by unsafe partial writes. There is no live bot, frontend activation, public workflow endpoint, production migration, or automatic worker in this batch.
