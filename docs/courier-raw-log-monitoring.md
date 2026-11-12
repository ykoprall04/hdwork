# Batch 1 — RAW LOG & Real-Time Monitoring

Latest activation procedure: [single-attempt RAW LOG deployment](raw-log-single-attempt-deployment.md).
Its verified ZIP entry point supersedes the earlier preparation-only handoff below.

Status: implementation for development branch only. No production access, deployment,
restart, snapshot edit, repinning, database migration, push or real Telegram send is
performed by these tools. Logging is opt-in. This batch does not optimize delivery.

## Audit and scope

Previously `serve` caught errors and printed only a generic line. `JsonTransport`
normalized HTTP/network errors, losing original traceback context. Production launcher
silently drained Python stderr, read READY stdout, and the Scheduled Task owner drained
Node stdout/stderr without persistence. Task runner saved redacted state every 5s but
no historical diagnostics. Chat routes masked exceptions in API responses. Inbox worker
reported a generic failure. MySQL handler failures could become 503 without original
driver details. These API responses and owner lifetime/STOP behavior remain intact.

Instrumentation now records technical events directly at these sources, **before**
normalization where possible. It does not rely on a PowerShell terminal being open.
Node stdout/stderr and Python streams are counted, not copied verbatim: arbitrary
console output cannot safely be assumed free of customer data. Known lifecycle events
are separately structured. Owner logs START/FAILED/STOP; errors caught inside Node/Python
include sanitized original frame locations. Owner failures retain safe script basename/line, HRESULT and allowlisted rejection
codes; PowerShell source/argument lines are excluded. Unknown raw stream text is not retained.

“RAW LOG” here means unsampled technical JSONL, **not unredacted payload dumps**.
Exception free text, source lines, absolute paths, SQL/parameters, HTTP URLs/headers,
Telegram descriptions/bodies, credentials, sessions, username, chat/customer identifiers
are excluded. Original Node frame basename/line/column and Python frame basename/line/
function are retained. Codes such as MySQL `ER_LOCK_DEADLOCK`, errno, HTTP status and
retry-after remain. Telegram error text that could echo message content is not stored;
use status plus stage/result code. This is a deliberate privacy boundary, so an arbitrary
exception message cannot be reconstructed from these logs.

## Recorded stages

- CHAT_SEND / CHAT_COMMITTED: request UUID, order UUID and outbox UUID; success after commit.
- CHAT_HISTORY / CHAT_CONVERSATIONS: server-side duration; CHAT_HTTP_FAILURE for handled errors.
- MYSQL_POOL_ACQUIRE / BEGIN / EXECUTE / COMMIT / ROLLBACK / TRANSACTION: durations and errors;
  no SQL text or extra database statements. Every existing execute in a store transaction
  is timed. Read-only history query internals are represented by total service duration.
- OUTBOX_ENQUEUE / SELECTED: outbox UUID, attempt, queue age from existing `created_at`.
  `PRECOMMIT` is explicitly not durable success. Claim SELECT adds only created_at,
  not a join, lock, index, predicate, ordering or extra round trip.
- ROUTING / TELEGRAM_POLL / JOURNAL_INCOMING / INBOX_FORWARD / JOURNAL_INBOX_ACK.
- OUTBOX_CLAIM / AUTHORIZE / JOURNAL_BEGIN / TELEGRAM_SEND / JOURNAL_RESULT / DELIVERY_RESULT.
- ACK / JOURNAL_ACK_FINISH: Telegram acceptance and backend ACK are distinct.
- COURIER_CYCLE / CYCLE_RETRY / COURIER_NOTICE / INBOX_RETRY / INBOX_PROCESS_FAILURE.
- OUTBOX_BLOCKED: SEND_DISABLED, STOPPED, COOLDOWN (remaining wait) or ACK_PENDING.
  Empty claim means NO_ELIGIBLE_MESSAGE, **not proof the database has no held backlog**.
- TASK_STATE and OWNER lifecycle events. State heartbeat remains 5s; no extra worker.

Each instrumented call carries a generated trace UUID, inherited by nested async stages
(Node AsyncLocalStorage / Python contextvars) without changing API headers.
Correlation is the existing outbox UUID across enqueue → claim → send → ACK; CHAT_COMMITTED
links request/order UUIDs. Inbox receipt UUID links accept/selection and journal receipt.
No Telegram chat/topic/message ID is logged. This batch does not change API contracts or
add browser instrumentation: click-to-backend and DOM latency still need browser timing.
Cross-process durations use monotonic clocks locally; UTC timestamps correlate phases,
so host clock jumps can affect inferred inter-process delays/queue age. DB timestamp
interpretation follows the existing MySQL driver timezone; verify UTC before production.

