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

Each attempt writes `startup-attempt-<attemptId>.json` beside the control config. It records role, phase, timestamps, owner/child PIDs, expected SHA, exception type, allowlisted error code, and exit/task result when available. The previous owner records `STOPPING`/`STOPPED`; the candidate records `CHILD_START`/`READY` or its failure; rollback records its own `ROLLBACK_STARTING` and `ROLLBACK_COMPLETED` or failure. Child stderr failure frames are stored separately as `child-startup-error-<attemptId>.json`; stdout/stderr content is never persisted. A bounded summary file records only line/byte counts and `rawContentStored=false`, avoiding token/password/cookie leakage from arbitrary process output. Rollback uses a distinct attempt ID and config pin, so its diagnostics cannot overwrite candidate evidence. The operator can inspect the `attemptId` and attempt JSON named in the release manifest/failure receipt after a failed update; `failure-attempt-<attemptId>.json` contains the supervisor exception projection.

Offline verification: updater mock 44 checks PASS; Windows supervisor fixtures 20/20 PASS, including READY, child exit, PowerShell pre-state exception, stale state, distinct candidate/rollback records, and secret-marker exclusion. No production task, Web runtime, Courier, or Windows logging configuration was changed. These diagnostics identify future failure phases; they do not retroactively reveal the missing exception from the earlier deployment.

## Scheduled Task config pin regression - 15 November 2026

The later `WEB_TASK_HANDOFF` failure was traced to .NET regex replacement parsing, not an incorrect SHA calculation. The updater constructed the replacement as `'$1' + $sha`; with a numeric-leading SHA, the replacement expression concatenated into `$1413...`, which .NET parsed as a different group reference. This generated a malformed `HDWork2-Web-Standby` action for both candidate and rollback.

The updater now rewrites the matched argument using captured substring offsets instead of replacement-string expansion. It validates exactly one `-ControlConfig` and `-ConfigSha256`, validates the SHA against the actual candidate/rollback configuration file, reads the Scheduled Task action back and validates it before starting the task, and precomputes both candidate and rollback action strings before fencing the old Web. An invalid candidate action therefore aborts before stopping the old Web.

Offline verification: updater mock 51/51 PASS, including reproduction of `$1413...`, candidate/rollback action validation, config file hash mismatch rejection, invalid candidate action preserving old Web, and candidate failure with rollback restoring READY. `web-task-action.test.cjs` 1/1 PASS; `web-startup-stderr.test.cjs` 20/20 PASS; PowerShell parsing and `git diff --check` PASS. No production task, service, Web runtime, Courier, or personal bot was changed. Production deployment remains untested for this fix.

Before modifying update or deployment mechanisms, read this status and `AGENTS.md`.

## Batch 3 notes schema and minimal Web compatibility - 15 November 2026

Migration `database/manual/019_hdwork2_order_notes.sql` from source commit `378e6f0` was applied to operational `hdwork2` after the existing private backup/restore rehearsal passed. The notes table, utf8mb4 text, ascii_bin order key, primary/FK indexes, two foreign keys, and exact reader/writer notes grants were verified. Existing Web grants outside notes and Courier account grants were preserved.

The user explicitly authorized temporary Web downtime and the prepared minimal compatibility patch. The existing cooperative Web control stopped `HDWork2-Web-Standby`; only runtime `src/config/operational-grants.js` was replaced, with matching source/control/task SHA pins. Web restarted READY with both operational pools initialized. Verified loopback health: 5/5 PASS with TLS validation. No Courier task, runtime, or personal bot was changed.

This is a one-file compatibility overlay. The active full Web release pin remains `7ceb012717936e4092e09d87f36e80e6734af927` (control target remains `1d388748c2c838b014ca3efcbfb57f2e71fdb74f`); it must not be reported as a full deployment of `378e6f0` or the Batch 3 UI/API. New control SHA: `cb7faa0d45a18e61033b0f4378b858bd466dafbef74ac2aad1bc3e07c389fa6b`. The routine updater still compares against that full release pin and validates runtime bytes using the updated source hashes. No updater mechanism or feature flags were changed, and no push occurred.

Private evidence is retained under `.local/notes019-controlled-ba71a5a9e1a245b6893369a11057d7b8/`: backup and restore verification, migration receipt, Web control/source backups, handoff/READY receipts, and post-migration health. Credentials and database contents are excluded from source control.

## Deploying Web after reviewed database prerequisites - 15 November 2026

The official entry point accepts `hdwork-update.cmd -DatabasePrerequisitesVerified -KeepPrevious`. Use the database option only after the required schema/grants have been applied and verified separately. It excludes database SQL files from the Web payload and never executes them. A changed operational-grants validator is accepted only when its active runtime byte hash matches the control pin and its normalized Git blob matches the target source; the updater leaves that already-installed file in place. Missing pins or different content still block deployment, and the default database/secret change guards remain enabled without the option.

`-KeepPrevious` skips release pruning, preserving previous release artifacts during this deployment. Both options survive elevation. The normal Web build, cooperative handoff, health gate, and existing rollback procedure are unchanged. The browser fixture now waits for the PROSES CEK table before checking headers, avoiding a production-build fetch timing race. These changes do not run migration 019 or modify Courier/PM2.
