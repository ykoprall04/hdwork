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

## Batch 3 Web activated - 15 November 2026

**Active Web commit: `ae68a97c14a8bf0b615ee6408d2c98a3b30f81de`.** This includes Batch 3 from `6d15a63` and the updater/fixture adjustments above. It was pushed to GitHub main and deployed through `hdwork-update.cmd -DatabasePrerequisitesVerified -KeepPrevious`. The official release manifest is ACTIVE, Web is READY, both operational pools initialized, and the built frontend enables cookie auth, operations and live chat. Migration 019 was not rerun; the existing migration and compatibility receipts/pins were verified before deployment.

Predeployment checks PASS: 28 focused backend tests, 81 frontend model tests, 59 updater mock checks, 21 startup/task tests, production build/attestation, and the production-build browser workflow with all APIs mocked. The browser fixture fetch-timing issue and the task test's fixed mock-count expectation were corrected before pushing/deploying.

Postdeployment verification PASS: loopback API health/readiness and HTTPS boundaries, five rounds with TLS validation; public `https://hdwork2.yoloo.space` HTTP 200 and entry/Batch 3 asset hashes matching the active runtime; private auth/summary/notes routes return 401 without a session. The public UI workflow exercises PESAN BARU baseline, sorting, visible-message cursor, failed fetch and storage sync, plus CATATAN HD display/save/retry, desktop/mobile and account isolation with every API mocked. Public `/preview/login` is intentionally 404, unlike local demo preview. Actual deployed summary/notes read services also passed on production MySQL using the existing read-only identity and a read-only transaction, with three scoped orders returned; no notes, order status, sessions or Telegram data were written by these checks. A real production note-save was deliberately not submitted.

Courier remains Running with unchanged task action, enabled/restart settings. All 15 observed PM2-related process identities/start times match the predeployment baseline; no PM2 command was invoked. Previous release artifacts were retained. Private evidence is in `.local/batch3-web-deploy-5a7f7b3efe0b44d3924bd656f5ef28bf/`; the official ACTIVE release/rollback packet is `control-candidate/updates/ae68a97c14a8-e98bbad5fc424925a621dff066e29d85/` under the existing Web control root. No credentials changed, database reset, order deletion, migration execution or Courier deployment occurred.

## Four Telegram commands activated - 15 November 2026

GitHub main and the local main checkout were verified at `8121b3db216218953ce4fd01e25448070dea1f72`. The official `hdwork-update.cmd -KeepPrevious` deployed the changed Web detail reader from full Web pin `ae68a97`; its release manifest is ACTIVE at target `8121b3d`. Frontend source did not change, so the existing build was retained; all three public entry assets match runtime hashes. Final loopback health passed five rounds with CA/hostname validation; public home/login returned 200 and unauthenticated `/api/auth/me` returned 401. No database migration or credential change was performed.

Courier was staged as a new snapshot from the same target using the installed dependencies and byte-identical protected environment/bundle and production plan. Existing native cooperative stop/fence and the existing Scheduled Task were used for handoff. The first candidate reached READY, then rolled back cleanly because the local postdeployment audit compared MySQL binary objects by reference. Saved before/after contents showed no row or FIFO changes. The comparator was corrected and passed equality/real-drift regression checks before a second controlled activation succeeded. No application source fix was needed.

Final Courier state: READY, identity/lease verified, delivery mode, native owner PID 18428, Node PID 15836 and Python PID 18304; exactly one owned Python child and one active database worker. Active parser JS/Python, network helpers and command contract match target Git blobs. Snapshot is `.local/command-deploy-341226b319f147e8806b82ca149d25c1/snapshot` under the primary checkout. The retained old snapshot is `startup-retry-84728b82-attempt3/snapshot` under the existing Courier candidate-release directory. Its startup fence remains held to prevent accidental activation.

Read-only before/after verification: outbox SENT 146 / DEAD 18 / QUEUED 0 / SENDING 0; inbox PROCESSED 98; orders 72. No preexisting IDs disappeared, FIFO identity/administrative markers and writer-fence epoch were unchanged. SQLite integrity passed; 19 updates and 37 deliveries retained their identity/content hashes, offset 483032303 and production boundary unchanged. All 11 captured personal PM2 daemon/child process identities and start times were unchanged. No PM2 command or production test order/message was sent. Telegram end-to-end behavior of newly received commands remains untested without production test messages.

Validation: 33 focused repository tests, 11 staged snapshot JS tests including JS/Python parity, five staged Python command tests, all 8366 snapshot source pins and three audit-comparator regressions passed. No ERROR/FAIL event appeared in the sampled new Web log; Courier final state remains READY. This is scoped verification, not proof that every historical log is error-free.

Private deployment evidence and rollback bindings: `.local/command-deploy-341226b319f147e8806b82ca149d25c1/`, including `baseline.json`, `rollback-paths.json`, original Courier task XML, `attempt1/` rollback evidence, final activation/queue/journal/health/parser receipts. Official Web rollback packet: existing Web control root `control-candidate/updates/8121b3db2162-f45437b072124ef2bc94d3e28ac736c9/`. A Courier rollback must first stop/fence the new owner cooperatively and prove process exit, then restore the saved old task action and release only its matching startup fence; never restore/reset database or journal. No new commit or push was made. This status update is local and uncommitted as requested.

## Telegram-only live logging activated - 15 November 2026

`telegram-log` is installed in the current user's Windows PowerShell/PowerShell profiles. It supports `-Errors`, `-Last 100` and `-NoFollow` from any working directory. The viewer reuses the existing tail reader and reads only Python files under `C:\ProgramData\HDWork2\Logs\Telegram`. Existing technical Python JSON events remain unchanged in the display; captured stdout/stderr is printed after producer-side redaction. No Web, MySQL, Node backend or Windows supervisor files are included. See `docs/telegram-log.md`.

