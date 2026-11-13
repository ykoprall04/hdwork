# Windows production deployment procedure — Courier writer v2

Status: **BLOCKED; not an executable cutover approval**. Continue from remediation commit `54ffc01`. This procedure adds operational checks, not another run of already-passed integration tests. All commands below run from `D:\HDWork2-New\courier-v2-fifo-dev` in Windows PowerShell. Stop on every nonzero native-command exit code (`$LASTEXITCODE`); PowerShell's ErrorActionPreference alone does not enforce that.

## 1. Read-only inspection now

```powershell
powershell -NoProfile -NonInteractive -File ops/windows/inspect-web-retirement.ps1
```

Exit 2 with `BLOCKED_LEGACY_OWNER_NO_EXTERNAL_STOP` is an expected blocking result, not permission to stop the task. Latest observation: HDWork2-Web Running, task priority 7, no cooperative binding. The installed `run-protected-web.ps1` keeps the child's stdin private, waits for exit and can Kill during cleanup. The installed child has neither transaction accounting nor the new drain protocol. Closing a duplicated pipe, injecting code, terminating the owner, Windows signals, updating source under a living process, and Stop-ScheduledTask are not supported retirement methods. An operator must supply an owner-supported method that blocks new requests, drains all in-flight requests/transactions, closes pools, prevents owner restart and proves process exit without force. If none exists, this first handoff is impossible under the current constraints. Approval alone does not fix that technical limitation.

```powershell
node scripts/check-web-health.cjs 3090 8443 C:\ProgramData\HDWork2\cloudflared\origin-ca.crt .local\health-before-UNIQUE.json
if ($LASTEXITCODE -ne 0) { throw 'Production health gate failed' }
```

Use a new receipt filename each time. This makes five sequential rounds of actual API /health and /ready, CA-verified origin HTTPS, and protected-boundary checks. Each request has a five-second total deadline; no cached PASS, retries that hide failure or TLS bypass. Latest execution failed `HEALTH_DEADLINE`; do not claim stable production health. Diagnose resource pressure with read-only process/task/memory observations and approved host maintenance; do not kill other bots/browsers or raise the deadline to obtain a PASS. After resolving the cause, require all five rounds to pass again. This checks loopback only, not Cloudflare or installed credential identity.

## 2. Bind the real tunnel before approving deployment

The currently inspected origin is `https://localhost:8443`, hostname `hdwork2.yoloo.space`. Planned compatible candidate: `https://localhost:8444`; compatible rollback: `https://localhost:8445`. Preserve `originServerName=localhost`, `noTLSVerify=false`, the existing CA path, rule order, other hostnames and catchall.

The tunnel administrator must identify the actual Cloudflare account/tunnel, authenticated management identity, least-privilege authority to edit that tunnel, configuration version, and a change window excluding concurrent configuration editors. The existing tunnel connector token is not evidence of management authority. Do not decrypt it to attempt API administration. Neither an authenticated management adapter nor its credentials are currently bound. The following tool only compares real configuration exports; it never contacts Cloudflare:

```powershell
node scripts/review-web-ingress.cjs C:\PrivateReview\ingress-before.json C:\PrivateReview\ingress-candidate.json https://localhost:8444 C:\PrivateReview\ingress-review-UNIQUE.json
if ($LASTEXITCODE -ne 0) { throw 'Ingress scope gate failed' }
```

Export JSON configuration from the actual tunnel, retaining all fields. The candidate export must differ only in this hostname's service. The receipt pins the complete before/after configuration and unchanged fields. Require the administrator to re-export immediately before apply and compare the complete normalized before hash; STOP on version/hash drift. A matching export does not establish authentication or authorize apply. After separate approval, the administrator applies the reviewed configuration to the identified tunnel using the organization's supported management interface. Capture its audit/version result, re-export, and require the after hash to equal the reviewed after hash. Verify every other ingress, TLS and catchall unchanged. No automatic API write command is provided because the production identity/binding is unresolved. Do not restart cloudflared or other bots as a substitute.

## 3. Stage only after separate staging approval

Use new immutable directories outside the live snapshot; never overlay the active directory. Regenerate the existing writer-overlay preparer from the reviewed commit, using the installed baseline and dependency lock. Existing prepared artifacts are rehearsal artifacts; do not relabel their commit or move them without regenerating absolute paths and hashes. Native control configuration now includes targetCommit required by approval checks; older generated configurations lacking it must not be activated.

