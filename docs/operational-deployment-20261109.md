# HD Work 2.0 deployment, 9 November 2026

The public application at https://hdwork2.yoloo.space now runs with the existing
`hdwork_ops_write@localhost` writer. The active protected release is
`C:/ProgramData/HDWork2Runtime-124fc21bc36a42859fb5f7e327d305b1` and the scheduled
task remains `HDWork2-Web` under LocalService. The writer was already provisioned;
no account, password, grant, schema, DNS or tunnel changes were made here.
Existing DPAPI secrets were combined in memory and protected again for the service.

The frontend uses the public API origin and cookie authentication, with operations
enabled. The deployment script rejects a localhost API build before switching.
An initial release used the workspace's development API URL; it was superseded by
the active release after the browser check exposed the incorrect build setting.

Regular HD accounts use the general writer; `trial_yanto` always uses its existing
restricted testing path. Disabling or expiring that path cannot fall back to the
general writer. Expired trial configuration no longer prevents the operational
service restarting. The trial account remains restricted to the existing testing
group and its original expiry; this deployment does not promote or reset users.

## Verification

- 32 focused automated tests pass: pool identity/grants, write policy, regular/trial
  routing, expired trial, CSRF-related policy and testing group isolation.
- Production frontend build passes. The existing large legacy chunk warning remains.
- `.local/operational-browser-result.json`: real public Chrome login, check-in,
  job selection, dashboard, order list, HD controls, session reload and logout PASS.
  The browser harness was corrected for the Windows Chrome launcher returning
  exit code zero while the owned browser child is still starting.
- `.local/operational-flow-result.json`: public API login, dashboard/order reads,
  missing-CSRF rejection and stale-version conflict; official writer status
  transition, audit/idempotency and original-message reply enqueue verified in one
  outer transaction which is always rolled back. No message is sent by this probe.
  Logout and session revocation are verified. All 11 orders match the preflight
  baseline. Run with `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass
  -File scripts/check-operational-flow.ps1`; credentials remain on private stdin.
- Runtime `service/state/state.json`: READY, readOnly=false, read/write pools=true.
- The Telegram task and its existing polling process were preserved. The web
  sender confirmed four already-committed queued replies after activation;
  the database subsequently showed five SENT and two DEAD, with no QUEUED rows.
  Both DEAD records have NETWORK/attempts=1: preserve them for manual reconciliation,
  never automatically retry an uncertain send. Sender receipt is in the active
  release's `service/state/testing-sender.json`.
- Four existing legacy Python processes remain alive with their original start
  times, predating this deployment. MySQL84 and Cloudflared remain Running.
  Only the HDWork2-Web task was switched; no legacy service was restarted.

## Remaining operational decision

Full production readiness is not claimed. The available Telegram service is
explicitly configured for @HDWorkOpsBot and **HD Work 2.0 Testing**, chat
`-5436357946`, with `/order` on TIAL1. Its production destination has not been
specified. The only current HD account is the restricted trial; the other existing
account is SUPER_ADMIN, whose workflow role remains monitoring. A production group
and permanent operator identity/access must be designated before calling this a
general production cutover. The user was asked to confirm the Telegram destination.
Do not reuse a legacy bot's token or change its polling to resolve that decision.

## Recovery

`.local/operational-deployment.json` and `.local/protected-web-deployment.json`
identify the active release. Every staged release retains previous-task.xml,
previous-deployment.json, previous-state and its protected secret bundle. Retain
all releases and existing database backups. The previous stable read-only release
is `C:/ProgramData/HDWork2Solver-20261109T043516Z-0f1ee54a`; its original task XML is
preserved in the first staged release's `service/previous-task.xml` under
`C:/ProgramData/HDWork2Runtime-f263a2804b6d4566b301fb2d1bed6dcb`.
Stop only the owned current web task/process before restoring that task XML;
ensure the old process has exited, then start the restored task and verify READY
and public login. This application-only rollback needs no database restore.