## Files and retention

Default Windows directory: `C:\ProgramData\HDWork2\Logs`.
Override with `HDWORK2_LOG_DIRECTORY`, consistently on owner, Node web and Courier processes.
Names: `hdwork2-YYYY-MM-DD-{node|python|owner}-PID.jsonl`. Day boundary is **00:00 WIB**;
record timestamps use UTC ISO timestamps with milliseconds. Separate process files avoid
cross-runtime append locks. Retain today plus previous six WIB calendar days. Node/Python
prune only matching managed filenames on their first write each new day; an idle/stopped
service performs no cleanup. Owner files are included in this cleanup. This is calendar
retention, not an exact sliding 168-hour TTL. Chat/order/journal/database data is untouched.

Writers use bounded queues (2048 records), background disk writes and no per-record fsync.
Node batches up to 128 records; Python uses a background writer. Disk failure never retries
Telegram or throws into delivery. Full queues/storage failure increment drops; on recovery
LOG_DROPPED reports the count. This prioritizes delivery over guaranteeing logs on a full
or broken disk. Final abrupt termination/power loss can lose buffered events. Python orderly
exit attempts a bounded 2s drain; Node task shutdown drains pending async writes.
Disk operations have OS-dependent latency; no hard real-time guarantee. Check free space,
last log timestamp and LOG_DROPPED during rollout. There is no automatic size quota per day. Full per-stage logs can produce hundreds
of thousands of records/day even when mostly idle; measure bytes/day and reserve seven
days of space before the production soak. File count grows with process restarts.

Provision owner-only/SYSTEM Windows ACLs **before enabling**. POSIX file mode is not a Windows
ACL. Dedicated directory must not be writable by other users or contain reparse links;
log leaf links/hardlinks are rejected in Node/Python. Do not reuse a shared directory.
Antivirus/file locks can cause transient losses. Retention frees log files, not chat data.

## Local checks (offline)

```powershell
npm test
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONPATH = 'courier_bot'
python -m unittest discover -s courier_bot/tests
.\scripts\test-courier-log.ps1
node .\scripts\benchmark-courier-logging.js
```

Tests create synthetic files under temporary directories only. Never run a Courier as a
logging test. The 24h test advances a synthetic clock; it is not a 24h production soak.

Linux benchmark, 10,000 synthetic events: emit p50 0.00194ms, p95 0.01488ms,
max 3.968ms, enqueue + flush 106.96ms, zero drops. This measures the logging path,
not added Telegram latency or Windows disk performance. Full tests can contend for CPU.

## Activation and `courier-log` (only after deployment approval)

Do not copy these files into existing pinned production snapshots. The old autostart
preparer has historical release/patch constants: it is **not a generic rollout tool for
this batch**. Prepare a new reviewed release containing the new Node/Python modules and
launcher/owner, regenerate approved manifests/config hashes through the release workflow,
and keep complete original rollback artifacts. This batch does not ship or execute an
automatic production cutover. A Windows offline check and compatible release packet are
required before production activation.

1. In the future approved release, use the existing DPAPI owner identity. Provision the
   dedicated directory; install viewer from that release:

   ```powershell
   .\scripts\install-courier-log.ps1
   ```

   This installs only viewer files in `C:\ProgramData\HDWork2\Tools`, secures the dedicated
   directories and adds a dot-source line to CurrentUserAllHosts profile. It does not
   enable logging, change autostart registration or start/stop any service. Review ACL
   changes before running it on an existing shared Root. A different existing viewer
   is rejected: use a new reviewed tools root. `-NoProfile` shells must dot-source explicitly.

2. Configure the approved owner/web launcher environment:

   ```powershell
   $env:HDWORK2_RAW_LOG_ENABLED = 'true'
   $env:HDWORK2_LOG_DIRECTORY = 'C:\ProgramData\HDWork2\Logs'
   ```

   These assignments affect only that process and future children. They do not enable an
   already running Scheduled Task/service. Persist them in the reviewed launch environment,
   never in a credential bundle; the owner forwards only these two logging settings plus
   ProgramData. The Node backend logs through its process environment, Python through its
   curated child environment. Do not assume an interactive shell updates the hidden owner.

3. Perform the separately approved normal one-Courier stop/start with new pinned artifacts,
   preserving same bot identity, journal, activation boundary, lease and backend contract.
   Do not start a second poller, change getUpdates offset or delete journal/lease data.