Record candidate/rollback manifest hashes, native config hashes, binary hashes, environment/bundle hashes, frontend hash and current Courier source pins. Keep Courier/testing transport flags false and exact scope `["hdworkopsbot-testing"]`. Production tasks: HDWork2-Web-Standby and HDWork2-Web-Rollback; LocalService; Normal priority 4; IgnoreNew; no hard termination, execution deadline or automatic restart. Inspect the generated task settings and approved task action exactly before registration. Keep startup fences present until approved launch. Apply read/traverse ACL only to immutable runtime files for LocalService; write permission only to the required state/temp paths. Preserve owner/System/Admin control access. Do not grant LocalService write over executable source or expose encrypted bundle/TLS material to ordinary users. Validate actual ACLs under the service identity.

Start candidate on API3092/HTTPS8444 and rollback on API3093/HTTPS8445 only after launch approval, with existing protected bootstrap. This is a production credential launch even while no public route points to them. Missing binding, TLS, port conflict or secret identity is STOP. Do not launch the backend or Python Courier. Candidate and rollback use identical FIFO/fence guards; the old legacy binary is not a compatible rollback.

```powershell
node scripts/check-web-health.cjs 3092 8444 C:\ProgramData\HDWork2\cloudflared\origin-ca.crt C:\PrivateReview\health-candidate-UNIQUE.json
if ($LASTEXITCODE -ne 0) { throw 'Candidate health failed' }
node scripts/check-web-health.cjs 3093 8445 C:\ProgramData\HDWork2\cloudflared\origin-ca.crt C:\PrivateReview\health-rollback-UNIQUE.json
if ($LASTEXITCODE -ne 0) { throw 'Rollback health failed' }
```

Verify source/env/binary pins, actual database identity/grants and installed one-bot scope independently; HTTP 200 does not attest those. Exercise no real chat send merely to check health. Opening the writer fence is excluded.

## 4. Retirement and fresh recovery pair — approval required

First capture current source/process/task identities, other-bot PID/start times, complete ingress configuration, all 18 DEAD metadata digests, target queue/lane/journal state and schema/grants read-only. Verify 015–017 and existing grants without applying them. Stop on unexpected queue, lease, writer, scope or fence state. Historical counts are not current proof.

Use `scripts/control-courier-writer.js` and its existing production session/approval contract for a separately approved CLOSED fence action. Initialize only if absent; never reinitialize an existing row. A CLOSED row does not stop the legacy writer. Complete the supported legacy retirement method from section 1 before claiming quiescence. No implementation of that method is presently available.

For later native owners only, use the installed pinned `web-native-control.ps1 -Mode Inspect` before any control. With a separately approved plan/native config, StopFence creates a persistent startup fence and disables only the exact task before cooperative STOP; timeout retains ownership and means STOP. AssertFence subsequently verifies the same barrier. Do not invoke these against the legacy owner.

```powershell
# Future native owner only; variables are exact reviewed absolute paths/hashes.
powershell -NoProfile -NonInteractive -File $ControlScript -Mode Inspect -ControlConfig $ControlConfig -ConfigSha256 $ConfigSha256
if ($LASTEXITCODE -ne 0) { throw 'Native identity failed' }
# Mutation command: only after separate signed/reviewed handoff approval.
powershell -NoProfile -NonInteractive -File $ControlScript -Mode StopFence -ControlConfig $ControlConfig -ConfigSha256 $ConfigSha256 -PlanSha256 $PlanSha256 -BarrierId $BarrierId -ApprovalFile $ApprovalFile -Execute
if ($LASTEXITCODE -ne 0) { throw 'Cooperative stop failed; no forced fallback' }
```

Do not use the web control receipt alone as a combined Courier/database barrier: independently verify Courier remains disabled/stopped and read `service/state/state.json` from the exact stopped child. Require matching PID, STOPPED, and drainReceipt DRAINED, zero activeRequests/activeTransactions, poolsClosed=true, forced=false. Verify no replacement owner/listener and all managed target producers inactive; then verify the current even CLOSED fence epoch through an authenticated pool. A process exit or idle SQL snapshot alone cannot establish that transactions drained.

Bind `scripts/lib/courier-paired-backup.cjs::pairedBackup` to these **real** arguments before approval:

| Argument | Required production binding |
| --- | --- |
| source | Existing authorized MySQL connection, hdwork2 on 127.0.0.1:3306; actual server_uuid verified |
| auth.loginPath | Owner-managed existing backup login path with sufficient dump rights for users and hd2_*; no password in command line, no new GRANT |
| sqliteSource | Exact current inactive Courier journal path, verified from pinned production plan/runtime |
| scope | botId hdworkopsbot-testing and freshly inspected CLOSED fenceEpoch |
| barrier/assertQuiescent | Real retirement proof plus repeated native/legacy owner, all-target-writer, Courier/journal and DB fence checks; never a constant true callback |
| restore | New owned MySQL datadir, unique hdwork_admin named pipe, TCP disabled, hdwork2 absent; authenticated offline connection and matching CLI UUID |
| directory | New private backup directory; no overwrite of historical backup |
| mysqlBin/python | Reviewed absolute binaries and hashes |

The authorized backup identity/login path and callable production quiescence session remain unbound. Do not invent a session module or use the courier account as if it had full dump privileges. This helper is executable, but the production invocation cannot be completed safely until these bindings exist. It performs dump and SQLite backup, restores only into the owned offline MySQL instance and separate SQLite copy, checks table coverage/integrity and complete scoped digests, and rechecks quiescence. Never point restore to production or restore the historical SQL file.

Require receipt scope BOT_OUTBOX_LANES_AND_JOURNAL, matching bot/epoch/barrier, restoreRehearsalVerified=true, globalWritersQuiesced=false, automaticProductionRestoreAllowed=false; independently verify receipt/artifact hashes and all 18 DEAD digests unchanged. No old allowlist/admin18 executor, database reset, replay, lane backfill or message mutation is part of this procedure.

## 5. Approved handoff and post-check

Only proceed after retirement, candidate and compatible rollback health, current recovery pair and authenticated ingress/version binding all pass. Immediately repeat the gate assertions. Apply exactly the reviewed candidate ingress under the administrator's change lock. Verify the exported full after hash/version and all non-HD Work rules. Check public HTTPS root returns the application, authenticated read/session flows work, and /ready, /internal, /legacy and DevTools remain inaccessible. Do not expose /ready publicly to debug it. Repeat local candidate health and actual pin/identity checks; observe five successful rounds across the handoff and a further five after 60 seconds. Capture latency and any failures without silently retrying them away. Check other bot PID/start times/listeners/ingress unchanged, Courier task disabled/no managed sender/Python, queue/journal unchanged, fence still CLOSED and all 18 DEAD digests identical.

This sequence can incur a maintenance interval between proven retirement and completed backup/route switch. Its duration cannot be promised before real bindings/recovery timing are known. Do not reorder steps to reduce downtime by weakening quiescence.

## 6. Rollback decision and approval boundary

On candidate health, ingress drift, identity/pin mismatch or DEAD digest change: stop progression, keep sender off and bot fence CLOSED, preserve evidence. Never retry message sends or restore data. Before applying rollback ingress, run the compatible rollback verifier with real authenticated pool/current CLOSED epoch and actual installed source/env paths, then repeat rollback health. Prepare/export rollback configuration changing only this hostname to https://localhost:8445; run review-web-ingress against the current actual export and this rollback export, and require unchanged other fields. With the preapproved rollback scope and fresh version/hash, administrator applies the exact rollback route and verifies export plus public/local health and other bots again. Drift, missing compatible rollback health or unproven owner drain means STOP for operator decision; do not return to the unfenced legacy writer or force-stop a timed-out candidate.

If legacy retirement fails before ingress changes, leave ingress unchanged and preserve ownership. If failure occurs after legacy retirement but before candidate launch/route, do not restart the legacy writer automatically. Use only the approved compatible runtime after verification. Task cleanup or stopping an already-launched candidate is a separately scoped cooperative action; do not use a global task/bot restart.

## Required approvals and present decision

All gates are **not ready**. Retirement has no supported binding; authenticated ingress editing is unbound; production health timed out; fresh production recovery identity/quiescence binding is unbound. Do not request unconditional cutover approval yet.

The next operator input is the supported legacy retirement method and named tunnel/backup administration access, without pasting credentials. Once reviewed, request approval for an exact manifest covering immutable staging/ACLs, scoped task registration/launch, CLOSED fence action/epoch, retirement method and bounded maintenance window, real fresh recovery rehearsal, the single-host ingress before/after hashes/version, and compatible rollback conditions. Each mutation must be explicitly included; staging approval alone is not cutover approval. Writer reopening and Courier/Telegram delivery remain separate later approvals and are excluded from this plan.
