# Shared Telegram groups — code ready, production activation separate

New groups use routing category/profile `ALL`. This is routing metadata, not a new order category or an authorization role. Each group accepts the seven existing commands `/order`, `/req`, `/config_psb`, `/mo`, `/assuren`, `/b2b`, `/replacement`. Existing parsers, required fields, module scopes, ownership and duplicate protection remain in force. No LOGIN parser, RECEK or escalation rules are added.

## Web workflow after approved activation

Monitoring Sistem → Manajemen Grup Telegram → Tambah grup. Choose an existing Courier bot, supply a free group name, verified Chat ID and optional topic. No TIAL/SOLVER category/profile selector. Existing mappings can be converted individually by Edit → Save; nothing is automatically converted or seeded during migration. The stored bot/chat/topic identity is immutable; disable it and add another group to change the destination. Maximum 20 active routes per bot.

Verification remains an explicit operator declaration based on verified Telegram membership/permissions; this form does not claim to perform an automatic Telegram API verification. The UI distinguishes saved configuration from actual Courier readiness/delivery. A missing runtime feature gate disables editing rather than presenting unimplemented activation as ready. ADMIN and SUPER_ADMIN retain their existing mapping authority; HD remains read-only. CSRF, live sessions, optimistic versions, request idempotency and audits remain required.

A group disabled or unverified stops new ingress, queued inbox processing, new web replies and queued outgoing dispatch, including chats attached to existing orders. History remains visible. Reactivation starts a new acceptance boundary: earlier inbox/outbox rows remain stored and excluded, without automatic replay or deletion. Messages from the disabled interval cannot enter later as delayed Telegram updates. `DITAHAN` identifies queued chat deliveries excluded by this policy.

A delivery already accepted by Telegram cannot be recalled. Courier performs an additional authenticated, worker-lease-bound backend authorization immediately before a new network send. There remains an unavoidable interval between that authorization and Telegram receiving the request; disabling a group cannot undo a request already in flight. Cached successful results are acknowledged without resending.

## Production migration plan — not executed by this update

1. Record current repository/runtime, task owner, plan hash, fixed global cutoff, journal/offset, mappings and schema. Validate a private backup of current frontend, backend/Courier source, task action, production plan, encrypted config and mapping rows. Do not export plaintext credentials.
2. Review `database/manual/014_hdwork2_shared_groups.review.sql`. Verify the existing category check name/clause before running it: MySQL 8 normally generated `hd2_system_mappings_chk_1` for migration 012. Stop if it differs; do not drop an unidentified constraint. The single ALTER adds name/route-boundary columns and permits ALL, without changing any existing mapping/queue row. DDL commits implicitly. Existing exact table-level mapping grants already cover the added columns; verify them, do not broaden grants.
3. Obtain explicit production migration/deployment approval. No migration runs from application startup. This is a full shared-routing release; the former two-file incoming-only deployment script intentionally rejects it.
4. Stop only the existing Courier normally. Preserve the one bot controller, namespace, secret references, original journal/offset, token lock directory, lease and global activation cutoff. Never start old testing tasks or reset the journal/offset.
5. Deploy the coherent backend/Courier/frontend release. In the reviewed production plan add `routingMode: "database"`, retaining existing identity, destinations/bootstrap routes, cutoff and paths. This opt-in lifts the former exact-three-route startup assertion; it does not bypass command/destination validation. Without it the old pinned contract remains enforced. Web config separately needs `HDWORK2_SHARED_GROUPS_ENABLED=true` together with already approved system monitoring/Live Chat/write gates. Do not change credentials or unrelated permissions.
6. Check migration 014 read-only with native web/Courier identities, then start exactly one Courier. Refresh its autostart source/config hash manifest through a reviewed release preparation; the existing autostart launcher must reject the changed source/plan until repinned. The original autostart preparation is pinned to the earlier two commits and cannot simply be reused for this broader release.
7. With an authorized web account convert/add verified groups. Courier reloads database routing each cycle, including an empty list when all groups are disabled. No per-group restart is needed after deployment. Test a new order from each supported format, real incoming reply and outgoing reply, exact topic isolation, disable, re-enable and absence of stale sends. Fixture/native disposable tests are not evidence of production Telegram success.

## Rollback safety

If migration/preflight fails, do not alter the running release. Before application activation, additive schema can remain unused while the old runtime continues with its original flags. Do not delete new columns or disable boundaries.

After shared routing has been activated, do **not** blindly restore an older Courier that lacks queue fencing: it could replay held rows. Stop Courier first. Restore the previous frontend if needed while retaining the fence-capable backend/Courier and database boundaries, or leave Courier stopped pending recovery. A full backend downgrade requires a separately reviewed way to preserve every held-row exclusion. Never clear the journal, alter the global cutoff, delete queue rows, or re-enable testing tasks as rollback.

## Validation

Backend unit/HTTP fixtures exercise routing and role guards. The explicit `tests/integration/mysql-shared-groups.cjs --run-shared-groups-disposable` rehearsal requires the existing disposable-only namespace/loopback guard and MySQL 8, applies reviewed schema only to a new isolated test database, and checks all seven commands, shared workspace chat, disabled routes, unchanged held rows, no replay after reactivation, and final send authorization. It never contacts Telegram. Windows autostart/deployment and real group integration still require host verification after approval.

## Approved deployment continuation: prepare on the existing Windows host

Deployment approval for application commit `827bb86` is already recorded. Management-only scripts may have a later commit; `prepare-shared-groups-release.ps1` pins the application source/dependency graph and frontend provenance to the exact approved SHA, not the management HEAD.

Run elevated as the existing DPAPI owner:

```powershell
cd D:\HDWork2-New
git pull --ff-only origin chore/remove-cacti-hdwork2
if ($LASTEXITCODE -ne 0) { throw 'Synchronization failed.' }
.\scripts\prepare-shared-groups-release.ps1
```

The defaults identify the previously verified `HDWork2CourierAutostart-e119dcbb14804568a245acb506f2f5e7` artifact directory and its pinned `d65e9eb1005953ebd26a9c6f2bec528f20fca663c155def56d6a63f17d45cb45` configuration hash. A mismatch stops preparation; never substitute an unverified current hash merely to pass the check.

Preparation checks current Courier/task owner, builds for the existing verified runtime origin, stages exact approved application bytes, and verifies private frontend/source/encrypted-configuration/plan backups. The original production plan remains unchanged; the candidate adds only `routingMode: database` and retains all secret references, bot identity, journal/lock paths and global cutoff. The candidate web environment adds only the shared-groups feature flag. No journal/offset is reset or restored.

A separate read-only native web-account connection backs up mapping rows plus table DDL to the private release directory. Only the existing reader password is transferred through a private stdin pipe after LocalMachine DPAPI unprotection; it is never printed, written to a file, or placed in arguments/environment. The backup probe reads no order/queue rows, changes no grants and runs no DDL. It produces `mapping-backup.report.json` and a migration SQL candidate using the actual verified category constraint name. Unexpected/partial schema stops the procedure with its real error code, errno and SQL state where available.

Expected final result: `SHARED_RELEASE_AND_MAPPING_BACKUP_READY_NOT_DEPLOYED`. Retain its directory and reports. This result means backups/preparation succeeded, **not** that migration or deployment occurred. Do not run the historical incoming-only overlay or old autostart preparation against this release. Subsequent host-specific apply/repin steps must use these verified artifacts, stop the sole Courier normally, verify 014 under native accounts, and preserve the queue-fencing rollback restrictions above. Approval is not requested again; Windows host output is needed because the cloud session cannot execute commands on that machine.

### Resume the failed metadata backup without rebuilding

The first Windows attempt completed verified source/frontend backup at `C:\ProgramData\HDWork2SharedGroups-d9252dccb37d4cc383a644c3b1ba44f0`, release-plan hash `17c858079bb10c54bff4474a3bf5bc437f5e013fb06b7b5357b512eadd729674`, but the read-only metadata query failed with MySQL 1064. The unquoted `precision` alias is reserved in MySQL 8.4. Metadata aliases are now quoted, and the exact category constraint parser also accepts MySQL's escaped literal representation. A disposable MySQL 8.4 regression reproduces the old error and validates the fixed queries plus constraint detection before/after migration 014.

After pulling the management fix, run elevated as the same DPAPI owner:

```powershell
.\scripts\resume-shared-group-backup.ps1
```

Defaults pin that exact existing packet/hash. The command verifies owner and active source/config hashes, then repeats only the native reader metadata backup through private stdin. It refuses to overwrite any existing backup/report/generated SQL. No rebuild, migration, runtime/autostart change, old-queue inspection or Telegram access occurs. Errors now include the failed metadata phase along with native code, errno and SQL state.

### Apply after confirmed migration 014

The operator reported successful execution of the verified migration SQL (USE + ALTER, two successful statements). The apply command still verifies the new columns/check **read-only under the native reader**, and compares the original mapping fields to the preserved backup before stopping anything. It never executes DDL or sends a test Telegram message.

```powershell
cd D:\HDWork2-New
git pull --ff-only origin chore/remove-cacti-hdwork2
if ($LASTEXITCODE -ne 0) { throw 'Synchronization failed.' }
.\scripts\deploy-shared-groups-release.ps1 -Mode Apply
```

Defaults pin release directory `HDWork2SharedGroups-d9252dccb37d4cc383a644c3b1ba44f0` and manifest hash `17c858079bb10c54bff4474a3bf5bc437f5e013fb06b7b5357b512eadd729674`. Source, frontend, encrypted config and mapping backups must still match. Both existing web/Courier must initially be healthy and have the recorded identities. An initial failure stops before task/source changes.

The command disables/stops only the verified Courier task and waits for its owned Node/Python processes to exit through owner-stdin shutdown. It never force-kills an unidentified process. If a stale worker lease remains, it waits for its existing expiry without deleting or stealing it. It then stops only the verified LocalService web task, installs the approved source/frontend with the shared-groups flag, and generates new hash pins for the same Courier identity, journal, global cutoff and secret references. It updates only the action of the existing Courier task; owner, trigger and settings remain unchanged. No extra task/bot/poller is created, and former testing tasks remain disabled.

The web starts first. A new READY state with both native operational pools is required, followed by a TLS-verified local `/login` and frontend asset hash check using the existing public certificate. Courier starts only after these pass. Its existing identity/lease/readiness verification must pass. Expected result: `SHARED_GROUPS_RUNTIME_READY`; this is host readiness, **not** proof of real two-way delivery.

```powershell
.\scripts\deploy-shared-groups-release.ps1 -Mode Status
```

For a failure before any service start attempt, the script restores pre-start source/config/frontend and original Courier action and attempts to resume only those two original tasks, retaining additive migration 014. After the durable start-attempt marker, backend downgrade is prohibited because mapping/disable boundaries might already have been used. It requests Courier stop, restores the previous frontend, retains the fence-capable backend/config, and reports the actual error for recovery. It never restores old database rows, removes migration columns, resets journal/offset/cutoff or enables testing services. A previous failed apply is not blindly retried over an ambiguous state.

After successful host status, confirm a new incoming Telegram reply appears in the web and a new authorized web reply is received in Telegram. Add/convert groups through the web and test the supported routes; do not report real delivery based only on mock/native test fixtures or task readiness.
