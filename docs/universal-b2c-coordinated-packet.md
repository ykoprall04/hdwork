# Universal B2C coordinated packet — verified Windows baseline

Application: 126b2defd524335d05ea8b364a90b2da09202459. The operator's complete inspection establishes migration014=ALREADY_PRESENT, schema/grants compatible, sharedGroupsWeb=true, courierRoutingMode=database, three active verified mappings (TIAL1/TIAL2/SOLVER1), candidate universal coverage and a healthy existing lease. The actual worker still runs the old three source files. No migration or flag change is needed.

## Executable approach and exact changes

Entry point: `scripts/deploy-universal-b2c.ps1`; file-only engine: `scripts/universal-b2c-release.js`. This follows the existing stopped-services/pinned-runner patch mechanism used by the reviewed shared-groups release, adapted to the now-separate web/Courier snapshots. It does not invoke the old 827bb86 Apply or ccc646a activation helper.

Stage creates a NEW `C:\ProgramData\HDWork2UniversalB2C-<GUID>` with operator/Administrators/SYSTEM FullControl only. It checks native metadata through the existing protected read-account/stdin mechanism, verifies the reported config/plan/mapping/frontend/source hashes exactly, checks unchanged Node/Python parser/routing dependencies against immutable Git, and saves:

- Payload for the exact three changed source files; raw-byte backups from both web and Courier.
- Original config/review, candidate config/review and both task XML backups.
- Sanitized inspection metadata, retained frontend inventory, protected bundle/environment hashes and unchanged dependency/launcher hashes.
- Immutable plan.json plus its separate SHA-256, and mutable activation.json initially STAGED_NOT_STARTED.

Candidate config changes only three sourceHashes; the reviewed config digest changes accordingly. The original production plan, cutoff, bot/owner, wrapper/runner source, source journal, journal/polling-lock paths, environment, encrypted bundle, frontend 6060c1e, dependencies and DB are unchanged. No database backup/restore is needed for this source-only change; mapping digest is bound and mappings are not written. No historical records or old queues are replayed. Packet files are written as bytes under the private directory, not copied with source security descriptors.

Apply updates those three source files on both existing snapshots ONLY after both services have stopped. Atomic replacements inherit their existing parent ACLs; Stage/Apply reject explicit/protected per-file ACLs requiring a separate review instead of silently losing them. Original source/config/review bytes are retained in the packet. Only the existing Courier task's ConfigSha256 argument is changed; web action, task principals/triggers/settings and owner remain the same. Tasks are temporarily disabled during cutover to prevent restart-on-failure races, then re-enabled after install. Both must originally be enabled; unrelated/legacy tasks are never changed.

## Sequence and gates

1. Stage: no task/runtime/DB writes. Output `UNIVERSAL_B2C_STAGED_NOT_STARTED`, RELEASE_DIRECTORY and RELEASE_PLAN_SHA256. Existing packet directories are never overwritten.
2. Verify: validates the immutable plan, every payload/backup binding, full old Courier pins, unchanged dependency/environment/cipher/plan/frontend/launcher bytes, exact task actions/owner, native schema and mapping digest. No restart.
3. Apply requires `-ApproveCoordinatedCutover`, the exact directory/hash and existing global deployment mutex + exclusive frontend lock. An existing/stale lock is rejected, never removed automatically. Already-attempted packets are rejected.
4. Disable/stop ONLY the owned Courier task. Verify recorded Node/Python PIDs and owner wrapper have exited. Read native metadata while the old web remains healthy; wait for its actual lease expiry (maximum expected 65 seconds), then verify it is inactive. No lease reset, forced lock deletion or second poller.
5. Disable/stop the owned web task and confirm its processes exited. Bind a fresh stopped-Courier/schema/mapping proof (<=5 minutes), then journal APPLYING before atomic source/pin writes. Verify all new source pins. The controller never kills an unrelated process.
6. Mark WEB_START_ATTEMPTED, enable/start web; require fresh READY, LocalService process, native read/write pools and the same pinned HTTPS index/assets. Frontend files are not replaced.
7. Mark COURIER_START_ATTEMPTED BEFORE enable/start. Require fresh Node/Python READY, parent relationship/owner, normal protected-startup verification, native active lease, same schema/mapping digest and all three deployed source files matching target on both snapshots. Only then mark ACTIVE and output UNIVERSAL_B2C_ACTIVE. No synthetic Telegram messages are sent; the authorized existing Courier resumes its normal production duties.

## Recovery semantics

Before any new Courier start attempt, exceptions automatically stop owned processes, restore original source/config/review and original Courier action, start web then old Courier, and verify the baseline. A successful recovery reports UNIVERSAL_B2C_ROLLED_BACK_BEFORE_NEW_COURIER_START; the failed activation still returns an error. Restoring schema/data/journals is never part of recovery.

After any new Courier start attempt, universal orders may already exist. Automatic downgrade to restricted routing is prohibited. Failure stops/disables the owned Courier, retains the new universal/fencing-capable source/pins and all queues/journal, marks RECOVERY_REQUIRED_NO_DOWNGRADE and reports a post-start recovery error. It does not report success or silently restart the old poller. Preserve packet/state; investigate and forward-recover compatibly.

`-Mode Status` verifies packet/current pins and retained HTTPS frontend, and prints journal + task states. `-Mode RecoverPreStart -ApproveCoordinatedCutover` is restricted to pre-Courier states and rejects active/post-start packets BEFORE stopping services. It also supports retry when original files were restored but baseline startup failed. Do not delete activation.json or edit a plan/hash to force retry.

## Operator handoff

Use the already-approved production activation, from elevated PowerShell under the same DPAPI owner. Fetch/check out the new helper commit in the existing universal worktree; no dependency changes or frontend rebuild are required. Run the routing/inspection/packet fixture tests. Stage, capture both returned values, run Verify and then Apply with those exact values. A failure at any preparation check stops the sequence before service operations.

All schema checks use the existing native read account and read-only transaction; no root, migration, credential changes or SQL writes. No tunnel or remote-production access is introduced. Cloud tests exercise the real file transaction with disposable files and injected metadata, including partial-write recovery, lease/proof gates, drift/tamper rejection and permanent post-start downgrade prevention. PowerShell task/DPAPI/ACL boot behavior remains a Windows host verification; no cloud result is claimed as actual activation.

Verification record: full Node suite 488 PASS. The 14 packet/inspection fixtures PASS again after final proof/report/controller refinements. Application sources and dependencies remain identical to 126b2de; Python application suite previously passed 52 tests and is unchanged. PowerShell execution/ACL inheritance and actual task startup are deliberately verified by Stage/Verify on the Windows host before Apply; they have not been executed from cloud.
