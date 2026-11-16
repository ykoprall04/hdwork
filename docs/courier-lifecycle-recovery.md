# Courier lifecycle logging and recurring recovery

Development branch: `feat/courier-lifecycle-recovery`. This package is not
installed in production. It reuses the owner launcher, native supervisor,
Node/Python polling loggers and the existing Courier Scheduled Task.

## Changes

- The pinned runtime logging configuration is read before native delegation.
  Logging variables survive the supervisor's environment whitelist. No raw
  child stdout is copied into owner logs; Python's existing redactor/logger
  remains responsible for Telegram output.
- Native state is refreshed every 15 seconds while waiting for control requests.
  This is supervisor liveness, not proof that polling/lease/ACK is healthy. A
  READY state older than 45 seconds must be treated as stale by an operator.
- Owner/native events carry PID, child PID, transition and exit code. Task
  Instance ID is resolved from matching Task Scheduler events, otherwise UNKNOWN.
  Startup origin is TASK_OR_OPERATOR; it is not guessed to be boot versus timer.
- Abrupt previous shutdowns are UNKNOWN. Incident snapshots contain session ID,
  network availability, battery state and a bounded set of nearby event IDs and
  times. They exclude event messages, addresses, usernames and command lines.
  No code can reliably log from inside a process after Windows terminates it;
  evidence is collected on the next launch instead.
- Owner files rotate at 5 MiB; Courier Node and Python files at 10 MiB, keeping
  one previous file. Thresholds may be exceeded by the current write batch.
  Managed logs expire after seven days. Other consumers of the shared Node
  logger keep their existing unlimited-size default. The read-only viewers
  recognize rotated files and track file identity to avoid replaying history.
- A permanent native child failure creates `permanent.failure.json` beside
  the native control config. Subsequent launches refuse to start, even if the
  marker is malformed or belongs to an older config. It is never auto-cleared.
  Diagnosing and authorizing removal is an operator action, outside this phase.
- An abandoned mutex alone no longer prevents recovery forever. Previous
  Node identity and its descendants are checked before a new child is started.
  A living/draining old child blocks the launch. Mutex, Python OS lock, worker
  lease and existing maintenance/startup fence are retained.

## Task preparation, not production activation

`scripts/configure-courier-recovery.ps1` remains Plan by default. Apply still
requires the approved exact action/pins/owner and a stopped, disabled task.
Interactive principals are refused. It prepares the SAME task with:

- boot trigger delayed two minutes;
- recurring five-minute trigger;
- IgnoreNew, three retries sixty seconds apart;
- no execution time limit, StartWhenAvailable, no battery stop restriction.

The task remains disabled during preparation. Readback checks task settings and
trigger XML. IgnoreNew suppresses extra scheduled starts while the existing
owner is running; this is not a watchdog that kills a hung owner. Persistent
network failures may retry in later five-minute windows, but permanent failure
and maintenance fences continue blocking starts. No journal/offset is restored.

## Required next phase, not executed here

1. Preserve the current task XML, immutable Courier snapshot, native/runtime
   configs and their exact hashes using the existing staging/handoff procedure.
   Regenerate source/config pins for this package; do not edit active snapshots.
2. Validate the intended non-interactive account using the existing launcher in
   an isolated approved probe: identity, loaded profile, CurrentUser DPAPI access,
   log/control directory ACL, binaries and all source pins. Do not change the
   production principal or assume S4U/LocalService can decrypt the user's bundle.
   If validation fails, stop. Keeping Interactive/manual start is the safe interim
   option; boot without login remains unavailable in that mode.
3. Verify the candidate owner log and supervisor heartbeat in the isolated probe
   before preparing periodic recovery. Production startup must also show real
   Node/Python logs before recurring triggers are enabled. Stage/enable the
   triggers in that order using the existing task tools; the preparation script
   by itself is not evidence of successful non-interactive validation.
4. With fresh queue/ACK/lease checks, use official cooperative handoff. Preserve
   journal, pending messages, offset, writer fence and configuration. Never clear
   a maintenance/permanent-failure marker to make activation succeed.
5. Verify exactly one supervisor/Node/Python, identity and lease, natural polling,
   new owner heartbeat/logs and unchanged ACK/offset invariants. No test Telegram
   messages or deliberate production crash.
6. On failure restore the saved task XML, snapshot/config binding and matching
   pins through existing rollback, after proving the candidate chain has ended.
   Do not roll back journal, ACK, queue data or offsets. Do not touch Web/PM2.

Offline tests use temporary fixture processes and mock Task Scheduler calls.
They establish code behavior, not real Task Scheduler retries, boot behavior,
DPAPI/profile/ACL compatibility or production recovery.
