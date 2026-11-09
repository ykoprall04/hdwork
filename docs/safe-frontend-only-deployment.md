# Safe frontend-only build and deployment preparation

Base: `61d360a`, branch `chore/remove-cacti-hdwork2`.
This change prepares scripts only. No real deployment, migration, database access,
secret retrieval, Windows task/service control, or external operational system
was used. Tests use synthetic files in a disposable directory and injected health
responses. The existing `deploy-hdwork2-operational.ps1` is byte-for-byte unchanged.

## Build configuration and provenance

`build-operational-frontend.js` now fails before spawning npm if
`VITE_API_BASE_URL` is absent or blank, with an explicit instruction to provide a
verified HTTPS origin. Malformed values receive a safe validation error; the
provided value is not echoed. There is no default origin. Userinfo, path, query,
fragment and HTTP are rejected. This script reads the process environment;
setting a Vite `.env` file alone does not supply its pre-build validation.

For a build only, in PowerShell:

```powershell
$env:VITE_API_BASE_URL = 'https://<explicitly-verified-origin>'
npm.cmd run build:operational
```

The existing three frontend flags remain true during this build. These include
client code; they cannot enable a backend writer, grant, worker or Telegram sender.
After successful TypeScript/Vite compilation the build writes
`frontend/dist/release-manifest.json` and prints `FRONTEND_MANIFEST_SHA256=...`.
The manifest contains only the public API origin, client flags and SHA-256 hashes
of allowed static files. Staging requires the hash recorded from that verified
build, supplied independently from the manifest file. Hashes detect changed bytes;
they are not a signature or proof that a third-party origin has been approved.
Run/review the required tests before approving a particular release.
A failed build must not be used, even if older output remains on disk.

## Why there is a separate deployment path

The existing operational deployment script changes the auth/write profile,
rewrites backend environment, unwraps/reprotects a secret bundle, inspects Courier,
and replaces/restarts a Windows scheduled task. Even its staging path performs
operational preflight. It is not a frontend-only deployment mechanism and was
neither invoked nor modified for this task.

New entry point: `scripts/deploy-hdwork2-frontend-only.ps1`.
Engine: `scripts/frontend-only-release.js` (Node built-ins only).
The operator supplies the exact **currently served static dist path**; the script
does not discover it by reading runtime environment or credentials. Source and
release paths must be separate from the active dist, and the release parent must
already exist. Symlinks/junctions, file hardlinks, non-static files, overlapping
paths, existing release directories and incorrect/tampered manifests are rejected.
Only index.html, favicon.svg, icons.svg and allowlisted flat assets are accepted.
No backend source/configuration or permission flags are read, copied or rewritten.

### Stage (default mode; preparation only)

```powershell
.\scripts\deploy-hdwork2-frontend-only.ps1 -Mode Stage `
  -BuildDirectory '<verified-build-dist>' `
  -ActiveDist '<currently-served-frontend-dist>' `
  -ReleaseDirectory '<new-release-folder-outside-active-dist>' `
  -ManifestSha256 '<hash-recorded-from-successful-build>'
```

Stage reads the current static inventory, copies/verifies the candidate into the
new release folder and writes a STAGED plan. It does not modify, stop, swap or
restart the active runtime, contact any service, or decrypt anything. Its copied
build is rechecked again before application. An incomplete staging directory is
retained for review rather than automatically deleted or overwritten.

### Apply and rollback (provided, not executed against a runtime)

Both modes require `-ApproveFrontendOnly` and an explicit `-HealthUrl` pointing to
**loopback HTTPS `/login`** with valid TLS. No certificate-validation bypass is
provided. The URL must be accepted by the existing server's host policy; otherwise
the baseline health check fails before active writes. No default URL or public
Cloudflare/VPN address is probed. Redirects and API/health endpoints are rejected.
The health check compares the served HTML hash and its referenced static asset
hashes to the expected release, rather than accepting an arbitrary HTTP 200.
It makes no database-backed API requests. It does not certify backend health or
operational capabilities.

For a separately approved application, the same entry point supports:
`-Mode Apply -ReleaseDirectory <stage> -ApproveFrontendOnly -HealthUrl <loopback-url>`.
For recovery it supports `-Mode Rollback` with the same explicit arguments.
These modes are documented for operator review; neither was run against an
existing runtime in this task.

Application sequence:

1. Acquire an exclusive frontend lock; verify the staged manifest and unchanged
   baseline. Confirm the old frontend is healthy before any active mutation.
2. Copy and verify a backup of existing static files into the release directory.
   Persist APPLYING before switching. Backups are never pruned by this script.
3. Add new assets first. Existing same-name assets must have identical hashes;
   a collision is rejected rather than overwriting bytes needed by open tabs.
   Root static files are replaced through same-directory temporary-file rename;
   `index.html` is switched last. Active directory/path and server process stay put.
