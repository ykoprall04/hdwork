# HD Work 2.0 — final integration readiness

Current role/menu activation audit: [all-features-activation-audit.md](all-features-activation-audit.md).
The historical isolated integration results below predate that mock-only audit.

Scope: ykoprall04/hdwork, chore/remove-cacti-hdwork2, initial baseline 4974cdc.
B2C LOGIN in the original request was corrected to existing B2C LOGIC/SOLVER.
No LOGIN order category, parser or workflow was created.

## Result and evidence boundary

The previous HTTPS/MySQL search gate is resolved: the fixture now searches its
actual canonical parser reference. Node/API, MySQL 8.4.13, Python Courier and
Chromium run the real application path against disposable schemas with synthetic
test users/orders. Telegram alone is deliberately a fake transport, as real
messages were not authorized. No product route falls back to a mock or demo store.

| Area | Status | Evidence / limits |
|---|---|---|
| Account creation, real registration, approval/rejection | INTEGRATION PASS | Actual MySQL transactions/uniqueness/hash/rollback; API policy/CSRF; Chromium registration/admin creation. Existing accounts were not touched. |
| Features #1–#18 | INTEGRATION PASS within isolated scope | Regression/SQL/browser coverage below; no office/public deployment claim. |
| Monitoring, mapping, incidents, alert queue | INTEGRATION PASS | Actual metadata/SQL persistence, mapping conflicts/replay, delegated admin, cooldown races; Node+Python Courier delivers fake verified-target alerts and records ACK. |
| Cloudflare sensor | MOCK PASS / BLOCKED live verification | Optional explicit loopback cloudflared metrics adapter; positive/zero/missing/unreachable cases tested. No office/public probe was performed. |
| Recovery and outage journal | MOCK PASS | Bounded backoff, process overlap guards, database advisory locks and private journal restart/flush tested. No critical service is automatically restarted. |
| Backup scheduler / metadata | MOCK PASS + SQL job integration | One daily job/advisory lock, retention safety and failure tests. Dedicated read-only identity/full grants/InnoDB source are checked before dump. No actual dump/restore was run. |
| Telegram Live Chat text | INTEGRATION PASS | Real persisted incoming/outgoing, ownership/module/session/CSRF, signed mapping refresh, ACK/lost-ACK/pre-ACK recovery, browser send/reload/draft/mobile. Media metadata is retained, not a media UI. |
| TIAL and LOGIC/SOLVER | INTEGRATION PASS | Existing order/req/config_psb/mo parser and full status/assignment/outbox matrix in MySQL, exact original topic/reply; no speculative transitions. |
| Real Telegram / office runtime / public tunnel / rollout | BLOCKED | Requires separately approved access, exact verified test destinations/accounts, configuration/schema/grant review and controlled session. No LIVE VERIFIED claim. |

Preservation of #1–#18: DONE/GAGAL; Telegram-only creation; real detail and SC/IN;
unbounded HH:mm; canonical-safe duplicates; user management; account/password
approval; refresh/SSE; opt-in notification; search; filters; atomic Double CEK;
server timers; append-only activity; required failure reason; actual delivery
metadata; real statistics. Native SQL covers races, status persistence, search,
filters, durations and statistics. Browser tests cover actual UI→API→MySQL and
refresh/history/mobile. Notification tests use real EventSource and Web Audio:
initial snapshot silent, one arrival after opt-in triggers banner/oscillator,
replay/business duplicate/status change do not retrigger. Headless API evidence
does not certify physical office speaker output.

## Implemented commits

- 050f8c1: account/registration and confirmed operational bug repairs.
- 9b5010f: canonical fixture gate and real browser/MySQL verification.
- 6efa2d6: system monitoring, verified routing, resilience and backup implementation.
- f875aed: operational text Live Chat and durable Courier integration.
- ea70eb9: existing TIAL/LOGIC activation contract and readiness matrix.
- The final readiness commit contains guarded combined Node/Python/MySQL tests,
  grant/migration preflight tests and the controlled rollout procedure below.

All commits are on the development branch, never main. Preview and legacy source
files remain unchanged. No users/orders were deleted. No production schema,
permissions, account, runtime flag, task/service, DNS, Cloudflare or Telegram
configuration was changed. Every owned cloud test container and tmpfs was removed.

## Repeating safe tests

- `npm test`: offline unit/HTTP regression suites; no live driver or secret loading.
- `npm run test:e2e:offline`: named safe account/system/chat/workflow readiness suites.
- `node --test frontend/tests/*.test.ts` and
  `PYTHONPATH=courier_bot python -B -m unittest discover -s courier_bot/tests`.
- Frontend build with explicitly approved VITE_API_BASE_URL, cookie/operations/chat
  flags. Local browser builds used https://localhost:8443, never the public site.
- `scripts/test-isolated-mysql.js --private-instance-only [--browser]` remains the
  explicit Windows disposable runner and now includes system/chat/B2C/full suites.
  It creates its own non-3306 instance and hdwork2_test_* schemas only. It is not
  an activation/production script. The cloud verification used an owned Docker
  MySQL 8.4.13 container at loopback 13316 with a fresh schema/user per suite.

The native suites are auth, operations, Courier roundtrip, system, chat, B2C and
full workflow. Each refuses default/operational targets before driver creation;
this ordering was verified and corrected where JavaScript callee evaluation had
loaded the driver before validating arguments. Native full workflow verifies
signed/leased DB routing replacing stale static groups, Python→MySQL ingestion,
web chat outbox, lost event/delivery ACK recovery, incoming replies to confirmed
bot messages, DONE feedback, verified admin alerts, and disable-without-fallback.
No transport retry is introduced for uncertain sends.