Root cause: the native supervisor intentionally clears inherited environment variables, disabling the Python logger unless the production launcher sets its nonsecret logging configuration explicitly. Parent stdout/stderr handlers only counted bytes and drained output. The production launcher now enables the existing Python RawLog writer in the dedicated directory; Python captures/redacts its own streams before storage and forwarding. Native READY messages remain compatible. The bounded queue and seven-day retention are reused. Telegram API method/timing and command-name/validation telemetry contain no request/response bodies or customer fields. Traceback frames, types, HTTP/OS codes and retry details are preserved; arbitrary exception messages/source literals are redacted.

The logging patch is a local uncommitted overlay on base `8121b3d`, not a new GitHub commit. Final immutable snapshot: `.local/telegram-log-9a20b5fcbeea4e9d819755403b73002b/snapshot`; overlay file hashes and prior runtime/rollback bindings are in the same private release directory. The initial logging activation and final traceback-redaction hardening both used the existing cooperative native stop/fence and existing task, retaining prior snapshots. No rollback was needed. Final runner Node PID 7600 and Python PID 12144 are READY with verified identity/lease and one active database worker. Web was not restarted. No PM2 command, database migration/manual write, Telegram test order or credential/session change was performed.

Before/after each handoff: outbox SENT 148 / DEAD 18 / QUEUED 0 / SENDING 0, inbox PROCESSED 100 / DEAD 2, orders 74. These preexisting DEAD records were unchanged. No IDs or FIFO identity/administrative markers disappeared or changed; writer fence unchanged. SQLite integrity passed; 23 updates, 39 deliveries, content hashes, production boundary and offset 483032307 preserved. All 11 captured personal daemon/child process identities/start times remained unchanged.

Verification: 90 Python tests and 25 focused Node tests passed, including fragmented-token redaction, original safe stream output, exception chains/frame locations, mixed-file exclusion, history/follow/rotation, and independent viewer shutdown. PowerShell parsing and fresh-profile command discovery from another directory passed. A real viewer was stopped independently; Courier remained alive and log size increased afterward without a viewer. Startup stdout/READY was captured, live Telegram polling/request and outbox events were observed, with no new error event in the inspected logging run. Real retry/rate-limit failures were not induced in production; those paths were exercised synthetically. Source changes and this status remain local, without commit/push.

## Approved source publication - 15 November 2026

The user authorized committing and pushing the tested Telegram logging/viewer and INVALID-order fixes to GitHub main. Publication includes the dedicated Python logger/stream capture, important-activity viewer filter, installer, invalid-reply FIFO origin proof, canonical rejection text, regression tests and related documentation. Private runtime artifacts, logs, backups, credentials and unrelated untracked files are excluded.

The INVALID-order fix remains unactivated in production: publishing source does not restart or deploy Courier/Web/MySQL. Its offline verification passed 91 Python tests and 72 focused Node tests, including owned TCP-disabled MySQL fixtures, least-privilege authorization and mixed VALID/INVALID arrivals three seconds apart on a virtual clock. The viewer filter separately passed 17 offline tests and installed/source parity checks. Production logging was activated earlier as recorded above; future activation of the INVALID fix requires the normal reviewed Courier snapshot handoff. No recovery/replay of historical INVALID inboxes is included in this publication.

## INVALID-order fix activated - 15 November 2026

Courier is now active at `d6c95293875bfb0d30f7b44ec6137195dc338760`, from the verified GitHub main commit. The new immutable snapshot contains the canonical rejection helper and inbox-origin FIFO proof; all five changed backend modules match target Git blobs. All 8370 candidate source pins and 11 staged command tests passed before the existing cooperative native stop/fence and Scheduled Task handoff. The production plan, identity, protected environment/bundle and journal/lock locations were preserved. No new migration, grant, manual production database write or Telegram test order was performed.

Final state: READY, identity/lease verified, native owner PID 18348, Node PID 2324, Python PID 11216; exactly one Courier runner, one owned Python child and one active database worker. Read-only before/after: outbox SENT 165 / DEAD 18 / QUEUED 0 / SENDING 0; inbox PROCESSED 111 / DEAD 6; orders 85. No prior IDs, FIFO identity or administrative markers changed/disappeared; writer fence unchanged. SQLite integrity passed, retaining all 38 updates and 56 deliveries, content hashes, offset 483032322, production boundary and identity. Historical DEAD inboxes were not replayed or reset.

Web health/readiness and public login returned HTTP 200. All 13 captured unrelated processes (personal daemon/children, Web Node and production MySQL) retained PID/start identity. Web, MySQL and personal bots were not restarted. New Python Telegram logs are being written; the inspected post-start records contain no error event. The active helper also returned the exact expected SC/IN rejection in a pure in-memory check, without database or Telegram mutation. No real production INVALID message was submitted for testing.

Private activation/rollback evidence: `.local/invalid-order-activate-1bb6397ca2d2420ba17072a9987f75d5/`, with baseline, old task XML, old/new config paths, pinned new snapshot, clean-stop/READY and read-only preservation receipts. Prior snapshot `.local/telegram-log-9a20b5fcbeea4e9d819755403b73002b/snapshot` is retained with its startup fence held. No rollback was needed. A future rollback must preserve any new inbox-origin rejection replies; the older binary holds those replies until compatible code is active. This activation-status update is local and uncommitted; no additional commit or push was performed during activation.