4. Validate the served new index and referenced assets; persist ACTIVE only on
   success. On failure restore the old root files/index, verify retained old
   assets and check the old frontend before reporting ROLLED_BACK.
5. Failed recovery is explicitly ROLLBACK_FAILED and requires review; no false
   success. Manual rollback validates the backup and rejects a third-party index
   change. New and old hashed assets remain available to open tabs after rollback.

A stale lock after process termination is deliberately not deleted automatically.
An operator must establish that no deployment is running before recovery. An
APPLYING plan with a complete backup supports explicit rollback after the lock
is reviewed. This is an index-last static update, not an atomic filesystem-wide
snapshot; a browser already loading a particular old/new index can continue to
load its retained immutable assets. Do not run another deployment tool concurrently.
The script only works where the active web server reads the supplied dist path
on each request; it cannot repoint a CDN or an in-memory static bundle.

## Workspace authorization regression

`WorkspaceBoundary` previously displayed a denial message **and its children**.
It also bypassed module checks whenever the workflow build flag was false.
Both paths are removed. Denied children are never mounted, so their data hooks,
notifications and action controls do not run. Menu visibility remains independent
of permission: users can select a workspace and see a denial without protected
content. TIAL/REQ and LOGIC direct routes now have subarea-specific boundaries,
including the read-only fallback. A REQ-only grant does not open LOGIC.
Backend session/module/owner/CSRF/transaction checks are unchanged.

Browser regression uses the built React UI for each role separately and asserts
that unassigned pages have no protected headings, actions, or order/recap/overview/
SSE requests. The helper's module tests cover category/subarea isolation. The
existing negative API/role tests continue to check backend authorization.

## Review of all 29 frontend lint warnings

The repository's `npm run lint --prefix frontend` invokes **Oxlint**, not ESLint.
No warning rules, severities or limits were changed.

| Warning | Before | After | Decision |
|---|---:|---:|---|
| Unused import | 1 | 0 | Remove unused MoreHorizontal from legacy user page |
| Exhaustive dependencies | 9 | 8 | Memoize user-list loader with its existing token/city/search dependencies; effect depends on that stable loader |
| Fast Refresh exports | 3 | 1 | Remove unused exported button/badge style helpers; repo has no consumers; component rendering unchanged |
| setState in effect | 15 | 15 | Deferred: async load/reset/auth expiry/terminal recovery/sidebar/theme lifecycle changes need dedicated behavioral regression |
| Ref access during render | 1 | 1 | Deferred: terminal session/screen identity logic; do not change live SSH recovery semantics in a static deployment fix |

Remaining 25 warning locations: TeamPage, ReportsPage, GroupManagementPage,
AttendancePage, NetworkToolsPage, OrderDetailPage, OrdersPage, WorkspaceOutlet,
ThemeToggle, AppSidebar, NetworkTerminalPane and AuthContext. Remaining missing
dependencies concern data fetches, auth expiry/logout, and terminal identity.
Blindly adding unstable functions can introduce repeated loads/reconnections.
AuthContext's mixed provider/hook export requires a broader import refactor.
No warning is hidden with disable comments or inflated limits.

## Legacy chunk evaluation

LegacyRoutes previously eagerly imported every legacy page plus the terminal
workspace; its chunk was approximately 509.53 kB. Legacy pages now use route-level
React.lazy/Suspense; the persistent NetworkTools workspace lazy-loads its terminal
page while retaining its existing visited/user/session lifecycle. The source
Preview routes/layouts and backend legacy bot are unchanged. The normal Suspense
fallback is a loading message, not demo data or an authorization bypass.

Measured production output: LegacyRoutes approximately 13.76 kB, the largest
NetworkToolsPage chunk approximately 356.01 kB. No chunk exceeds 500 kB and no
chunk warning threshold was raised. Splitting reduces initial transfer; it does
not eliminate the terminal library's total download size.

## Validation and limits

Results: 337 backend tests PASS (including 13 frontend-release mock tests),
72 frontend tests PASS, 34 Python Courier regressions PASS, and full frontend lint
exits successfully with the 25 reviewed warnings above. Configured production
build PASS, with no oversized-chunk warning. Browser regression: 99 role-route
checks PASS plus lazy legacy login/anonymous terminal guard smoke PASS.
The real missing-variable CLI exits
1 with the documented validation message, without a TypeError or default URL.
The release tests cover absent/malformed URL, hashes, stage immutability, backup,
changed baseline, active lock, asset collision, failed new/old health, corrupt
backup, non-static/symlink rejection, exact frontend health and unchanged backend
sentinel/permission configuration. No transport/DB dependency is imported.

Windows PowerShell wrapper execution and Windows file-sharing behavior are not
verified on this Linux workspace; the Node engine is exercised with real fixture
filesystem operations and mocked health responses. No service is started for
those deployment tests. Office deployment, actual health URL/TLS/host policy,
backend capabilities and real operational integrations remain unverified.
