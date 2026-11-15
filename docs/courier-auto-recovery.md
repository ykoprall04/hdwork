# Courier V2 bounded startup recovery

Source preparation only. Production snapshot/task remain unchanged. No Web,
MySQL, bot identity, journal, offset, FIFO or writer-fence migration is required.

## Rules

Previously getMe/getWebhookInfo had no retry (HTTP timeout 10 seconds, Node READY
deadline 30 seconds). Both native supervisor and native owner wrapper could
return success after a child failure. Active task restart count is zero.

`contracts/courier-startup-recovery.json` now defines four identity attempts,
10 seconds per request, delays 2/4/8 seconds plus up to one second jitter, and
120 seconds for Node READY. Two requests per attempt give a nominal worst-case
identity budget of 97 seconds. Identity verification never polls or sends.

Only known transient network exceptions retry: timeout, temporary DNS failure,
connection reset/refusal/abort and equivalent OS network errors. Certificate,
response-format, HTTP/token/identity/webhook, configuration, journal and ownership
errors do not retry during startup. HTTP 401/403/409 are never identity retries.
Startup exhaustion uses exit 75; permanent startup failures retain exit 1.

Unexpected Python exit after READY is retryable. For Node exit 1, only a READY
receipt bound to the exact Node PID, runtime config hash and start time can prove
a post-start crash; missing/stale proof fails closed. The native supervisor
returns nonzero for unexpected child exits, including unexpected exit 0.

The existing scheduled-owner wrapper adds pinned opt-in `-Recovery`, requiring
`recovery.enabled=true` in native config. It returns nonzero only for retryable
native exit 75. Permanent failures emit PERMANENT_FAILURE_NO_RESTART and return
zero from this policy wrapper intentionally, because Task Scheduler cannot filter
exit codes. Native failure state/exit still records the failure. A zero task
result is not proof of readiness. No additional permanent launcher is added.

Future policy: three task retries, 60 seconds apart, IgnoreNew (maximum four
starts in one retry series). No watchdog resets that budget. IgnoreNew, native
mutex, Python OS lock and worker lease remain. The owner holds its mutex until
Node's direct children, including Python, exit. If drain stalls, it waits; it does
not kill a sender or start a second owner. Abandoned ownership stays blocked.

## Offline tests

```powershell
$env:PYTHONPATH=Join-Path $PWD 'courier_bot'
python -B -m unittest discover -s courier_bot/tests -v
node --test tests/courier-auto-recovery.test.cjs
node --test tests/courier-startup-trace.test.js tests/courier-startup-diagnostics.test.js tests/courier-fifo.test.js tests/courier-fifo-release.test.js tests/b2c-commands.test.js tests/invalid-order-worker.test.js tests/courier-writer-config.test.cjs
```

Mock transports and owned temporary processes only. No real task is created or
modified; no credentials, database or Telegram API are accessed. Existing offset,
journal replay, FIFO/ACK/INVALID and idempotency regressions are included. Actual
Task Scheduler retry integration remains a later controlled activation check.

## Later approved activation

1. Record active task XML/settings/action pins, immutable snapshot, runtime and
   native config hashes, process identities and the existing read-only
   queue/journal baseline. Retain the current INVALID-compatible rollback.
2. Use existing snapshot staging, overlaying only this recovery change set on
   the active Courier snapshot. Do not import unrelated Web/VLAN/main changes.
   Include the new JSON contract in sourceHashes; recompute runnerSha256, source,
   native child/supervisor/launcher byte hashes, runtime/config/task pins. Keep
   protected files, plan, identity and external journal/lock/offset paths intact.
3. Bind the existing wrapper as native launcherScript, pin launcherSha256, set
   recovery.enabled=true, and use its existing runtime config arguments. Task
   action ends with `-Recovery`; the native control tool recognizes this suffix:

   ```text
   -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "<snapshot>\scripts\run-courier-scheduled-owner.ps1" -Config "<runtime-config>" -ConfigSha256 <runtime-SHA256> -ControlConfig "<native-config>" -ControlConfigSha256 <native-SHA256> -Recovery
   ```

4. Through existing cooperative stop/fence, disable the owned task for handoff
   and wait for old supervisor/Node/Python to exit. Do not force a second owner.
5. With reviewed pins/action and the task stopped/disabled, plan/install policy:

   ```powershell
   powershell.exe -NoProfile -File scripts/configure-courier-recovery.ps1 -ControlConfig "<native-config>" -ConfigSha256 "<native-SHA256>"
   # Apply only with separate activation approval:
   powershell.exe -NoProfile -File scripts/configure-courier-recovery.ps1 -Mode Apply -ControlConfig "<native-config>" -ConfigSha256 "<native-SHA256>"
   ```

6. Complete existing fence release/start once. Verify fresh identity/lease READY,
   one process chain and successful polling; audit backlog/FIFO/ACK preservation.
   No offset reset, terminal-item replay, test order or production fault injection.

## Rollback

Disable automatic retry during approved rollback, use cooperative stop/fence and
wait for the whole candidate chain to end. Restore previous task action/settings
and matching snapshot/config pins together. Retain the same journal/offset and
new delivery/ACK records; do not restore stale database/journal backups. Start
the previous INVALID-compatible snapshot once and verify identity/lease/polling.
If ownership/drain is uncertain, retain the fence and report instead of restarting.