4. In PowerShell:

   ```powershell
   courier-log
   ```

   Current terminal without installed profile:

   ```powershell
   . .\scripts\courier-log.ps1
   courier-log
   ```

   Shows latest 100 lines across managed files and follows writes/new daily files with
   250ms viewer polling. Ctrl+C exits only the viewer. Viewer never opens owner stdin,
   invokes task control or signals Courier. Closing terminal does not stop file writers.
   Custom directory: `courier-log -Directory 'D:\DedicatedHDWorkLogs'`.

5. Verify OWNER/TASK and Python cycle records, source/PID coverage, safe codes/tracebacks,
   no secrets, daily rollover, no LOG_DROPPED, unchanged health/lease and existing ACK behavior.
   Use a separately authorized operator test for real traffic; this work does not send it.
   Monitor for 24 real hours before concluding production overhead/latency results.

## Safe example (synthetic)

```json
{"timestamp":"2026-11-12T03:00:00.123Z","source":"node","pid":100,"event":"CHAT_COMMITTED","correlationId":"12345678-1234-1234-1234-123456789abc","status":"QUEUED"}
{"timestamp":"2026-11-12T03:00:02.124Z","source":"node","pid":100,"event":"OUTBOX_SELECTED","correlationId":"12345678-1234-1234-1234-123456789abc","queueAgeMs":2001,"attempt":1,"status":"PRECOMMIT"}
{"timestamp":"2026-11-12T03:00:02.300Z","source":"python","pid":101,"event":"TELEGRAM_SEND","correlationId":"12345678-1234-1234-1234-123456789abc","status":"OK","durationMs":176}
{"timestamp":"2026-11-12T03:00:02.340Z","source":"python","pid":101,"event":"ACK","correlationId":"12345678-1234-1234-1234-123456789abc","status":"ERROR","durationMs":40,"error":{"type":"TransportError","message":"[redacted]","status":503,"retry_after":0,"traceback":[{"file":"clients.py","line":44,"function":"settle"}]}}
```

These values illustrate the schema only; they are not measured production latency.

## Rollback

If only the viewer fails, close it; delivery stays active. To remove its profile entry,
remove only the installed dot-source line; preserve all unrelated profile content.
If logging overloads disk/CPU or exposes a missed sensitive field, stop rollout, restrict
access to affected log files and review the exact field. Do not change delivery retries
or clear the journal to troubleshoot logging. Disable logging in the reviewed launch
environment and apply through the separately approved normal release restart. If code
rollback is necessary, restore the complete prior release/owner/task manifests and pins
as one consistent set via existing rollback procedure. Never hand-edit a live pin or
start old/new Courier simultaneously. Preserve diagnostic evidence securely; no automatic
rollback/deletion runs in this batch.

## Validation limits

Linux automated Node/Python suites and synthetic clock/disk checks are available here.
PowerShell/Windows ACL, DPAPI Scheduled Task lifecycle and a real 24h soak must be checked
on Windows using mocks first; PowerShell is unavailable in this cloud environment.
No database schema migration or permission grant is needed for instrumentation.

## Validation recorded in development

- Node full suite: 497 passed, 0 failed.
- Python full suite: 57 passed, 0 failed.
- Targeted Node logger + autostart regression after final redaction changes: all passed.
- `git diff --check`: passed.
- Windows PowerShell script/ACL checks: provided, not run here (no PowerShell installed).
- No real 24-hour soak or production latency claim.

## Changed files

Runtime:
- `courier_bot/courier/raw_log.py` (new)
- `courier_bot/courier/__main__.py`
- `courier_bot/courier/durable_runner.py`
- `courier_bot/courier/http.py`
- `src/observability/raw-log.js` (new)
- `src/chat/routes.js`
- `src/chat/service.js`
- `src/courier/mysql-store.js`
- `src/courier/inbox-worker.js`
- `src/courier/integration-app.js`
- `scripts/courier-task-runner.js`
- `scripts/run-courier-scheduled-owner.ps1`
- `scripts/run-production-live-chat-courier.js`

Viewer, documentation and validation:
- `scripts/courier-log.js` (new)
- `scripts/courier-log.ps1` (new)
- `scripts/install-courier-log.ps1` (new)
- `scripts/test-courier-log.ps1` (new)
- `scripts/benchmark-courier-logging.js` (new)
- `tests/courier-raw-log.test.js` (new)
- `courier_bot/tests/test_raw_log.py` (new)
- `docs/courier-raw-log-monitoring.md` (new)
