# Web / Export Excel activation preparation

Offline preparation only. This does not activate the Telegram handbook in Courier.

## Included behavior

The existing Export Excel button is available in all list tabs. Its explanation
states that all statuses are exported, regardless of the current status tab.
Existing dates, area, command, search and assigned modules still scope the export.
Existing HD filtering remains supported. Export is not limited to the UI page or
the process tab's mine-only view. SHOW_ONLY remains denied in UI and backend.
Existing date defaults are retained: entering SELESAI selects today's dates;
clear/change the date range when a broader export is needed.

No new export UI, endpoint, database table or dependency is introduced. The
dashboard tabs and list queries keep their existing behavior.

## Narrow payload and integrity

The existing Web updater admits exactly `contracts/b2c-commands.json` and
`contracts/workspace-commands.json`. Both are dependencies of export and order
detail; workspace contracts preserve already-authorized non-B2C worksheets.
Every other contract, Courier directory and command/workflow implementation
remains excluded, apart from the existing pure `order-network.js` exception.

Selection also compares these contracts against the target Git blobs even if
their Git diff is empty relative to the last Web release. This repairs a stale
but correctly pinned runtime contract. Unexpected runtime byte drift is rejected.
The existing release manifest, sourceHashes and configuration/task pin mechanism
pin SHA-256 of the actual installed bytes. CRLF/LF normalization is only for
source identity comparison, never runtime integrity.

The existing physical payload check now verifies 14 source dependencies from the
combined candidate payload and unchanged pinned runtime files. It loads the
copied modules in an isolated child, exercises FORMAT VLAN (including the latest
minimal config format with a legacy Web parser), order-detail field projection,
and actual XLSX creation/readback with mock pools. External packages are resolved
from the supplied runtime's node_modules, not repository fallback. No service
environment, DPAPI bundle, credentials or production database is used.

Tests reject stale functional contracts despite valid old pins, missing helper,
changed source content and runtime pin drift. They accept newline-only source
representation differences while preserving distinct byte-level hashes.

## Later Web deployment procedure (not run)

1. Review/approve the branch and merge to main separately. Preserve unrelated
   local changes before the updater's clean tracked-checkout guard; do not discard
   them or include them in a feature commit. Checkout a clean main and fetch it.
2. Confirm active Web READY, control/source pins, validator overlay and available
   previous release package. Confirm only the Web task is selected. Do not alter
   Courier or its task. No database migration/grant/import is required here.
3. Run `hdwork-update.cmd -DryRun -DatabasePrerequisitesVerified -KeepPrevious`.
   Review selected Web scope: frontend assets, export/policy and exactly the
   required contract dependencies; no Courier parser/worker replacement.
4. Run `hdwork-update.cmd -DatabasePrerequisitesVerified -KeepPrevious` only after
   deployment is authorized. The official updater builds Vite for the configured
   public origin, stages the combined payload, validates it before handoff, backs
   up changed files/control, then uses the existing native Web handoff.
5. Verify READY, health/readiness, HTTPS/login, then use a legitimate session to
   download scoped all-status Excel and check order detail/FORMAT VLAN. Check
   validator overlay hash and unchanged non-Web process/task identities. Do not
   extract sessions or use production Telegram messages for tests.

## Rollback

The updater's existing failure path restores changed files (including contracts
and frontend assets), the compatible rollback control, source hashes and Web task
config pin together, then checks READY/health. Keep the manifest, file backups,
rollback-control.json, its SHA-256 and task arguments retained with KeepPrevious.
Do not restore a database or any Courier journal/offset/queue.

If a functional problem appears after a successful deployment, use that release's
retained backup with the existing native Web cooperative handoff, restoring all
manifest entries and the matching rollback control/task pin consistently. The
current updater has automatic rollback on activation failure, but no public
standalone `-Rollback` switch; do not invent one or run a frontend-only rollback
for a release that also changes backend/contracts. Verify the packet and its
operator execution path before authorizing such post-success recovery.

## Remaining boundary

Courier keeps its old parser/contract and recovery overlay until a separate
reviewed activation. A Web-only update does not change which incoming Telegram
formats it accepts. Pending rejection compatibility and Courier rollback remain
part of that separate activation. Live session downloads, production pins and
native handoff are intentionally not exercised by this offline preparation.

## Offline verification

- 46 backend/contract/access/payload tests PASS.
- 22 frontend workflow/cookie/action/module-scope tests PASS.
- Browser: synthetic login, all list tabs, export explanation/download, retained
  filters, HD/ADMIN/SUPER_ADMIN/SHOW_ONLY and mobile layout PASS.
- FORMAT VLAN browser: edit/copy/reset, desktop/mobile/embedded, roles and CRUD
  checks PASS with APIs mocked.
- Operational TypeScript/Vite build PASS; updater Mock PASS (63 checks).
