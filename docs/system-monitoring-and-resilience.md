# System monitoring and resilience (Batch 3)

B2C LOGIC/SOLVER is the existing LOGIC_PSB/LOGIC_MO workflow. No order category
LOGIN is introduced. Preview and legacy code/data remain separate and unchanged.

## Runtime and approval boundaries

The monitoring page `/admin/system` calls `/api/operations/system/*`. ADMIN and
SUPER_ADMIN can read and manage mappings. HD can read status, queue counts and
incidents through GET /status only; worker identities and configuration are
omitted. HD never submits frontend heartbeats or configuration writes. Only SUPER_ADMIN changes alert
recipients. Account/session is rechecked inside configuration transactions, with
CSRF, request hashing/idempotency, versions, uniqueness and append-only audit.
Routes are disabled unless `HDWORK2_SYSTEM_MONITORING_ENABLED=true`.

Migration 012 and the exact opt-in grants template are manual review inputs,
never startup migrations. The template is a complete profile, not a request to
create accounts or automatically widen grants. Additional system tables and
metadata columns are admitted only in opt-in pool/Courier grant profiles.
No runtime settings, Windows tasks, tunnel configuration or production grants
were applied. Activation needs the operator's separately approved rollout.

## Evidence and delivery

- API availability reflects an actual successful handler; MySQL executes SELECT 1.
- Frontend ONLINE requires an authenticated browser heartbeat and expires after
  90 seconds. Older/future evidence is UNKNOWN. The UI marks failed refreshes UNKNOWN.
- Courier heartbeat derives from its fenced lease; no workers means UNKNOWN,
  stale workers OFFLINE, partial connectivity DEGRADED. A live lease does not
  establish Telegram connectivity.
- Queue pending/delivered/failed/retry/age are SQL aggregates. Last successful
  delivery uses `delivered_at`, recorded only on a successful Courier settlement
  with a Telegram message ID. Historical rows without this evidence remain unknown.
- Tunnel stays UNKNOWN unless an operator supplies the approved loopback
  HDWORK2_SYSTEM_TUNNEL_PROBE metrics URL. Only an observed positive
  cloudflared_tunnel_ha_connections gauge yields ONLINE; zero yields OFFLINE.
  Unreachable/missing metrics remain UNKNOWN, not fabricated health. This is
  edge-connection evidence, not public end-to-end verification. No public URL is contacted.
- State changes persist incidents with timestamps. Worker retry is bounded
  exponential backoff; advisory locks and in-flight guards exclude duplicate jobs.
  It never restarts Windows services, the PC, MySQL, Cloudflare or legacy processes.

An approved separate worker can be started with
`node scripts/system-monitor-worker.js --run-approved`. It additionally requires
`HDWORK2_SYSTEM_WORKER_APPROVED=true` and a private absolute
`HDWORK2_SYSTEM_JOURNAL_DIRECTORY` outside the repository. It reads existing
DPAPI-backed pool credentials and validates the existing persistent profile.

Outages preventing MySQL writes go to a private journal containing only a fixed
code/time. After database recovery, incidents are restored and a deduplicated
MYSQL_OUTAGE_RECOVERED alert can enter the durable Courier outbox. **MySQL-backed
Courier cannot deliver a newly queued alert during the database outage itself.**
An immediate independent outage channel would require a separately approved
transport/monitoring architecture; no direct-Telegram bypass is added.

Alerts require an explicitly configured, enabled, operator-verified bot/group/topic
and reply anchor via POST `/system/alert-target`, plus
`HDWORK2_SYSTEM_ALERTS_APPROVED=true`. Exact destinations are checked on both
Node and Python sides. Cooldown uses a locked last-send record, including across
window boundaries. Queueing is not SENT; uncertain deliveries retain the existing
DEAD/manual-review semantics. No real alert was sent during implementation.

## Database-backed Courier routing

`COURIER_DATABASE_ROUTING_ENABLED=true` opts the dedicated Courier into signed,
nonce-protected, leased `/internal/courier/v1/routing` snapshots. Both ingress and
outgoing use enabled/verified mappings, with no static fallback after a snapshot
failure. Python refreshes before polling/claiming; Node rechecks routing during
processing and outgoing authorization. TIAL maps to TIAL1/TIAL2 and order/req;
LOGIC maps to SOLVER1 and config_psb/mo. Disabling a mapping does not change any
existing order or canonical reference. Operational activation requires at least
one verified business route. Existing flags remain unchanged and disabled here.

## Backup

The separate worker schedules at most one backup job per WIB calendar day. A MySQL advisory lock
also excludes overlapping jobs across day boundaries. An existing RUNNING record
from a lost connection blocks new jobs until manual review, even on a later day. `HDWORK2_BACKUP_APPROVED`
defaults to disabled. Approved configuration supplies an absolute private backup
directory, mysqldump executable, dedicated hdwork_backup user and DPAPI credential.
mysqldump uses single-transaction/quick/no-lock-tables, no shell, bounded execution,
private output files and an isolated child environment. Password is never argv.
The dedicated backup identity must have full read-only hdwork2 grants and every
base table must be InnoDB before dumping. A completed dump trailer, nonzero size
and SHA-256 are required before VERIFIED.
Only owned filenames linked to VERIFIED metadata are eligible for retention;
uncertain/failed/unknown files stay for review. Restore is deliberately manual.
No database backup or restore was performed; dump execution is MOCK PASS only.

## Validation scope

Node tests cover RBAC/CSRF, verified mappings, stale evidence, backoff/overlap,
backup reservation/failure, grant profiles and durable outage-journal recovery.
Python tests cover dynamic routing refresh, exact alert destinations and failure
before polling/sending. Disposable MySQL tests cover mapping conflicts/replay,
real incident timestamps, cooldown races, durable alert outbox, confirmed delivery
timestamp, single backup job metadata and revoked-session rejection.
No production probe, actual Telegram alert, actual dump, restore or service change
is part of this verification. The deployed site is not claimed LIVE VERIFIED.

Verification result: 302 backend regression tests and 70 frontend tests passed;
33 Python tests passed. The added worker-connection outage test also passes.
The 12-check disposable MySQL system suite passed after migration 012 in a fresh
hdwork2_test_* schema. Changed-page lint and operational frontend build passed.
All owned test containers were removed. Monitoring/routing API and durable SQL
behavior are INTEGRATION PASS in that isolated scope; dump execution is MOCK PASS,
and public tunnel health / production activation / real alerts remain unverified.
