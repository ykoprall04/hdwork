# Deployment Status — 14 November 2026

## Web updater

- **Status:** READY for Web-only updates through the existing updater.
- **Implementation commit:** `2fb9b2c0d810ac9e81297cea6a27e8f4778f628e`.
- **Entry point:** `hdwork-update.cmd`.
- **Controller:** `scripts/hdwork-web-update.ps1`.
- **Mock test:** 32/32 PASS after handoff and rollback fixes.
- **Dry-run before the first source deployment:** detected 0 changed Web source files.
- **Loopback health check after source deployment:** 5/5 PASS; TLS verified.
- **Currently active Web pin:** `b7973784d2a87ef83e24dfe81355e38cae9a54f2`.
- **Courier:** unchanged by the Web updater; Courier updates are not supported by this updater.
- **Update with an actual Web source change:** PASS. Release manifest state is `ACTIVE`.
- **Kembali UI:** global route bundle returned HTTP 200 over verified loopback HTTPS, contains `Kembali`, and includes the login exclusion.

## First real source update findings

The initial update built the frontend and produced manifest hash `3aac7b99729ef691f684a4e1e32f6c99c760140a85b4865bccaf0ce12f4b1c6c`, then failed while packaging assets. The updater called `.NET` `System.IO.Path.GetRelativePath()`, which is unavailable in the Windows PowerShell runtime used on this PC. A later attempt exposed a second compatibility issue: the older Web control config had no `webTargetCommit` property, so direct assignment threw. Both issues were fixed in the existing updater: relative paths now use a root-checked Windows PowerShell compatible helper, and control config fields are added or updated compatibly. Failures now report phase, exception type, and a sanitized reason and save a failure receipt when a release directory exists.

Updater fix commits: `1bb35fb` (Windows PowerShell path compatibility and diagnostics) and `7b9b4e8` (legacy Web control pin compatibility). The successful run deployed source through the existing Web task. Courier was not restarted or changed.

## Web handoff and rollback recovery

The first global-button handoff timed out before the new supervisor reached `READY`. Its receipt recorded `WEB_READY_TIMEOUT`; rollback restored the previous config pin and a running, READY Web task. The old Web subsequently passed the full 5/5 health probe with TLS verified. Its rollback was incorrectly labeled failed because redirected Node health-check stderr (`ECONNREFUSED`) became a terminating PowerShell error while `$ErrorActionPreference` was `Stop`.

The updater now waits for both the old owner process to exit and the Scheduled Task instance to become idle before starting its replacement. The READY timeout includes task/result details. Health retries are bounded and limited to transient connection errors. If rollback restores an enabled, READY old task but health still fails, the release is retained and the receipt explicitly records the task as preserved instead of stopping it.

Handoff fix commit: `818435c`; task-idle and rollback health fix: `b797378`. The subsequent deployment completed with manifest `ACTIVE`, loopback health 5/5 PASS, TLS verified, and the global `Kembali` bundle served over HTTPS. Courier was untouched.

## Web handoff receipt follow-up - 15 November 2026

Candidate `2b40c26892b372fd42e8675274af1743d2ebaa55` reached `WEB_TASK_HANDOFF` and rolled back to the previously active Web pin `b7973784d2a87ef83e24dfe81355e38cae9a54f2`. The candidate `new-control.json` SHA matched its release manifest; task, owner SID, working directory, child, supervisor, and executable paths matched the prior control configuration. Candidate child, supervisor, and Node executable file hashes matched their pins. The old Web task returned READY after rollback.

The original startup exception could not be recovered from this attempt. `failure.json` contains only the READY timeout and task result. Candidate `child-startup-error.json` is absent, `failure.metadata.json` contains `{}`, and `startup.metadata.json` reflects the later rollback startup. Task Scheduler history was not readable in the audit session. Therefore the timeout is the observed failure detector; it does not identify the child exception or its root cause.

The updater now surfaces terminal startup state, exit code, task result, and allowlisted child/supervisor error codes when config SHA and owner PID match the candidate run. Terminal state from an older config and stale diagnostics are ignored. Supervisor diagnostic records carry that run identity. This changes diagnostics only; no updater or production Web run was performed.

Mock verification: updater `-Mock` 38 checks PASS (handoff, rollback, health retries, startup identity/stale-state handling); `web-startup-stderr.test.cjs` 18/18 PASS. The underlying exception from the 14 November attempt remains undetermined.

## Per-attempt Web startup diagnostics - 15 November 2026

The updater now assigns a fresh 32-character `attemptId` to each candidate and rollback configuration. Supervisor state and diagnostics carry that ID and the expected config SHA, so `WaitReady` only accepts state from the current attempt. A prior supervisor's clean `STOPPED` state is reported as stale state, not as the candidate's failure cause.

Each attempt writes `startup-attempt-<attemptId>.json` beside the control config. It records role, phase, timestamps, owner/child PIDs, expected SHA, exception type, allowlisted error code, and exit/task result when available. Child stderr failure frames are stored separately as `child-startup-error-<attemptId>.json`; stdout/stderr content is never persisted. A bounded summary file records only line/byte counts and `rawContentStored=false`, avoiding token/password/cookie leakage from arbitrary process output. Rollback uses a distinct attempt ID and config pin, so its diagnostics cannot overwrite candidate evidence. The operator can inspect the `attemptId` and attempt JSON named in the release manifest/failure receipt after a failed update; `failure-attempt-<attemptId>.json` contains the supervisor exception projection.

Offline verification: updater mock 44 checks PASS; Windows supervisor fixtures 20/20 PASS, including READY, child exit, PowerShell pre-state exception, stale state, distinct candidate/rollback records, and secret-marker exclusion. No production task, Web runtime, Courier, or Windows logging configuration was changed. These diagnostics identify future failure phases; they do not retroactively reveal the missing exception from the earlier deployment.

Before modifying update or deployment mechanisms, read this status and `AGENTS.md`.