The optional chat browser exercise used the same actual SQL store, with real
Chromium, HTTPS, API/session/CSRF, no-page-error assertions, account-scoped draft
recovery, real SSE/audio opt-in and no false duplicate/status notifications.
Admin mapping save is checked in SQL; ADMIN with no job modules can reach the
monitoring console from Jobs, without gaining order modules or account privileges.

## Required review before any office deployment

1. Confirm the exact target remains hdwork2 and the source branch/working tree are
   expected. Preserve existing orders/users and previous protected releases.
2. Operator-approved existing backup/grant/schema inventory; do not start a new
   production backup/restore under this implementation authorization.
3. Review migration 011 (approval CHECK extension), additive 012 (system tables and
   delivered_at) and additive 013 (chat table), exact engine/FK/collation constraints
   and actual grants. The historical 010 release provisioner is deliberately not
   a silent installer of these changes. A DBA must review the target-specific plan.
4. Review full system/chat profiles; dedicated reader never receives outbox payload,
   lease token, password hash or writes. Dedicated backup grants are a separate
   SELECT/SHOW VIEW profile, with no user/password provisioning or GRANT OPTION.
5. Review verified bot IDs, ownership, chat/topic IDs, commands and allowlists. No
   destination is copied from legacy or implicitly reused from trial_yanto.
6. Build for the approved origin. Review web System/Chat flags, Node+Python DB routing
   and Chat flags, send/receive approvals and readiness checks before any switch.
   ADMIN/SUPER_ADMIN manage mappings; only SUPER_ADMIN configures alert recipients.
7. Review private journal/backup directories and Windows ACLs, DPAPI identities,
   mysqldump binary, retention, target grants/InnoDB metadata, schedule and cleanup.
   Coordinate no DDL during a consistent snapshot. Restore is manual only.
8. If desired, approve the actual loopback cloudflared metrics address separately.
   The source adapter never discovers or contacts public endpoints automatically;
   absent/unreachable metrics remain UNKNOWN. Edge connections are not public E2E proof.
9. Review a concrete deploy/task-switch and rollback plan separately. No task is
   installed, service restarted, tunnel changed or production migration run here.

## Controlled real session proposal — not executed

Only after explicit target/access/message authorization:

1. Use an isolated testing application/database with reviewed migrations/grants,
   one approver, two new non-trial HD accounts with TIAL/LOGIC modules and a View
   Only account. Supply secrets through the existing private mechanism, not chat.
2. Register one test account, confirm PENDING login denial, approve with chosen
   role/modules, log in/reload, and check revoked sessions/CSRF/role negatives.
3. Approve one TIAL destination and one LOGIC/SOLVER destination, exact bot/topic
   identity, polling owner and maximum allowed messages. Send only synthetic orders.
4. Test TIAL order and LOGIC config_psb/MO ingress, real search/filter/detail/SSE,
   notification opt-in, simultaneous PICK (one winner), version conflict and replay.
5. Approve a text chat exchange in each direction and verify original anchor/topic,
   durable queue, actual Telegram message ID/ACK and no resend after uncertain send.
   Test DONE/GAGAL with reason, confirmed existing REOPEN and stored audit/statistics.
6. Permit a duplicate only if it is inside the agreed message budget; verify the
   duplicate alone changes, canonical remains intact, and no normal arrival beep.
7. Approve only an owned Courier test pause to verify backlog recovery; do not stop
   operational/legacy services. Monitoring must reflect missing evidence honestly.
   Approve one admin alert separately; MySQL outages defer new alerts through the
   private journal until the MySQL-backed Courier can operate again.
8. Backup/restore testing is a separate approved disposable exercise: seed only
   synthetic data in a new non-3306 instance, dump with scoped read-only credentials,
   verify checksum/completion/engine consistency, restore into another new schema,
   compare counts/checksums and application reads, retain results for review, then
   remove only owned test schemas/containers. Never target production or legacy.
9. Record sanitized evidence and stop on wrong destination, cross-module access,
   double ownership/send, missing audit, incorrect persistence or uncertain delivery.
   Do not bypass grants, CSRF, locking, mapping validation or manual-review policy.

## Rules and verification still pending

- RECEK: no distinct approved operational transition; existing confirmed REOPEN is
  retained without relabeling. ESKALASI: confirm operational authority, destination,
  persistence and Telegram feedback rules; Preview description is not treated as
  permission for a real routing action. No speculative button/transition is enabled.
- LOGIC config_psb/mo/req repeat behavior is already documented and retained. A
  future request for business deduplication would need a separate identity rule.
- Real bot/privacy/topic permissions, actual office audio, Windows service/DPAPI,
  production SQL/grants, actual dump/restore, public tunnel and volume/soak behavior
  remain unverified. A small native export benchmark is not a production load test.

The existing `private-courier.js` / `private-courier-env` path deliberately remains
receive-only, time-limited, with sending disabled. It was not promoted or weakened.
A production/real-test rollout must select and review an operational entrypoint
and private secret plan supporting the explicitly approved send/routing/chat flags;
do not expect the receive-only launcher to forward them. The standalone operational
Node/Python path is the one exercised by the isolated signed integration suite.

Final verification: **316 backend + 71 frontend + 34 Python = 421 passing tests**,
plus seven distinct native MySQL suites and the HTTPS/Chromium exercises described
above. Build and changed-file lint pass. The named offline alias also passes.
All actual MySQL verification used owned non-production containers at loopback
13316 and disposable hdwork2_test_* schemas/users; all Telegram calls were fake.
Owned containers were stopped/removed, the Git working tree was checked, and no
service/deployment/main merge/production data change was performed.
