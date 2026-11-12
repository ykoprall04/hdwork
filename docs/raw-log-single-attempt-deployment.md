# RAW LOG — official single-attempt Windows deployment

Application: 1fc87f5df8aea39df6e813625248de6adf8a0a0a plus the release launcher compatibility
fixes in the package's exact codeCommit. This is an extension of the existing stopped-service,
immutable packet, pinned Courier config and TLS-health release contract. Do not invoke the
historical three-file universal controller for RAW LOG.

The cloud prepares/tests/packages code only. Actual deployment happens when the existing
DPAPI owner runs Start-RawLog.ps1 -Activate in elevated Windows PowerShell. A cloud fixture
pass is not a Windows deployment result. No remote production access or tunnel is added.

## Delivery / activation

Download the ZIP supplied in the handoff and compare its SHA256 against the separately
supplied value. Extract it into any dedicated local directory. Its root contains:

- Start-RawLog.ps1 — package entry point.
- package.json — application/code commit and bundle SHA256.
- hdwork-raw-log-release.bundle — Git objects, no production credentials.
- README.txt — instructions.

Run `.\Start-RawLog.ps1 -Activate` as Administrator under the existing DPAPI owner's account.
The entry point verifies bundle hash/objects, fetches the exact release commit into
D:\HDWork2-New **without changing that checkout**, archives committed tooling into a new
private C:\ProgramData\HDWork2RawLog-<GUID> packet, and parses all deployment PowerShell
scripts before service operations. There is no worktree, npm install, frontend build or
mock test suite on production. Without -Activate it stages a packet only.

## Exact changes

- Existing logging application modules on web/Courier snapshots plus new logger modules.
  Source must match the known base, application target or exact candidate; unknown local
  source is rejected before task changes. Universal-B2C compatibility is checked separately.
- Web protected launcher starts technical logging after loading its approved environment.
- Web environment: only HDWORK2_RAW_LOG_ENABLED=true and fixed LOG_DIRECTORY are added.
  Existing encrypted bundles, production Courier plan, bot identity, routing, journal and
  source-journal/offset/lock paths, DB and frontend are unchanged.
- Web PowerShell owner becomes single-attempt only when RAW LOG is enabled, avoiding the
  historical 5-second Node restart loop. Legacy services without this flag keep their behavior.
- A new pinned autostart directory **inside the private release packet** contains new owner,
  runner, regenerated config.sourceHashes, runnerSha256 and matching review digests. Old
  autostart files/config stay unchanged. Only the owned Courier task action switches to this
  new config/owner/hash. No manual pin edit is required or supported.
- Courier owner obtains the two nonsecret logging flags deterministically from its verified
  config.rawLog. No interactive/user/machine credential or environment persistence is needed.
- Log directory C:\ProgramData\HDWork2\Logs: owner/SYSTEM control, LocalService Modify;
  parent traversal for LocalService, tools restricted to owner/SYSTEM. Existing parent ACL
  is preserved with a LocalService traversal/read addition. ACL metadata is backed up first.
- Viewer installed at C:\ProgramData\HDWork2\Tools. A dot-source line is appended to the
  current owner's Windows PowerShell and PowerShell 7 all-host profiles, preserving existing
  profile content/encoding and saving original files in the private packet. Open a normal
  new PowerShell and type `courier-log`. Profiles disabled via -NoProfile do not load functions;
  dot-source the installed courier-log.ps1 explicitly in that case. A different pre-existing
  viewer is rejected instead of overwritten.
- Both owned tasks' RestartOnFailure XML element is removed (no failure retries), including after success, as requested
  for single-attempt operation. Original policy is retained in task XML backups for deliberate
  manual restoration later. Task principals/triggers and other bots' tasks are untouched.

## Sequence

1. Verify owned READY web (LocalService) and Courier (same DPAPI owner), all current pins,
   task action/review, protected hashes, compatible source, pinned HTTPS /login/assets and
   retained frontend inventory. Export original task XML; stage payload/raw-byte backups,
   immutable plan.json and separate RELEASE_PLAN_SHA256. No secret plaintext/DB is accessed.
2. Acquire the existing HDWork2 deployment mutex and exclusive frontend deployment lock.
   Reject explicit per-file ACLs/reparse points instead of silently changing their semantics.
3. Disable/stop only HDWork2-LiveChat-Courier; confirm its recorded Node/Python/owner exited.
   Wait 65s to cover the existing <=60s worker lease, without resetting/deleting a lease or
   polling lock and without accessing MySQL. If owned processes persist, abort; do not kill
   unrelated processes or start a second poller.
4. Disable/stop HDWork2-Web and confirm its owned launcher/Node are gone. Apply logging files
   and environment atomically per file, regenerate/verify Courier pins, install viewer/ACLs,
   switch only the owned Courier task action and disable scheduler failure retries.
5. Start web **once**; wait (read-only) for fresh READY, correct owner, read/write pools,
   unchanged pinned HTTPS login/assets. Start Courier **once**; wait for fresh READY,
   expected Node/Python parent relationship, same owner and exactly one owned Courier Node.
   Existing identity/lease/journal startup checks still apply; no second worker is created.
