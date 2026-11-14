# Deployment Status — 14 November 2026

## Web updater

- **Status:** READY for Web-only updates through the existing updater.
- **Implementation commit:** `2fb9b2c0d810ac9e81297cea6a27e8f4778f628e`.
- **Entry point:** `hdwork-update.cmd`.
- **Controller:** `scripts/hdwork-web-update.ps1`.
- **Mock test:** 14/14 PASS.
- **Dry-run:** detected 0 changed Web source files.
- **Loopback health check:** 5/5 PASS.
- **Currently active Web pin:** `1d388748c2c838b014ca3efcbfb57f2e71fdb74`.
- **Courier:** unchanged by the Web updater; Courier updates are not supported by this updater.
- **Update with an actual Web source change:** not yet tested.

The verified run found no Web source delta, so it checked Web health without restarting Web. The first update that contains changed Web source still needs validation through the updater before its behavior can be described as verified.

Before modifying update or deployment mechanisms, read this status and `AGENTS.md`.
