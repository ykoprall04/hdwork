# Infrastructure readiness, 2026-11-13

Development succeeds baseline 7f2b010; exact new commit/pins belong to the newly
generated private packet. Production remains READ-ONLY and NOT READY for cutover.
The administrative18 implementation and old suites were not repeated.

## Evidence and blockers

Native dummy PASS: owner-only pipe, birth/parent/task identity, default PLAN,
cooperative stdin STOP, no forced kill, task disabled, persistent startup refusal
even after dummy task re-enabled. Production identity proven: task
`\HDWork2-LiveChat-Courier`, WOC\yayan, PowerShell7916 -> node19592 -> python5720.
RestartCount=0; logon trigger and StartWhenAvailable still matter. Existing owner
has no cooperative control channel; native controller rejects it before mutation.
An approved bootstrap to the new supervisor and reviewed owner writer/DB/install/
health/rollback bindings remain BLOCKED. No claim that simulated install/TLS is
native end-to-end proof. No production task was disabled or modified.

Read-only runtime DPAPI audit 2026-11-13T04:11:45.273Z: QUEUED10, DEAD8, SENDING0,
other QUEUED0, candidate active leases0, active worker lease1. Compare both
metadata samples with sealed allowlist again before any approved window.
Writer/Courier lanes probe returns1142: UNKNOWN, not absent. Existing outbox
lacks 015/016/017. Authorized metadata owner must run
`database/manual/018_infrastructure_preflight.readonly.sql` and the existing
`015_metadata_dead.readonly.sql`; no alternate credentials are searched.

015/016/017 and minimum lanes SELECT/INSERT/UPDATE grants PASS on owned TCP-off
MySQL fixture. Production metadata/grants readiness BLOCKED. Apply in dependency
order: existing004/005/006, audit008/runtime009, reviewed015,016,017. These ALTERs
are non-idempotent: exact schema comparison before each; skip only EXACT already
applied shape, stop on partial/conflicting shape. 015 CREATE lanes then outbox
unique/head indexes; 016 adds identity/release/error JSON and unknown index;
017 adds nullable admin JSON. Old claim remains state=QUEUED; no status ENUM change
or legacy backfill. Nullable metadata preserves unknown/HOLD.

Prior estimate outbox127 rows/~160KiB is planning evidence only. All ALTERs need
metadata locks; index build scans table and may rebuild with version-dependent
DDL algorithm. No precise lock time is promised. Owner should use bounded session
lock_wait_timeout and approved window, inspect long transactions first; timeout,
unexpected table growth, partial schema or incompatible old claim => STOP.

New reusable backup module PASS: actual mysqldump --single-transaction --quick
--skip-lock-tables --no-tablespaces --set-gtid-purged=OFF, SQLite read-only source
backup API, integrity_check, SHA256, all table counts, restored MySQL CHECK TABLE,
restored SQLite counts. Restore refuses an existing database and requires owned
temporary datadir + TCP disabled. Owner auth only via existing login-path or
strict fixture pipe; no credential files inspected. Non-InnoDB/unexpected table
coverage stops. Private dump contains data; reports expose metadata only.
Production consistent MySQL+SQLite pair remains pending approved Courier AND
writer fence; online snapshots from different times are not a recovery pair.

Executor now requires explicit scoped operator approval bound to plan/commit/
decision/native-config SHA, expiring within1hour; --execute alone cannot proceed.
Rechecks cohort after stop/fence. Source pins include all native/backup code.
Default offline PLAN never loads owner controls. Native wrapper requires pinned
owner bindings and writer-fence verification. Failures retain sender fence;
runtime-only rollback must retain all DB/schema/admin audit and flags OFF.
No automatic schema/data restore. Possible external send => operator STOP.

## Approval order (PLAN ONLY)

1. Owner metadata evidence and review bootstrap/writer fencing + pinned bindings.
2. Reapprove new SHA/FE+BE/native config/plan and scoped approval file; select window.
3. Gate exact18/no other queue/no duplicate -> clean Courier+writers stop/fence.
4. Paired backup+offline restore proof -> conditional015/016/017 -> minimum grants.
5. Existing administrative18 transaction, NO fifo_release -> exact code flags OFF.
6. Pinned health/TLS+rollback proof -> separate FIFO, scheduler, separateIo approvals.

Execute command remains PLAN_ONLY until ALL blockers resolved:
`node scripts/execute-courier-cutover.js --plan <ABSOLUTE_PINNED_PLAN> --plan-sha256 <SHA256> --expected-head <NEW_SHA> --approval <ABSOLUTE_APPROVED_FILE> --journal <NEW_PRIVATE_JOURNAL> --execute`
This is not authorization to run it. No fabricated host binding or placeholder
approval is shipped as executable production configuration.
