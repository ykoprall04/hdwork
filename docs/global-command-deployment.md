# Global command deployment and rollback — preparation only

No production database, service, Task, secret, ACL or Grafana configuration was
changed. All execution evidence below comes from mocks/historical source fixtures.
Do not treat the existence of this document as authorization to deploy.

## Compatibility boundary

Audited baseline: Web b0f2d87, Courier latency 05ef8b17 with lifecycle cc90aade.
Fixtures execute historical grant validators from all three revisions and an exact read-only capture of the active Courier validator
with the narrowly prepared optional-table compatibility patch. SELECT is accepted
for readers/Courier; only writers may UPDATE. INSERT/DELETE/ALL/wildcards remain
rejected. Sources were captured once using git show or read-only source comparison, with provenance hashes. Tests are self-contained and need neither Git history nor production access. The active Courier validator has no optional VLAN branch; its fixture preserves that exact deployed difference. No branch was switched/merged.

The Global Command candidate is based on main 05ef8b17. Its clients.py change
adds the two internal command-settings methods. When assembling a payload for
the audited lifecycle Courier, carry those methods onto its clients.py and
preserve the deployed identity retry methods and policy JSON from cc90aade.
Assemble and hash the complete payload through the existing lifecycle handoff.
Retain supervisor, launcher, recovery triggers, protected secret references,
lease, writer fence and operational directories. No lifecycle Task change is
required by the feature itself.

New Web + old Courier: OFF writes return 409 before a settings transaction;
stored OFF is not rendered effective. Old Web + new internal backend/Python:
orders continue normally, including stored OFF enforcement, without the new UI.
New Python + an old internal backend with no settings endpoint and no valid cache
holds new polling; existing journal forwarding, ACK and outbox can continue.

## Stored versus effective

Existing authenticated internal POST /commands returns the four saved settings.
After validating/installing them, Python sends POST /commands/applied containing
the protocol, complete snapshot and current worker lease. Backend validates that
lease before recording in-memory readiness. Web reads only technical metadata at
GET /internal/courier/v1/commands/status over loopback. This GET rejects browser
Origin and non-loopback clients and never returns lease tokens or message data.
It revalidates the worker and expires a report after six seconds. No new database
table or worker-schema column is needed for capability reporting.

Web checks that exactly one active database bot matches that status, with a
one-second probe timeout. Endpoint port defaults to the existing 3091 and may be
set explicitly with HDWORK2_COURIER_STATUS_PORT for another installation; arbitrary
hosts/URLs are not configurable. This is a backend-local probe, never Telegram.
Each command is EFFECTIVE only when the acknowledged value AND version match its
saved row. Pending/unknown is shown as BELUM TERVERIFIKASI, never effective OFF.
UI refreshes every four seconds. OFF is blocked unless capability/cache are ready;
an audited ON remains possible for operator recovery.

Cache polling starts on a monotonic four-second cadence, independent of long
polling and delivery cooldown. Successful fetch installs a valid cache before
reporting it; disk/API/report failures preserve last-valid memory. Unknown or
corrupt startup cache pauses Telegram polling without advancing the offset.
Existing durable events are not re-filtered. Initial snapshots (even all ON) are
persisted atomically in a small sidecar. No database query occurs per message.
Only this dedicated client's generic HTTP_FAILURE reporting is suppressed in
favor of bounded static cache error events: first failure, changed condition,
at most one reminder/minute, then recovery. Other HTTP/Telegram diagnostics remain.

## Backup evidence required before production work

1. Fresh consistent InnoDB schema/data backup using the existing backup mechanism,
   stored in its protected host-only backup location outside Git. Verify nonempty
   completion/checksum, then restore/test it on an owned isolated MySQL instance.
   Do not print backup contents or pass passwords in command arguments.
2. Capture exact grants for the three application accounts BEFORE the first
   migration attempt. Keep this original preimage across partial reruns. A data
   dump does not substitute for grant capture. Record existing trigger/routine/
   event definitions if present: the existing dumper does not include those.
3. Back up current Web/Courier runtime bytes, configuration, source hashes, binary
   pins, Task XML/actions and startup/recovery settings. Preserve private files in
   protected backup storage; do not copy credentials into this repository/package.
4. Capture a consistent journal backup for disaster evidence through the existing
   helper. Normal code rollback MUST NOT restore it over newer journal/ACK/offset.
5. Rehearse both rollback payloads, including old grant validators and the OFF
   handling decision. scripts/lib/global-command-deployment.js verifies required
   evidence flags, prepares an exact optional-grant compatibility patch, checks
   schema and constructs only the narrow grant compensation plan. It has no
   credential/pool loader and no automatic deployment/Apply CLI.

Actual fresh production backup evidence is intentionally not created here. It is
a precondition of separately approved deployment, not something fixtures prove.

