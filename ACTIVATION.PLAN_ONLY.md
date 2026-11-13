# Infrastructure amendment, 2026-11-13 (PLAN ONLY)

STOP: current legacy task has no external cooperative channel; do not use task
termination or process kill. Review/approve a bootstrap to the new owner-only
supervisor and persistent task/startup fence before cutover can be scheduled.
Pinned owner bindings must cover writer quiescence, DB capabilities, existing
owner login-path backup configuration, exact flags-off install, TLS health and
runtime/config rollback. No placeholder binding is a production adapter.
Run owner metadata preflight `database/manual/018_infrastructure_preflight.readonly.sql`;
1142 is UNKNOWN, never absence. See `INFRASTRUCTURE-READINESS.md`.

Regenerate pins from new clean SHA and include native config+owner bindings
through `prepare-courier-cutover.js --infrastructure <ABSOLUTE_PINNED_MAP_JSON>`.
Without both pinned entries hostAdapterReady remains false. Default executor
is offline PLAN. Real invocation additionally requires `--approval <ABSOLUTE_FILE>`
and `--execute`; approval must bind new SHA, plan SHA, decision/native config SHA,
operator, scope CUTOVER_FLAGS_OFF_ONLY, approved=true and expiry within1hour.
Never reuse baseline7f2b010 plan or approvals. Recheck cohort after stopped fence.
Paired backup module uses SQLite backup API and mysqldump single-transaction;
restore targets only a verified owned TCP-off temporary server with absent DB.
Production pair requires all writers fenced throughout; checksums+counts+restore
evidence are mandatory. Failure after closure retains sender fence and admin
history; runtime rollback only. Schema/data restoration requires separate review.
Separate FIFO/scheduler/separateIo activation approvals remain mandatory.

# DEC-20261112-01 — commands PLAN ONLY, not executed

Source is the NEW commit containing this file, not f399b0d. Regenerate plan/pins
after commit on an exact clean GitHub checkout. Do not reuse old backend hashes.

1. Owner read-only metadata confirms exact18, cutoff/attempt/error/routing digests,
   no active candidate lease, no unlisted QUEUED/SENDING and no duplicate Courier.
   Unlike the old generic gate, the ten sealed QUEUED are expected pending
   administrative closure; they are never dispatched/drained. Other active rows
   stop the cutover. An unknown metadata account/lanes installation is STOP.
2. Owner coordinator must own a verified graceful-stop channel and writer fence;
   current legacy stdin cannot be guessed/attached. Do NOT use task kill as a
   fallback. Stop Courier and owned writers only, no other bots. Pair backups and
   verify restore while all those writers remain stopped. Nothing is stopped now.
3. In an existing authenticated DDL session, ONLY after exact metadata review:
```sql
SET SESSION lock_wait_timeout=5;
-- 015 only if fully absent; if partial/already present, STOP for a reviewed variant.
SOURCE database/manual/015_hdwork2_fifo_ack.review.sql;
SOURCE database/manual/016_fifo_release.PLAN_ONLY.sql;
SOURCE database/manual/017_administrative_closure.PLAN_ONLY.sql;
SOURCE database/manual/015_fifo_lane_grants.review.sql;
```
These are relative to the approved new checkout in the owner client. No statement
is run by this document. DDL is non-idempotent/per-statement commit, not one
rollbackable file. Worker/Courier still stopped. Inspect after every DDL; errors
or partial shape => STOP. Keep reader grants unchanged, no lanes DELETE.
Manual closure requires metadata SELECT, UPDATE(state,administrative_closure),
INSERT audit and a worker-row locking read in an owner-authorized session. Do not
silently widen the normal writer's UPDATE(id) privileges.
4. Separate DRY-RUN using the sealed new allowlist and owner-managed session:
```powershell
node scripts/close-courier-administratively.js --session '<ABSOLUTE_APPROVED_SESSION_ADAPTER>' --allowlist '<ABSOLUTE_ALLOWLIST_JSON>' --allowlist-sha256 '<LOGICAL_SHA256>'
```
Only within the verified cutover barrier, with the exact decision approval:
```powershell
node scripts/close-courier-administratively.js --session '<ABSOLUTE_APPROVED_SESSION_ADAPTER>' --allowlist '<ABSOLUTE_ALLOWLIST_JSON>' --allowlist-sha256 '<LOGICAL_SHA256>' --barrier '<ABSOLUTE_QUIESCENCE_AND_BACKUP_RECEIPT>' --execute
```
No closure occurs without --execute and fresh paired-backup/quiescence proof;
the standalone receipt also names a pinned backupReceiptFile; both backup files
and restored row-count evidence are verified before loading the owner session.
the DB worker row is locked and must have no active lease. Any rowcount/metadata
mismatch rolls back all18. This NEVER writes fifo_release. Do not run the old
abandonment FIFO-release command. Separate per-ID FIFO release needs a different
explicit review; no automatic reopening of unknown HOLD is authorized.
5. File-only pinned plan generation after commit (frontend tree is unchanged from
the official f399b0d build; verifier checks manifest and source-tree provenance):
```powershell
node scripts/prepare-courier-cutover.js --source '<EXACT_NEW_CHECKOUT>' --release '<NEW_PRIVATE_RELEASE_DIRECTORY>' --frontend '<VERIFIED_FRONTEND_DIST>' --frontend-sha256 '<FE_SHA256>' --allowlist '<SEALED_ALLOWLIST>' --expected-head '<NEW_SHA>'
node scripts/execute-courier-cutover.js --plan '<RELEASE>/cutover.PLAN_ONLY.json' --plan-sha256 '<PLAN_SHA256>' --expected-head '<NEW_SHA>'
```
The second command is offline PLAN by default. Without an explicitly pinned
owner host adapter, --execute is rejected. To bind one later, regenerate/review
the plan with --host-adapter and --host-adapter-sha256; never search for secrets.
After all independent approvals, the real execution command is:
```powershell
node scripts/execute-courier-cutover.js --plan '<APPROVED_RELEASE>/cutover.PLAN_ONLY.json' --plan-sha256 '<APPROVED_PLAN_SHA256>' --expected-head '<NEW_SHA>' --journal '<NEW_PRIVATE_RELEASE>/execution-journal.json' --execute
```
The tested engine orders gate/stop/paired backup/schema/grants/close/install/health;
closure is NOT a pre-stop operation. Initial flags keep FIFO, release, scheduler,
separateIo, send, poll, worker ALL OFF. The sender remains stopped at completion.
Production native coordinator is NOT supplied/verified in this revision. This is
an explicit STOP, not permission to substitute Copy-Item/task restart.
6. Separate approvals for phase1 deliveryMode=fifo-ack-v2 + fifoRelease, phase2
adaptiveScheduler, phase3 separateIo, with health and source/config/FE/BE pins at
each stage. No automatic phase activation command or restart is executed here.

Rollback: verified old runtime/config, flags OFF and sender STOPPED. Preserve
closed18 and their DB audit; never blindly restore a pre-closure dump that removes
the operator decision or revives a sender. Backup pairs are retained for a
separate owner-reviewed disaster recovery. External-effect risk => STOP, no data
rewind/resend. A Git tag/source downgrade is not data recovery.
