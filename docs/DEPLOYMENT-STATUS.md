# Deployment Status — 14 November 2026

## Web updater

- **Status:** READY for Web-only updates through the existing updater.
- **Implementation commit:** `2fb9b2c0d810ac9e81297cea6a27e8f4778f628e`.
- **Entry point:** `hdwork-update.cmd`.
- **Controller:** `scripts/hdwork-web-update.ps1`.
- **Mock test:** 21/21 PASS after updater fixes.
- **Dry-run before the first source deployment:** detected 0 changed Web source files.
- **Loopback health check after source deployment:** 5/5 PASS; TLS verified.
- **Currently active Web pin:** `7b9b4e8e4dd9f37022b18dab801989aedbd85869`.
- **Courier:** unchanged by the Web updater; Courier updates are not supported by this updater.
- **Update with an actual Web source change:** PASS. Release manifest state is `ACTIVE`.
- **Kembali UI:** served route bundle returned HTTP 200 over verified loopback HTTPS and contains `Kembali`.

## First real source update findings

The initial update built the frontend and produced manifest hash `3aac7b99729ef691f684a4e1e32f6c99c760140a85b4865bccaf0ce12f4b1c6c`, then failed while packaging assets. The updater called `.NET` `System.IO.Path.GetRelativePath()`, which is unavailable in the Windows PowerShell runtime used on this PC. A later attempt exposed a second compatibility issue: the older Web control config had no `webTargetCommit` property, so direct assignment threw. Both issues were fixed in the existing updater: relative paths now use a root-checked Windows PowerShell compatible helper, and control config fields are added or updated compatibly. Failures now report phase, exception type, and a sanitized reason and save a failure receipt when a release directory exists.

Updater fix commits: `1bb35fb` (Windows PowerShell path compatibility and diagnostics) and `7b9b4e8` (legacy Web control pin compatibility). The successful run deployed source through the existing Web task. Courier was not restarted or changed.

Before modifying update or deployment mechanisms, read this status and `AGENTS.md`.
