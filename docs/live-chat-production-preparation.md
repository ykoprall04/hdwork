# HD Work 2.0 production activation preparation

This prepares a reviewable release. It does not deploy, alter a database/config,
restart a service, decrypt a token or contact Telegram. Schema/grants were reported
PASS by the office operator; they must be rechecked at the actual change window.
The operator has now supplied a bot identity and three non-topic candidate groups.
Their values stay in private host input, not in the checked-in template. Actual
Bot API verification and local internal-namespace binding are still required.

## 1. Safe backend comparison and backups on the Windows host

Use Administrator PowerShell after pulling this branch. Keep the existing
activation review whose hash still matches service/environment.json:

```powershell
cd D:\HDWork2-New
git pull --ff-only origin chore/remove-cacti-hdwork2
if ($LASTEXITCODE -ne 0) { throw 'Sinkronisasi gagal.' }
$review = Join-Path $PWD '.local/live-chat-144eed1b7e22488cb7e0979efc35d1ce.json'
.\scripts\prepare-live-chat-production.ps1 -Review $review
```

The wrapper creates a NEW private C:\ProgramData\HDWork2LiveChatPreparation-*
folder readable only by SYSTEM/Administrators. It does not change existing ACLs.
The Node tool stages beneath it, outside both repository and active snapshot.
Only an encrypted copy of the existing DPAPI bundle is backed up; it is never
decrypted, converted or used as a credential. No bundle is committed to Git.

The five requested root files are src/chat/service.js,
src/config/operational-pools.js, src/config/live-chat-activation.js,
src/system/routes.js and src/system/store.js. Their literal local CommonJS
requirements are followed recursively (21 files in the current graph). This is
necessary: src/system/policy.js may also require the HD-viewer update. Static
relative require resolution is reviewed, not a claim to discover dynamic imports
or npm's transitive dependencies. The backend package-lock must match exactly
apart from CRLF normalization; this tool never installs dependencies.

For every required file:

- MATCH: preserve it; no replacement payload is needed.
- KNOWN_ANCESTOR: bytes match a committed ancestor of the target HEAD; stage the
  target and back up the original exact bytes. Windows CRLF alone is recognized.
- NEW_FILE: stage an absent required file; record its prior absence for rollback.
- UNRECOGNIZED_RUNTIME_CHANGE: BLOCK the overlay, report names/hashes only, and
  do not copy the unknown source into a payload or print its contents. Review
  that local change privately before producing a separate reviewed merge.

Dirty source worktree files, unresolved dependencies, links, mismatched locks,
changed environment hashes and runtime files changing during preparation also
block. There is no force/overwrite option. Do not reset or delete local work to
make a blocked report green. Shallow/unavailable history may need a reviewed
history fetch; an unrecognized file is not proof it is a bad edit.

A successful STAGED_NOT_ACTIVATED result means only backend payload/config/ciphertext
backups were prepared and verified by SHA-256. No active file was changed. The
protected plan includes per-file preimage/target hashes, recognized ancestor,
exact two-flag patch, backup hashes and rollback conditions. Each staged JS file
is syntax checked without executing it. State/order files and other runtime
customizations are not overwritten or copied wholesale.

The summary also inventories HDWork2* task names, states and executable basenames
only. It never reads task arguments or process command lines. This inventory is
not proof of bot ownership and must not be used to restart an unidentified task.
Keep/send the printed summary; do not send backup files, environment contents or
DPAPI bundles. The full private plan is production-plan.review.json in the output.

## 2. Original verified Telegram routes: mandatory input

No chat ID, topic ID, token, bot ID or Courier port is defaulted. The checked-in
ops/examples/hdwork2-live-chat-production-routing.review.json is intentionally
empty and not activatable. Make a private file outside Git with version=1,
environment=production, newBotIsolationConfirmed=true and targets containing:

- botId: existing internal namespace; botUsername: the actual verified username.
- category/profile: TIAL with TIAL1/TIAL2, or LOGIC with SOLVER1.
- chatId: original negative group ID as a string.
- threadId: the verified positive topic ID as a string, or explicit null for a
  verified non-topic group. Omission is rejected; it never becomes a guess.
- verified=true, verifiedBy, verifiedAt (timestamp), evidence (reference/source).

Both categories must be represented. Duplicate bot/chat/topic destinations,
profile mismatches, conflicting usernames for a namespace, future/absent
verification, unknown input fields and credential-looking input are rejected.
An active trial overlay sharing the bot namespace needs collision review; its
flag, scope and secret bundle are not disabled automatically.

Use -Routing <private-file> with the preparation wrapper once that evidence is
available. OPERATOR_ATTESTED_HOST_VERIFICATION_PENDING is deliberately not actual
Telegram verification. A local approved credential consumer must confirm getMe
identity, getChat access and bot rights for the exact new bot. getChat alone does
not prove a topic exists; use operator/topic evidence or existing journal metadata.
Do not call getUpdates to verify a topic: it can compete with the current poller.

Before enabling DB mappings, compare current mapping IDs/versions, exact bot/chat/
topic and conflicts. Use the existing authorized mapping API with CSRF, optimistic
version, idempotency and audit. The preparation tool does not seed/overwrite rows,
choose an existing mapping ID or mark a destination verified in the database.
RECEK/ESKALASI rules remain unchanged and are not invented.

## 3. Courier verification and recovery plan

The plan derives command groups from the existing TIAL/LOGIC contracts and the
operator-provided targets. It records required Node/Python flags separately as
future requirements, never as an applied environment. serverUrl/task ownership
remain unknown until the existing new-bot runtime is identified. sendEnabled
remains false in the preparation output.

Required host checks before any recovery:

1. Identify the exact new-bot Node/Python tasks/snapshots, principal, entry point,
   localhost port, existing protected secret references and actual bot identity.
   Never select a task merely because its name contains Courier. Never print a
   token or pass it on a command line. Existing old-bot processes remain untouched.
2. Match Node/Python Courier source to the reviewed release, validate the exact
   courierChat/courierSendChat grant profile and existing schema read-only. The
   existing web GRANT approval is not an approval to widen Courier DB grants.
3. Validate DB routing/chat on both components and compatible group snapshots.
   The old private receive-only launcher intentionally cannot send chat; do not
   weaken or repurpose it. A production launcher/plan needs the actual protected
   new-bot layout, not a fabricated token/key path.
4. Inspect inbox/outbox/journal metadata for this bot, including QUEUED/SENDING/
   DEAD counts and prior trial backlog. Do not auto-drain a backlog or reset DEAD,
   NETWORK/ambiguous delivery or journal offsets. Existing retry/idempotency rules
   and original topic/reply anchors remain mandatory.
5. Confirm no duplicate poller or active lease owner. Restart only the verified
   new-bot components in their approved window if needed. The Python worker
   acquires/renews its lease through the signed normal protocol; the backend's
   lease duration is 60 seconds. An active conflicting lease is not permission
   to delete it, forge a heartbeat, or start a competing worker.
6. Observe genuine lease/heartbeat and journal progress. Lease evidence is not
   confirmed Telegram transport/delivery. Do not mark routing ONLINE based on an
   empty queue or manually written database row.

No actual recovery can be claimed before this host evidence. No production
message is sent before routing is verified; an end-to-end test also needs a
precise approved destination/message and operator-controlled order ownership.

## 4. Frontend and backend activation preparation

The private plan takes apiOrigin from the validated existing service environment;
there is no unverified fallback. The operational build includes auth cookie,
operations and Live Chat flags. A cloud production build for the existing
https://hdwork2.yoloo.space origin passed; that is a build only, not a deployment.
The Windows operator should build with the plan's actual apiOrigin and record the
successful FRONTEND_MANIFEST_SHA256. The static release tool independently verifies
manifest hashes, index assets, origin, backup and loopback HTTPS health.

Backend backups in this tool do NOT include the active frontend. The plan explicitly
reports frontendBackupStatus=PENDING_VERIFIED_FRONTEND_STAGE. Use the separate
frontend-only Stage mode for that verified build before any static switch. Do not
use the historical operational-write deployment script to activate feature flags.
Preview source/design and all existing operational role/owner/module guards stay
unchanged. An ADMIN/SUPER role still cannot reply to another user's order.

Only after reviewing all stages and a fresh host readiness report should the web
be paused, preimage hashes rechecked, the reviewed overlay and two flags applied,
and only the verified HDWork2-Web task restarted. Do not hot-copy loaded source
into a running Node process. The preparation tool offers no apply/restart mode.
Real startup must pass identity/schema/exact-grant checks before READY; authenticated
API/chat/history/role-denial checks precede any delivery verification. If the
legitimate environment changes, produce a new activation review before the next
hash-pinned readiness call.

## 5. Rollback readiness: code, configuration AND grants

All changed known source, exact prior environment bytes and the encrypted bundle
are backed up. Newly added files have absence markers; only files whose current
hash still matches this release may be removed/restored. Unknown independent
changes stop rollback. The credential bundle is preserved byte-for-byte; there
is no automatic token/password rollback, rotation or overwrite.

A material compatibility condition remains: the DB now has chatRead/chatWrite
grants while the previous feature-off environment may expect base profiles.
Blindly restoring old source/flags and restarting can fail exact grant validation.
The plan computes rollbackGrantAlignmentRequired and records both profile sets.
A backup is not proof that the old configuration can boot against today's grants.
Verify a restartable compatible fallback before stopping the current web process.

The previously reviewed web-grant rollback SQL is a conditional DBA option only,
not an automatic part of file rollback. Any REVOKE execution needs its own explicit
approval and a fresh check that no independent grant changes occurred. Alternatively
review a compatible code/config rollback that keeps already approved grants. No
GRANT/REVOKE, database migration, lease cleanup or data restore runs from staging.
Frontend rollback uses its own verified backup and retains old hashed assets.
Courier rollback must preserve its journal/cursor/outbox state and stop only the
verified new-bot instance; it must never retry an ambiguous delivery to look healthy.

## Verification and unresolved facts

Tests use isolated Git histories, fixture configuration and synthetic encrypted
bytes only. They verify historical-version recognition, dependency staging, CRLF,
exact backups, unknown/dirty-source/lock/link rejection, unchanged runtime/config,
explicit routing/evidence/credential validation and no side-effecting wrapper
commands. A real public historical f875aed source snapshot rehearsal found the
five root updates PLUS src/system/policy.js, and staged them without changing the
synthetic runtime. The Windows wrapper has not been executed in this Linux cloud.

The candidate external bot/group IDs are now supplied. Actual Telegram checks,
the local Courier namespace binding and exact new-bot task/snapshot/port remain
unverified. No real routing write, Courier recovery, lease restoration, frontend
switch, backend synchronization or restart was executed from this cloud checkout.
Schema/grant PASS alone is not a claim that production Live Chat can send.

Verification for this preparation change: 373 backend tests PASS, 72 frontend tests
PASS and 34 Python Courier regressions PASS; the focused preparation/readiness/
activation checks pass; the real-routing verifier has 9 passing fixture tests. Full frontend lint exits 0 with the existing
25 reviewed warnings. The production frontend build passes with manifest SHA-256
9b2b77ab185577801da7c7b30d2463d20ed68d80bac2889bdc030b93e282779b.
Generated dist/manifest and private backup artifacts are not committed or deployed.
