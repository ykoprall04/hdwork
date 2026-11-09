# B2C TIAL and LOGIC/SOLVER operational activation

The user's earlier term B2C LOGIN was a typo for B2C LOGIC/SOLVER. No LOGIN order
category, parser or workflow is created. Existing TIAL/REQ, LOGIC_PSB and LOGIC_MO
remain the canonical module identifiers.

The activated code path is the existing operational processor/transition service,
now using verified database routing and durable Live Chat. New database-backed
routing permits only TIAL1/TIAL2 → order/req and SOLVER1 → config_psb/mo. The routing
workflow validates this matrix on each configuration refresh. Other workspaces
and legacy/Preview features remain unchanged; their new chat/routing workflows
are not activated by this B2C path.

`GET /api/operations/b2c/readiness` is admin-only and reads actual verified mapping
and fenced Courier-lease metadata. It reports the existing parser field labels,
module identifiers, missing commands, writer availability and controlled-test
infrastructure preconditions. Missing evidence cannot become LIVE VERIFIED;
`liveVerified` and `telegramDeliveryVerified` remain false. A current lease is
not proof of Telegram sending permission or network connectivity. Operator review
of real destinations, send/receive configuration and consent remains mandatory.
The monitoring page displays this distinction rather than declaring production GO.

## Rules preserved from repository contracts

- TIAL `/order`: required SC/IN, NO INET, SN ONT, STO, KETERANGAN and NIK; existing
  aliases/optional STB ID/TIPE TRANSAKSI remain unchanged. HMAC canonical identity
  covers full TIAL history across group/day, retaining the first order.
- LOGIC `/config_psb` and `/MO`: existing Order ID/SC/IN transaction-code extraction,
  STO and optional fields are used without a speculative new parser.
- `/req` uses the existing nonblank request body contract.
- Business deduplication is intentionally **only `/order`**. The repository explicitly
  documents and tests repeat config_psb/mo/req as new normal requests, while bot
  update/message replay remains idempotent for all commands. Extending LOGIC business
  deduplication would need a separately agreed identity/lifetime rule.
- Ownership, row lock/version, module/session/CSRF, explicit takeover, duplicate
  decisions, DONE, mandatory trimmed GAGAL reason and confirmed REOPEN use the
  existing operations implementation. REOPEN is not renamed to RECEK.
- RECEK has no separate documented operational transition. ESKALASI has a Preview
  description but no approved operational destination/permission/Telegram contract.
  These actions remain unactivated pending confirmation; no dummy buttons are added.

## Verification and boundaries

The dedicated MySQL 8.4.13 disposable B2C matrix passes all four commands with
real stored fields, two-HD races and request replay, DONE/GAGAL/REOPEN, canonical
cross-day/group duplicates, unchanged canonical state, documented repeated LOGIC
commands, actual search/filter queries, timers/statistics, chat delivery metadata,
normal-order-only arrival events, exact reply/topic payloads and mapping disable.
Telegram settlement uses fake message IDs only in disposable test data. The worker
lease used for readiness is also an actual isolated database lease, not production.

310 backend tests (plus the final multi-bot readiness check), 71 frontend tests,
34 Python tests, operational build and changed-file lint pass. Readiness checks
also reject other new categories/profiles, and never claim real Telegram delivery.

This is an implementation and isolated integration result, not a production switch.
No actual service flags, mappings, migration, credentials, Windows task, Cloudflare,
Telegram destination, legacy system or public deployment was changed. An operator
must review migrations 011–013, full exact profiles, the approved build origin and
runtime flags before a separately authorized rollout/testing session.
