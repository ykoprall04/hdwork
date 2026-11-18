# Global Telegram command switches

Prepared in source only; not deployed. No operational database was accessed.

## Scope and guarantees

Deployment blockers addressed in source; see [deployment and rollback](global-command-deployment.md) for the compatibility contract and backup prerequisites.

Super Admin controls `/order`, `/req`, `/config_psb`, `/MO` globally from
Monitoring Sistem. All four start ON. Other commands and private bots are outside
this feature. The existing parser handles case and `@BotUsername` consistently.
Invalid commands which belong to a disabled switch are silently ignored too.

Only newly received order commands are gated, before their first durable journal
entry. Already admitted journal/inbox events, existing orders, chat replies,
outbox, FIFO, ACK, lease and writer fences are never re-filtered. Commands arriving
during the normal synchronization window can still be accepted and must finish.
Reply messages in chat mode retain their existing meaning as chat, including text
starting with a slash; this feature does not reinterpret replies as new orders.

## Storage and APIs

`database/manual/021_hdwork2_global_commands.sql` creates one four-row global table.
No per-group/bot setting and no existing order/queue/state rewrite is needed.
Exact additive grants: Web reader SELECT, Web writer SELECT/UPDATE, Courier SELECT.
Grant validation accepts these narrow optional grants while retaining existing
startup profiles. Application startup does not apply migrations.

* `GET /api/operations/system/commands`: Super Admin only.
* `POST /api/operations/system/commands`: command, enabled boolean, version,
  requestId UUID. Requires CSRF, live active Super Admin and unrevoked session.
  Existing system-request deduplication handles retries. Version conflicts return
  409. OFF also requires a ready, supported active Courier. Switch update and `GLOBAL_COMMAND_CHANGED` audit (actor, before/after,
  requestId) commit atomically. Audit failure rolls the switch back.
* `POST /internal/courier/v1/commands`: existing loopback HMAC, timestamp and nonce
  authentication. Read-only configuration; never calls Telegram. Four rows are
  read per refresh, not per Telegram message. Existing nonce persistence also
  occurs once per internal request.

## Courier cache and failures

One bounded refresh thread uses a dedicated internal client (1-second transport
timeout), follows a monotonic four-second cadence, independently of long polling,
scheduler sleeps, rate-limit cooldown and delivery. Normal changes propagate
within 5 seconds; outages/scheduling stalls cannot provide a real-time bound.
No Telegram reconnect/restart or additional Bot API request is involved.
Only poll-enabled workers start this thread.

Each message makes one lock-protected in-memory lookup. Cache writes occur only
on setting changes (or retry of a failed write). `command-settings.json` is an
atomic, small technical sidecar in the existing private journal directory; it
contains no payload or credentials. It is not the SQLite journal or offset.
Cache/API validation is all-or-nothing. API/MySQL failure preserves the last valid
cache, including across a process restart when that sidecar is available. A fresh
installation with no valid cache holds new polling until the API validates the configured defaults. Never silently
interpret a failed SQL query as a new successful all-ON response.

Client and internal endpoint emit static failure codes at most once per minute;
credentials, raw responses and message bodies are not logged by this feature.

## Validation and resource impact

Tests use mocks, in-memory/temp SQLite journals and dummy HTTP APIs only. No MySQL
server or production data is used. Coverage includes each ON/OFF, multiple groups,
parser case/suffix, sub-5-second background refresh, API/SQL/disk failure, log
throttling, cache persistence, authorization/CSRF, audit rollback, idempotency,
existing journal events, continued chat, offset advance and no per-message I/O.
Existing FIFO/ACK, receive-only, lifecycle, parser, workflow and live-chat tests
are run alongside the new tests. Browser tests use the built frontend and a
synthetic API, reject external traffic, and check four switches plus failure and
role handling. Native MySQL migration execution remains a deployment rehearsal.

Current validation: 124 Node tests PASS, Python suite 119 PASS, one browser scenario
PASS (nine toggle writes, stored/effective, old Courier, API failure and ADMIN access),
TypeScript app compilation PASS, Vite build PASS, `git diff --check` PASS.
Temporary build dependency junction was removed after validation. All changes
remain uncommitted in the existing main worktree; lifecycle checkout is untouched.

Synthetic measurement on this PC: 100,000 in-memory lookups took 44.09 ms wall /
46.88 ms CPU. Python-tracked cache/thread allocations were 8.5 KiB, peak 8.6 KiB;
this excludes native thread stack, HTTP buffers and process-wide memory. Budget
approximately 1–3 MiB additional committed RAM pending deployment measurement,
one background thread, and at most approximately 15 fetches plus 15 applied reports/minute per
polling Courier. No process-wide production CPU/RAM measurement was performed.

## Deployment and rollback prerequisites

1. Rehearse/review migration 021 and exact grants on isolated MySQL 8.4 before
   approved production application. Preserve all existing operational data.
2. Deploy internal backend + Python Courier together through the established
   cooperative lifecycle handoff; preserve supervisor/launcher overlay and state.
   Web changes remain independently deployable with the existing Web updater.
   No updater or Task Scheduler behavior is changed by this feature.
3. Expose/use toggles after all participating Courier versions support the cache;
   OFF is rejected if the active worker cannot report support/readiness. Verify cache freshness
   and logs without sending test messages to production groups.
4. Rollback code preserves the table, audit and all operational state. Old code
   does not enforce OFF: keep it fenced while any OFF exists; obtain explicit operator approval before
   rolling back an OFF setting. Do not drop the table or replay ignored updates
   automatically. Ignored commands have advanced the Telegram offset normally.

No deployment, migration, service restart, Task change, commit or push is included
in this preparation. Grafana configuration is untouched.
