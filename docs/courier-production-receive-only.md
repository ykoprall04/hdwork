# Production Courier receive-only support

This change prepares code only. It does not activate Courier, register tasks,
decrypt production credentials, contact Telegram, change MySQL grants, or modify
the running web. Keep the writer fence CLOSED epoch 2.

The readiness audit found the existing `hdwork_courier` account matches
`courierSendChatFifo`. Receive-only with database routing and incoming chat uses
the existing exact `courierChat` profile. The sender account has extra outbox
SELECT/INSERT/UPDATE and lane SELECT/INSERT/UPDATE privileges, so the strict
review correctly rejects it. A reported missing column-level outbox SELECT is
not evidence that adding another GRANT fixes the account: full-table SELECT is
already too broad. The grant policy is unchanged; no alternate acceptance of a
sender account, subset-only checks, grants, revokes, or migrations are supplied.

The production launcher previously forced Python send and backend outbox true,
then required `send=true` in Python's READY frame. A separately prepared production
plan can now opt in with exactly `"receiveOnly": true`. Absent this field, the
existing sender contract remains unchanged; false, strings, and ambiguous values
are rejected. A receive-only plan cannot contain deliveryMode, fifoRelease,
adaptiveScheduler, separateIo, or telegramLimits. Preserve the reviewed identity,
database routing, group definitions, protected secret references, polling lock,
and explicit activation boundary; this is not the old time-limited trial plan.

Receive-only loads the same separate trust domains: backend gets DB/service/
identity credentials, Python gets token/service credentials. The environment
explicitly disables send, outbox, FIFO ACK, FIFO release, adaptive sending,
separate sender I/O, writer bot scope, and alerts. Backend configuration rejects
sender contamination before database creation. Python rejects sender/FIFO options
before any network or journal work. The launcher requires both verified identity
and `send=false` READY before starting the inbox worker. The store independently
rejects enqueue, claim, delivery authorization, and settlement with
`COURIER_RECEIVE_ONLY`, before outbox SQL. Order/inbox processing remains enabled.
The internal receipt for an accepted incoming event is not a Telegram reply.

## Required before a separately approved activation

1. Obtain explicit approval for the exact MySQL privilege change. An administrator
   must review and align the existing account to `policies.courierChat` in
   `src/config/operational-grants.js`, including column-only outbox lookup access
   and no lane/outbox write permissions. Verify the actual account identity,
   SHOW GRANTS and schema again; do not weaken the reviewer to accept current
   sender grants. Until then startup fails `COURIER_RECEIVE_ONLY_GRANTS_REJECTED`
   before a listener, worker or Python poller is created.
2. Stage an immutable snapshot from the reviewed commit with a new pinned
   receive-only plan, source/binary/config hashes and protected ACLs. Preserve
   existing DPAPI references and token; never generate a replacement token.
   Pin current verified database group mappings, including shared ALL routes.
3. Verify no other poller for this bot, old Courier/Telegram autostart disabled,
   inactive lease, existing token identity, group access and no webhook. Review
   the source journal identity/offset, an explicit activation boundary and a
   separate candidate journal; never reset/replay historical queues or 18 DEAD.
4. Obtain separate production launch/autostart approval. Use one owner, a free
   loopback Courier port (3091), no automatic restart, and cooperative stop.
   Never repurpose the online web task or touch personal bot tasks/processes.
5. After approved launch require receive-only READY, confirm fence remains CLOSED
   epoch 2 and outbox unchanged, and verify a new authorized incoming Telegram
   order in MySQL and through the authenticated dashboard. A public login HTTP
   200 or old orders do not establish live ingestion/dashboard success. No
   Telegram reply or fence opening is part of this procedure.

## Offline verification

`tests/production-receive-only.test.cjs` tests loaders, strict grant rejection,
runtime contamination, a real inbox/workflow with a SQL double, outbox guards,
and the production launcher's READY/cleanup behavior with a fake child. Production
cutover Python tests validate receive-only and identity/boundary gates. The
existing receive-only journal/runner tests prove forwarding/dedupe/retry with
zero Telegram send, outbox claim, or outbound ACK calls. All credentials, SQL,
children, messages and journals in these tests are synthetic.

Validation on Windows/Python 3.14: 69 related Node tests PASS, no skips;
4 production-cutover Python tests and 2 receive-only runner tests PASS;
JavaScript/Python syntax and git diff --check PASS. After the final backend
contamination checks, the 29 affected Node tests were rerun and PASS.
The complete Python suite ran 83 tests with 3 errors: Windows WinError 32 during
temporary SQLite backup cleanup in test_preparation_backup (2) and
test_backup_review (1). All three were independently reproduced from unchanged
base commit 1d38874 in a separate source archive. Backup helpers and their tests
are outside this change and remain unchanged; the full Python suite is not PASS.
