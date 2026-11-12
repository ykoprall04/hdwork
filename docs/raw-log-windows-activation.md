# Batch 1 RAW LOG — Windows activation preparation

Application commit: `1fc87f5df8aea39df6e813625248de6adf8a0a0a`.
Preparation does not imply deployment is active. Production approval is already given;
the remaining gate is fresh Windows evidence, not a request for approval again.

## Findings that must be included in the cutover packet

1. Web task is Windows LocalService (SID S-1-5-19), Courier uses the existing DPAPI owner.
   The Batch 1 viewer installer grants only owner/SYSTEM and therefore is insufficient
   for backend logging in this topology. Do not run it as the complete activation step.
   The reviewed packet must provision root traversal/read for LocalService and Modify
   on Logs, owner/SYSTEM control, with no broad-user writes. Tools remain owner-controlled.
   Both service identities must be able to append/prune logs of their respective process.
2. `protected-web-service.js` removes inherited HDWORK2_* variables and loads the protected
   web environment.json. Web logging settings must be in that reviewed nonsecret environment
   payload (only RAW_LOG_ENABLED and LOG_DIRECTORY), with before/after hashes and rollback.
   Setting them in an interactive PowerShell terminal does not update web or a running task.
3. Courier owner clears its child's environment. Forwarding is implemented in 1fc87f5,
   but the hidden Scheduled Task owner also needs deterministic logging settings on startup.
   Use a reviewed, pinned owner launch configuration; do not rely on a stale Task Scheduler
   environment block, plaintext credential changes or machine-wide NODE_OPTIONS.
4. New Node/Python logger modules and modified source/launchers require a coherent release
   manifest, Courier config.sourceHashes, runnerSha256, review and task action hash. Never
   copy source into running snapshots or hand-edit live hashes. Historical three-file
   universal-B2C/ccc646a scripts are not a compatible logging release tool.

## Current step: read-only host proof

Use a new detached worktree from the supplied Git bundle. Bundle carries the application
and preparation code without a remote push. Git bundle verify authenticates object
integrity, not publisher identity; compare SHA256 against the separately supplied value.
The helper verifies the full current Courier pins and existing launcher review, both task
identities/processes, active frontend via trusted/pinned HTTPS /login and entry assets,
logging source differences, and a sanitized advisory log ACL summary. It does not read
chat bodies, log contents, DPAPI plaintext, queues, database or Telegram.

Run in elevated Windows PowerShell under the same DPAPI owner. Source repository is
`D:\HDWork2-New`; never change that production checkout to the new application.
The handoff supplies the exact new helper commit and bundle SHA256. Execute these steps
only after validating the bundle checksum:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\HDWork2-New'
$bundle = Join-Path $env:USERPROFILE 'Downloads\hdwork-raw-log-preparation.bundle'
if (-not (Test-Path -LiteralPath $bundle)) { throw 'Bundle belum ada pada folder Downloads' }
# Compare Get-FileHash against the exact supplied SHA256 before git fetch.
Get-FileHash -LiteralPath $bundle -Algorithm SHA256

git bundle verify $bundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle tidak valid' }
git fetch $bundle refs/heads/frontend/redesign-hdwork2
if ($LASTEXITCODE -ne 0) { throw 'Fetch bundle gagal' }
$worktree = 'D:\HDWork2-RawLog-1fc87f5'
if (Test-Path -LiteralPath $worktree) { throw 'Worktree sudah ada; jangan ditimpa' }
# Use the exact helper commit supplied in the handoff, not an arbitrary FETCH_HEAD.
git worktree add --detach $worktree FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Pembuatan worktree gagal' }
Set-Location $worktree
node --test tests/courier-raw-log.test.js tests/courier-autostart.test.js tests/raw-log-release-preparation.test.js
if ($LASTEXITCODE -ne 0) { throw 'Fixture Node gagal' }
.\scripts\test-courier-log.ps1
.\scripts\inspect-raw-log-release.ps1
```

No npm install, frontend rebuild, task operation, production logging enablement, database
access or credential decryption is part of this step. Node fixtures start independent
synthetic processes only, not another Courier. A 24h simulated test writes temp files.
PowerShell fixture parses source and tests viewer dispatch with a mocked node function.
If any check fails, preserve the error; do not force configuration changes or retry Apply.
The default existing queue/Telegram service continues operating during this inspection.

The helper always returns deploymentReady=false. NEW_FILE and BASE_MATCH are expected;
REVIEW_RUNTIME_DIFFERENCE requires examination of exact source hashes before constructing
a payload. A current source mismatch is not automatically a production failure. Unknown
runtime modifications must be preserved/reconciled, not overwritten to match Git blindly.
ACL summary is advisory, not effective-access certification; explicit DENY/group membership
and parent traversal require Windows validation before cutover.

## Subsequent packet and activation sequence

After fresh proof, prepare a bound packet with exact before/after source bytes, new modules,
web environment, owner/runner config/review, original task XML, ACL backups, retained frontend
hashes, protected bundle/production plan hashes and immutable manifest. Preserve the actual
bot identity, source journal/journal offsets, locks, activation boundary, MySQL data,
shared-group flags, route mappings, Courier polling/retries/FIFO/ACK/rate limit and frontend.
Do not downgrade universal B2C routing to older historical versions.

1. Stage/verify private packet while services remain active. Review exact deltas and run
   Windows offline fixtures, including LocalService/owner log append and ACL checks using
   synthetic data in dedicated test directories. No real Telegram test is required.
2. Under existing deployment mutex/lock, stop only the owned Courier and confirm all owned
   processes are gone; wait for existing lease expiry without deleting locks/lease rows.
3. Stop owned web; atomically apply only reviewed logging source/launch configuration and
   manifest/pin delta. Never overlap old and new pollers.
4. Start web; verify fresh LocalService READY, native pools and same pinned HTTPS /login and
   frontend assets. Confirm backend log append rights without reading customer payloads.
5. Start exactly one owned Courier; verify identity, parent PID relationship, fresh READY,
   normal existing lease/journal checks, Node/Python/Owner log coverage and bounded overhead.
6. Install/load the viewer from reviewed tooling, then `courier-log`. Closing it cannot signal
   Courier. Observe 24 real hours, daily WIB rollover, seven-day retention and LOG_DROPPED.

These are the required gates for the forthcoming compatible packet, **not commands to
execute against the current snapshot by hand**. No Apply helper is supplied at this stage.

## Recovery

Before any new process start: restore exact previous source/config/review/environment/task
XML and ACLs from the bound packet, verify old hashes and start web then the one old Courier.
After any Courier start attempt: stop the owned process before changing files; preserve
all journal/offset/success-cache and database state. Only roll back logging changes to the
same universal-compatible application baseline, with original complete manifests, after
verifying no worker remains. Do not reuse universal-release's old restricted-routing
rollback packet or restore old DB/queues. If process ownership/journal compatibility is
uncertain, leave the owned Courier stopped and diagnose/forward-recover; never start a
second poller to test. Viewer-only failure requires closing/reloading the viewer, no restart.
