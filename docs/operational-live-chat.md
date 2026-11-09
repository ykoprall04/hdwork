# Operational Telegram Live Chat (Batch 4)

This is the existing B2C TIAL/REQ and LOGIC/SOLVER (config_psb/mo) workflow.
There is no order category or parser LOGIN. Preview and legacy are unchanged.

## Data path and controls

Telegram → Python Courier journal → signed/leased inbox API → MySQL inbox →
Node processor → hd2_chat_messages → shared module-scoped SSE → operational UI.
Web replies use cookie session + CSRF + rate limit → locked order/session/module
checks → chat record + audit + idempotent request + existing Courier outbox in a
single transaction. Only the current HD, ADMIN or SUPER_ADMIN owner of IN_PROGRESS with the matching
module may reply. Administrative roles gain no automatic ownership. Admins
and Show Only can read their allowed modules; the restricted trial account cannot
use this new feature. The browser cannot supply chat/topic/bot/reply destinations.

Original messages are captured only when actual new ingress creates an order.
Historical orders are not silently backfilled with invented conversations. Free
text replies must belong to a verified mapped group/topic. The server resolves
their original order or a confirmed message ID from that conversation, within
that exact bot/chat/topic. Unknown anchors retry durably, then remain DEAD for
review with the original inbox payload; they never attach to an arbitrary order.
This includes the race where an incoming reply precedes an outgoing delivery ACK.

Outgoing text always replies to the selected order's own original message/topic,
including duplicate orders. Canonical assignment/status is never modified by chat.
Repeated request IDs return the existing result with no second message/audit.
Ownership changes, stale versions, revoked sessions, missing modules and disabled
mappings reject new sends. A disabled/failed routing snapshot has no static fallback.

Delivery uses the existing Courier claim/lease/ACK and uncertain-send policy.
ANTRE is not SENT; TERKIRIM requires the confirmed Telegram message ID. NETWORK
uncertainty/expired leases stay for manual review. Only explicit RATE_LIMIT is
retryable. Sender/reply IDs, text, timestamps, outbox status/attempts and audit are
persisted/derived from MySQL, not local demo state. Incoming attachment metadata
is retained privately; media download/upload/display is not implemented here.

## Frontend

`/chat` and `/chat/:id` use the existing workspace shell, components, Actions and
shared SSE subscription. Desktop conversation/message columns collapse on mobile.
Order reference/category/owner/status and a link to real detail are available.
Message history is paginated; DONE history stays readable. Draft and pending
request identity are partitioned by account/order in sessionStorage. Reload never
automatically sends a draft. An ambiguous network retry preserves its request ID;
logout clears chat drafts. Committed messages always remain in MySQL.

Existing PICK, explicit TAKEOVER, duplicate decisions, DONE/GAGAL and confirmed
REOPEN controls reuse the original operations API. No new RECEK transition or
operational ESKALASI routing is invented. The repository documents escalation in
Preview only; production destination/authorization/feedback rules still need
business confirmation. REOPEN retains its documented meaning and is not renamed.

## Manual activation prerequisites

- Review/apply migrations 012–013 on the approved target and review the full
  `hdwork2-live-chat-grants.review.sql` profile against actual grants. No migration
  or grant is applied by startup. Pool readiness checks required tables/columns.
- Web: HDWORK2_SYSTEM_MONITORING_ENABLED=true and HDWORK2_LIVE_CHAT_ENABLED=true;
  approved writer/auth/operations profiles remain mandatory.
- Build: VITE_HDWORK2_AUTH_COOKIE=true, VITE_HDWORK2_OPERATIONS=true,
  VITE_HDWORK2_LIVE_CHAT=true and the approved API origin.
- Dedicated Node and Python Courier: COURIER_DATABASE_ROUTING_ENABLED=true and
  COURIER_CHAT_ENABLED=true, exact enabled/verified TIAL/LOGIC mappings and existing
  send/receive approvals. Restricted single-order test windows reject chat.
- This source change does not set any running flag, change a task/service, deploy,
  or send Telegram. Real Telegram testing needs separate destination/message consent.

Full opt-in grant templates retain dedicated read/write/Courier roles. Read access
adds only chat data and minimal inbox metadata; it never gains outbox payload or
lease tokens. Operations audit and outbox remain atomic. Monitoring now includes
incoming pending/DEAD counts and returns numeric counters consistently.

## Verification

307 backend regression tests, 71 frontend tests and 34 Python tests pass. Build
with live-chat/cookie/operations flags and changed-file lint pass. The 13-check
MySQL 8.4.13 suite verifies actual original/reply persistence, TIAL+LOGIC routing,
RBAC, concurrent idempotency, original/confirmed reply anchors, pre-ACK recovery,
unknown-anchor quarantine, mapping disable, session revocation and audit.

Chromium + HTTPS/API + the same real disposable MySQL passed actual chat enqueue,
reload/draft persistence, no auto-send, mobile and admin mapping save. Explicit
submit button types were fixed after the browser exposed the issue; transcript
and SQL assertions verify actual persistence. All Telegram deliveries are fake
ACKs in isolated test data. Containers and tmpfs test data were removed. No
production access, real message, dump, restore, deploy or service restart occurred.
