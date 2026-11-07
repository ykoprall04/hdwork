# Batch 4 — persistent courier storage (not activated)

Five changes: manual schema; isolated MySQL factory; transactional inbox/outbox idempotency; lease/retry/dead-letter recovery; isolated tests and this guide. No production database has been connected or migrated.

## Manual schema review

`database/manual/004_hdwork2_courier.sql` requires MySQL 8.0.13+ with InnoDB and `SKIP LOCKED`. It creates only new `hd2_*` tables in **hdwork2**: status dictionary, orders, daily deduplication reservations, inbox, outbox and audit. It never alters legacy tables. Do not execute until an operator approves a backup, schema/collation review, least-privilege grants and a disposable-database rehearsal. This is not an automatic migration and is intentionally not rerunnable over existing tables. DDL is not transactionally reversible in MySQL. No migration or grant runs on startup.

## Separate configuration (values must be supplied privately)

Existing courier flags remain disabled by default. Explicit `COURIER_ENABLED=true`, `COURIER_STORE=mysql` and `COURIER_DB_NAME=hdwork2` select persistence. Supply `COURIER_DB_HOST`, `COURIER_DB_PORT` (default 3306), `COURIER_DB_USER`, `COURIER_DB_PASSWORD`, `COURIER_BOT_ID`, `COURIER_SERVICE_KEY`. Do not reuse root, the web application's database user, staging reader, old bot tokens or credentials. The new user needs SELECT/INSERT/UPDATE on reviewed `hd2_*` tables only, no DDL/DELETE/GRANT and no access to hd_b2c or old databases. The factory checks database name/user separation; actual grants must be checked manually. No new secret is committed.

`courier-api-server.js` remains a separate opt-in loopback-only process. Web `start:api`, legacy `start`, bot and synchronization lifecycles are unchanged. No worker runs automatically. The memory store remains an explicitly selected development option and is never a fallback after a MySQL error.

## Guarantees and limitations

Inbox uniqueness is (bot alias, Telegram update ID), with a normalized payload hash: identical replay returns the original receipt, changed payload conflicts. Outbox has a separate bot/idempotency-key uniqueness constraint. Every order handler runs inside the inbox transaction with its audit/order/outbox writes, then marks the inbox processed. Failure rolls back writes and records a generic bounded retry in a separate transaction. Poll `processNext(handler)` explicitly in a future approved worker; this change does not start one. Handler must use the supplied transaction and perform no external I/O.

Outbox claims lock rows, use a 60-second lease and increment attempts before delivery. Expired leases are recovered in bounded batches; retry backoff starts at 2 seconds and caps at 60 seconds; Telegram retry-after caps at 300 seconds. Five attempts default, permanent errors or exhaustion enter DEAD. ACKs require the active lease and are idempotent for an identical last acknowledgement. Dead-letter replay requires future reviewed tooling; no public mutation endpoint is supplied.

Telegram delivery is **at least once**, not exactly once: successful Telegram send followed by a lost ACK can send twice. Transactions ensure internal consistency, not remote atomicity. Inbox payloads can contain sensitive messages: database access, encryption/backups and a retention policy must be approved before production use. This foundation has no retention worker or redrive UI. Native MySQL locking/DDL semantics still require disposable-environment validation; mocks do not replace it.

## Safe tests

`node --test --test-isolation=none tests/courier-mysql.test.js tests/courier.test.js`

Tests use an in-memory SQL contract double, including serialized transactions and rollback snapshots, and a mocked driver factory. They cover restart over shared persisted state, replay/conflict, claim contention, stale ACK, lease expiry, retry-after, dead-letter, atomic rollback and disabled/isolated configuration. No SQL file is executed, no real connection or Telegram call is made.