6. Require nonempty current web Node, Courier Node, Python and owner log files. Invoke the
   actual viewer's read function once. Verify final source/config/frontend hashes, mark ACTIVE.
   A readiness wait polls status; it never retries Start-ScheduledTask.

Minimum success output:

```
RAW_LOG_VIEWER_READ_PASS
{"Status":"RAW_LOG_ACTIVE","Web":"READY","Courier":"READY",...}
```

The deployed writer operates without the viewer terminal, rotates at 00:00 WIB and keeps
today plus six preceding WIB calendar days (7 total). It runs continuously, including the
requested 24h observation period. No actual 24h soak is claimed by the deploy script.
Disk failures/queue saturation may drop diagnostic events, reported by LOG_DROPPED on recovery;
sending has priority. No chat text, SQL/parameters, secrets/session or customer data is logged.
Original safe traceback frames/codes remain, not arbitrary exception message bodies.

## Failure: stop, report, preserve

No automatic recovery, restore, forced process kill or start retry exists. On a cutover
failure, the controller prints phase, current owned task states and packet path, writes
original deployment error/trace to private deployment-error.txt, records failed state and
throws. Depending on the phase, services may be stopped/disabled or the successfully started
web may remain running. Do not infer READY from the existence of a packet or old state file.
Do not rerun -Activate blindly. A staged/preflight failure happens before service operations.
If Task Scheduler settings fail mid-change, inspect each task's actual RestartCount; report
it before any recovery. No task other than the two named HD Work 2.0 tasks is modified.

Keep the packet and its RELEASE_PLAN_SHA256. All original source/env bytes, old autostart,
original task XML, profile backups and ACL SDDL metadata remain. No database, journal,
order or queue restoration/deletion is performed.

## Manual recovery (only after reading the actual error)

1. Identify packet path and plan hash from the deployment output. Inspect the error and task
   states. Disable/stop only HDWork2-Web and HDWork2-LiveChat-Courier if necessary; confirm
   recorded old/new Node/Python PIDs and launcher processes are gone. Do not clear SQLite,
   delete locks, reset offsets or touch other Telegram tasks. Wait the existing lease expiry.
2. Run the packaged controller with -RestoreFiles instead of -Activate, using the **same**
   Directory, CodeCommit and PlanSha256. It validates immutable backups, owner, protected
   hashes, no owned processes, and an explicit stopped/manual gate. It restores only the
   changed source and web environment. New unused source modules are left in place; no data
   files are deleted. It does not start services or change task actions.

   ```powershell
   & '<packet>\source\scripts\deploy-raw-log.ps1' `
       -Directory '<packet>' -CodeCommit '<original codeCommit>' `
       -PlanSha256 '<original RELEASE_PLAN_SHA256>' -RestoreFiles
   ```

3. Restore the exact old Courier action from previous-courier-task.xml using the existing
   task management procedure (same principal, old owner/config/hash; not a different bot).
   Restore other changed task settings deliberately, keeping retries disabled until health
   is verified. Restore only affected profile/ACL changes if required from private backups;
   do not replace unrelated current configuration blindly. Source pins must match as a set.
4. Start web once and check pinned HTTPS/READY. Start the one original Courier only after
   confirming lease/lock compatibility and no owned worker remains. If uncertain, leave it
   stopped and report the original error and current state for forward recovery.

## Validation in cloud

Only focused release/owner tests are run, not the entire application mock suite. They cover
stage/no runtime writes, regenerated pins/config invariants, protected encrypted data and
frontend preservation, partial-write stop with no rollback/retry, tamper/source drift rejection,
explicit manual recovery without deletion/start, and whitelist of controlled task names.
Windows syntax-only parsing runs before mutation in the operator package; Windows Task
Scheduler/ACL/DPAPI startup and real log health must be verified by actual operator output.


## Finalize an already-running packet after the 3b3d0b9 helper errors

Windows rejected the old RestartCount=0 serialization because RestartOnFailure requires
Count >=1 when present. The corrected helper removes RestartOnFailure from the exported
current XML, preserving all other task elements. Register-ScheduledTask -Xml -Force updates
the same named definition; no start/stop is invoked. RegistrationTrigger/non-IgnoreNew
policies are rejected, and PID invariance is verified after the update. Explicit ErrorAction
Stop prevents a failed settings update from silently continuing to service start.

The viewer probe now uses check-courier-log.js rather than inline node -e, avoiding Windows
PowerShell native quoting of JavaScript string literals. It prints a structured technical
error if reading fails instead of swallowing the reason.

For a packet already running but marked FAILED_MANUAL_RECOVERY_REQUIRED, invoke the latest
scripts/finalize-raw-log.ps1 with the original Directory and PlanSha256. It verifies the
original immutable packet, full applied pins, task actions/owners, web TLS/frontend, current
READY/process ancestry, single owned Courier, all four log sources and actual installed
viewer. It then disables failure retry via valid XML, checks unchanged PIDs, and marks ACTIVE.
It does not restart/stop/start services, reapply runtime source/pins, touch data or roll back.
If any check fails, it stops and prints the error. Original failure evidence is retained.
