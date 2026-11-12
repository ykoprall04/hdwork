# Courier v2 — production preparation only (707f7ec application target)

Entry: scripts/prepare-courier-v2.ps1, from a GitHub-fetched helper release, elevated Windows
PowerShell under the same DPAPI owner. No ZIP/bundle, test worktree or production test send.
It does not stop/start/register/update tasks, modify MySQL schema/grants/rows, reconcile by
sending, edit the production journal, install flags, or enable chat retention.

## Automated preparation

1. Verify HDWork2-Web runs as LocalService and the one owned Courier Node/Python pair runs
   as current DPAPI owner, current READY/state/hash/action, original identity/production plan,
   complete existing source pins, protected web environment and pinned HTTPS /login/assets.
2. Create a NEW private C:\ProgramData\HDWork2CourierV2Prep-<GUID> directory (owner,
   Administrators, SYSTEM). Export original task XML as recovery evidence only.
3. Python opens the existing journal with SQLite mode=ro and query_only. SQLite online backup
   copies committed database pages including committed WAL content into a new standalone
   journal-backup/courier.sqlite3. SHM is coordination state, not recovery data; a raw racing
   DB/WAL/SHM filesystem copy is not used. Existing WAL/SHM presence/sizes are recorded only.
   The source is not checkpointed/vacuumed/changed by this helper. Active Courier may continue
   writing, so backup is a consistent point-in-time snapshot, not a promise of no later writes.
   A disk-space guard and backup deadline fail safely; partial private copies are preserved.
4. Full integrity_check and SHA256 verify the backup. A second copy receives only the candidate
   v2 Journal initialization/DDL (WAL/FULL durability); integrity and offset/update/delivery/
   success-cache/ACK invariants are compared. Original backup and production journal remain
   untouched. No Courier main, getUpdates, Telegram send or lock reset is invoked.
5. Actual database audit uses existing native reader/writer protected bundle and Courier's
   existing DPAPI database reference, memory/owned stdin/pipe only. No token/signing secret is
   decrypted for the Courier audit. No root credential or new credential path is introduced.
   Each identity is checked, its own SHOW GRANTS summarized, then explicit READ ONLY transaction
   queries inspect schema 015/indexes, scoped outbox metadata, inbox counts and worker lease.
   No payload/body/session/customer data is queried or printed. Missing visibility may mean
   missing grants, not necessarily a nonexistent table. Missing/unsafe grants block readiness.
6. Backup journal metadata is compared with DB delivery metadata. A known durable cache matching
   backend SENT is separated from cached success needing ACK and uncertain/crash windows.
   Nothing is resent or marked complete. Live cross-store snapshots are not atomic; fresh
   stopped-state verification is still required for mutation/cutover. Review-required rows are
   held and reported; max 1000 pending rows/window, truncation blocks readiness.
7. Log ACL review checks owner/LocalService write, broad/deny rules, current PID log presence.
   It is conservative and advisory, not a token impersonation/effective-access test. No log
   ACL is modified. Current process identities/PIDs are rechecked after preparation.
8. Generate private source payloads, old-source/config backups, byte hashes, staged phase plans,
   reviewed flag templates and candidate autostart config/review with regenerated pins.
   Existing runtime files/task actions/pins stay unchanged. Dependency lock mismatch blocks
   actual credential audit; source/candidate differences remain available for release review.

Phase 1 template: deliveryMode=fifo-ack-v2; web HDWORK2_COURIER_FIFO_ENABLED=true; scheduler/
separate-I/O flags omitted. Phase 2 template: adaptiveScheduler=true, separateIo=true,
telegramLimits group=18/min/global=1/sec. No retention deletion flag or job is added.
All source payloads target 707f7ec; the phase templates stage flags, not an automatic
per-commit code rollout. A matching frontend build/manifest and coherent official executor
must still be reviewed; historical 1fc87f5 RAW LOG Apply is not a v2 activation mechanism.

## Output / next approvals

- PREPARATION_DIRECTORY identifies the private backup/report/candidate directory.
- COURIER_V2_PREPARATION_COMPLETE_NOT_ACTIVATED lists integrity, preparation SHA, candidate
  config SHA values, schema/grant/backlog/reconciliation/ACL blockers and approval steps.
- preparation.json contains detailed metadata; console shows summaries and at most 20 examples.
- No activation happens even when readyForActivationApproval=true.

Approval/review is required before executing schema 015/grant changes, assigning reviewed
FIFO sequence metadata, resolving ambiguous receipts, or cutting over/restarting the owned
services. Known cached success does not need another Telegram send. No automatic historical
backfill or journal edits occur in preparation. Failed preparation never restarts or rolls
back services. Keep original errors and the private directory for diagnosis.

A Git tag is not a SQLite backup. Keep pre-courier-v2 and this verified backup before any
merge/cutover. After any v2 traffic, downgrading to older FIFO/unknown-result handling needs
compatibility review; never infer data safety from restoring source alone.

## Validation scope

Targeted tests use only mock MySQL connections and temporary SQLite fixtures. They verify
read-only statements, exact grant/schema classification, no payload/credential output,
no resend classification, candidate hashes/phase bindings without runtime flag edits, and
online WAL backup while a fixture writer has an uncommitted transaction. The source remains
in its original schema/transaction and the copied journal alone is upgraded/checked.
Windows PowerShell AST parsing, DPAPI access, ACL and live service health run on the operator's
host; cloud test results are not production readiness results. Do not upload journal backups,
encrypted bundles, environments or credentials; share only the printed metadata summary.
