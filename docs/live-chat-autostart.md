# Live Chat Courier autostart — owner login

This adds a dedicated `HDWork2-LiveChat-Courier` Scheduled Task, without changing application source, the production plan, DPAPI secrets, routing, journal/offset, activation cutoff or database. It pins deployed base `4ef886e9bb2176b15f86cb3c2462a601fb8d14d6` plus incoming fix `f6ec0be361e7847138a29f9af88b7803516e40d9`. It refuses source/config drift. Existing Telegram service/testing tasks must remain disabled.

The task runs hidden at **login of the existing Windows DPAPI owner**, at highest privilege, with no saved password. It can continue while that session is locked. It does **not** promise operation before login or after logout. Do not enable automatic Windows login or copy secrets into a different account. Boot-before-login requires a separate approved service identity design.

## Prepare while current foreground Courier continues running

Use elevated Windows PowerShell as the same owner that successfully started the current Courier. Synchronize this branch using `git pull --ff-only`; preserve local backup/untracked files. Retain the existing `$productionPlan` path; do not create another journal or plan.

```powershell
$prepared = 'C:\ProgramData\HDWork2LiveChatPreparation-98b64e91b36e48bdbb4d0b8c30ad5748\prepared'
$fixes = @(Get-ChildItem -LiteralPath $prepared -Directory -Filter 'incoming-fix-*' | Where-Object {
  $manifest = Join-Path $_.FullName 'production-plan.review.json'
  if (Test-Path -LiteralPath $manifest) {
    $candidate = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $candidate.kind -eq 'HDWORK2_INCOMING_CHAT_FIX' -and
      $candidate.commit -eq 'f6ec0be361e7847138a29f9af88b7803516e40d9'
  }
})
if ($fixes.Count -ne 1) { throw 'Select the actually applied incoming-fix manifest; do not guess.' }
# $productionPlan must be the SAME file used by the working foreground supervisor.
if (-not $productionPlan) { throw 'Existing productionPlan path required.' }
.\scripts\install-live-chat-autostart.ps1 -Mode Prepare `
  -ReleasePrepared $prepared -FixPrepared $fixes[0].FullName `
  -ProductionPlan $productionPlan `
  -ProductionPlanSha256 'ac435e6b92412b101994957a0bfbf958e7a2c027c501abfe364c684ba35737eb'
```

Expected `AUTOSTART_PREPARED_NOT_REGISTERED`: no task or runtime has changed. Save the returned private `directory` as `$autostart`. Preparation checks the applied source manifests and protected configuration hashes without decrypting credentials or contacting Telegram/MySQL. The artifact directory inherits access only for Administrators/System. Do not commit it.

## Controlled handoff

```powershell
# Use the exact directory returned by Prepare.
.\scripts\install-live-chat-autostart.ps1 -Mode Install -Directory $autostart
```

Expected `AUTOSTART_REGISTERED_NOT_STARTED`. The trigger is owner login, not immediate execution. Stop the **currently running foreground supervisor** with Ctrl+C in its original window and wait for it to exit. Do not kill unrelated Node/Python processes. The Start mode refuses an occupied Courier port. If the old controller exited uncleanly, allow its lease to expire; never delete its lease or lock files.

```powershell
.\scripts\install-live-chat-autostart.ps1 -Mode Start -Directory $autostart
.\scripts\install-live-chat-autostart.ps1 -Mode Status -Directory $autostart
```

`COURIER_AUTOSTART_READY` requires a recent identity/lease-ready heartbeat, matching Node/Python executable paths and parent relationship, the pinned config command, and that Node owning the transport listener. Scheduled Task `Running` alone is insufficient. Existing OS token lock and database lease still enforce one poller. Automatic retries are limited to three at one-minute intervals.

Verify one **new** Telegram reply reaches the web and one new authorized web reply reaches Telegram. These real checks are required after handoff; automated fixture tests do not prove production delivery. Do not resend historical queued/dead rows. Test TIAL2 and SOLVER1 separately before claiming those routes work both ways.

## Rollback

```powershell
.\scripts\install-live-chat-autostart.ps1 -Mode Rollback -Directory $autostart
```

This verifies task ownership, stops/removes only the new task, and preserves private artifacts, current journal, queues and production source/config. It refuses removal if shutdown is not confirmed. It never enables the former testing tasks. After confirmed shutdown and any required lease expiry, restart the same previously working foreground command using the same snapshot, production plan and plan hash. No database restore or application rollback is needed for this autostart-only change.

Windows Task Scheduler registration, owner DPAPI access after login, and real delivery must be verified on the Windows host; Linux tests do not establish those results.