## Migration 021 and partial application

Preflight database identity, original grants, schema and backup evidence before
running SQL. checkSchema(connection) validates existing table shape, primary key,
InnoDB, defaults, constraints and data; incompatible state stops before writes.
Do not run a mismatched existing table through CREATE IF NOT EXISTS blindly.

021 uses CREATE TABLE IF NOT EXISTS and a no-op duplicate-key seed. Reruns fill
missing command rows without resetting enabled/version/updated_at; the three
exact GRANT statements are repeatable. CREATE/GRANT perform implicit commits:
there is no whole-file transactional rollback. Fixture tests inject interruption
after CREATE, seed and a GRANT, then successfully resume. No DROP/TRUNCATE/reset.

## Approved activation order

1. Freeze/review the complete source candidate and create reproducible pinned
   payloads through the established updater/handoff. Preserve unrelated local
   changes and the complete lifecycle overlay. Obtain backup evidence above.
2. Prepare narrow grant-compatible Web and Courier rollback validators from their
   exact pinned sources with compatibleValidator; validate and pin their bytes.
   Before applying ANY new grants, install ONLY the narrow Web validator through
   the existing approved native Web cooperative handoff/pin procedure, keeping its
   old UI/API and full-release marker. Verify Web returns READY. This follows the
   existing reviewed database-prerequisite overlay path, not a new updater.
3. Cooperatively stop/fence only Courier and prevent its old Task from restarting
   during migration. Verify old owner/worker release. Do not manually stop Web
   before invoking hdwork-update.cmd: its GetActiveWeb requires a running READY
   owner. MySQL, Tunnel, PM2/private bots and unrelated Tasks remain untouched.
4. Preflight/apply/check 021 and exact grants while Web has its compatible validator
   and old Courier remains fenced. Stage complete candidate Courier code + matching
   runtime/config pins. Start Courier through its existing mechanism; verify one
   worker, identity, lease, heartbeat and a valid cache report. All defaults are ON;
   preserve any existing OFF instead of resetting it during a migration rerun.
5. Invoke the existing full Web updater from the now-READY compatible old Web,
   using its reviewed DatabasePrerequisitesVerified/KeepPrevious path after the
   candidate has an approved source commit. Its rollback baseline must include
   the compatible validator. It performs its OWN Web stop/start. Do not mark the
   uncommitted working tree deployable through that updater. Expose OFF only after
   current worker readiness/version confirmation; verify health and normal traffic
   without sending production Telegram test messages.
6. Estimated normal budget: two short Web handoffs, 30–90 seconds each (1–3 minutes
   total), and Courier 1–3 minutes. Prepare everything before stopping Courier.
   Telegram outages/rollback may extend this; no zero-downtime promise. Abort on
   failed handoff/readiness and never stop private bots to free resources.

## Failure and rollback decisions

Before code mutation, a migration failure can leave table/rows/grants present.
Inspect exactly which steps committed; keep the table and all data. Resume only
after schema/grant validation, or compensate only NEW grants from the original
preimage before starting an unpatched old validator. Never revoke an existing
grant merely because the migration was retried. Use compatible rollback validators
when grants must remain. Source helper rejects unknown/broad grant deltas.

For candidate startup failure, stop only candidate owners cooperatively. Restore
runtime files, control/source pins and actions consistently from the verified
backup; never start old/new owners together. Keep the latest database, journal,
ACK, offset, FIFO sequence, lease/fence, cache sidecar and outbox unchanged.

Web-only rollback may retain the new Courier: OFF enforcement continues even with
the old UI. Legacy Courier rollback does NOT enforce OFF. rollbackPlan rejects it
if any OFF exists, even when its grant validator is compatible. Leave Courier
fenced/stopped until the operator explicitly chooses recovery; do not silently
convert OFF to ON. If the operator authorizes returning all settings ON through
the audited API, verify that result before starting the legacy Courier. Retain
table/audit and never automatically replay commands ignored while OFF.

If cooperative stop, grant verification or rollback fails, leave the exact owned
service fenced and report the state. No force-kill, whole-database restore or
manual queue/journal/offset/ACK editing is an acceptable shortcut.

## Final offline result

Prior results for the combined local candidate are recorded here. The staged
Global Command split was checked separately by inspecting its diff.
Node 124 PASS (including 12 migration/rollback fixture tests), Python suite 119 PASS, browser scenario PASS (nine writes, stored/effective, old Courier, API failure, ADMIN), TypeScript and Vite build PASS. Exact active Web validator and active Courier identity/policy were compared read-only; active Courier validator was separately captured and its compatibility patch executed in fixtures. No MySQL connection, order/journal/queue data or secrets were read. Task metadata and source files were inspected read-only. A native MySQL migration/restore and fresh production backup remain explicitly unperformed until separately approved activation preparation.
