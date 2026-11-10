# Live Chat: runtime activation repair

Starting commit: `3e69ea6`. The exact message `Live Chat belum diaktifkan` is emitted
by the authenticated chat API when HDWORK2_LIVE_CHAT_ENABLED is not `true`.
A successful frontend build or push cannot change the environment of a running
Windows service. The protected supervisor loads service/environment.json in the
active snapshot, clears inherited runtime flags, and uses a separate DPAPI bundle.
Editing frontend .env or a shell variable does not enable this API.

## Confirmed release-check bug fixed

The release preflight always required the base `write` grant profile. Enabling
chat requires `chatRead`/`chatWrite`; these contain additional narrowly scoped
chat/system permissions, which the base reviewer correctly rejects as extra.
Thus a correctly provisioned chat writer could be rejected by release preflight.

The release check and operational pool manager now select the same exact profiles
from one pure helper. Base/system configurations keep their existing profiles.
Preflight verifies both dedicated identities, exact grants, system metadata and
chat schema using SELECT/SHOW and SELECT LIMIT 0; it does not create a schema,
change grants, copy order/customer records, or send Telegram. The historical
release script still performs its existing subsequent order/account inventory;
that script was NOT executed against any runtime in this work.

## Concrete configuration proposal

Only these two fields need changing if an approved operational writer already
exists:

```json
{
  "HDWORK2_SYSTEM_MONITORING_ENABLED": "true",
  "HDWORK2_LIVE_CHAT_ENABLED": "true"
}
```

The planner refuses read-only/session-audit-only deployments, absent write
approval and invalid persistent service/trial scope. A valid trial overlay may
coexist with an already approved general writer. Its flag/scope and secret bundle
remain unchanged; trial_yanto remains denied all Live Chat reads and replies.
It never silently changes OP_WRITE_ENABLED,
HDWORK2_OPERATIONAL_WRITE_APPROVED or HDWORK2_LOCAL_READ_ONLY. An unsupported
runtime needs a separately reviewed operational deployment, not this two-field
patch. Backend web Courier/network settings stay false and separate from the
new bot's dedicated Courier.

## Obtain a non-secret review from the Windows host

Run only on the intended HD Work 2.0 host, after updating the repository code.
This command is preparation only; no DB, network, restart, deployment, or secret
bundle access occurs. Do not run the historical operational-write deployment
script merely to enable these flags.

```powershell
$deployment = Get-Content -LiteralPath '.local/protected-web-deployment.json' -Raw | ConvertFrom-Json
$review = Join-Path $PWD ('.local/live-chat-' + [Guid]::NewGuid().ToString('N') + '.review.json')
node scripts/prepare-live-chat-activation.js --prepare --environment (Join-Path $deployment.snapshot 'service/environment.json') --output $review
```

The CLI accepts only an explicitly supplied service/environment.json, rejects
plain secret fields, does not read service/secrets.dpapi, never prints environment
values, never overwrites an output, and creates a private review JSON outside
service/. The review includes only source configuration hash, the two-field patch,
previous values of those same flags, and outstanding activation requirements.
`REVIEW_ONLY_NOT_ACTIVATED` must not be reported as a usable runtime.

## Activation still required on that host

Before applying the patch, an authorized operator must establish all of these:

- Current active backend source includes chat and the matching pool/release
  helpers; current frontend was built with the chat flag and correct API origin.
- Schema 012/013 and exact read/write chat grants already exist. Missing schema or
  grants require separate approval; do not run migrations or broaden grants here.
- Dedicated new bot Courier supports database routing/chat, exact verified mapping
  for TIAL/LOGIC, receive/outbox processing and approved Python sending. The old
  receive-only private launcher intentionally cannot send chat and is not changed.
- A controlled test order/topic and current owner/module grant are identified.
  Only HD/ADMIN/SUPER_ADMIN current owners of IN_PROGRESS may reply. No automatic
  takeover, arbitrary destination, speculative RECEK or ESKALASI is added.

Once those checks and the existing deployment/restart restrictions are explicitly
resolved, back up the non-secret environment preserving its ACL, confirm the
review hash still matches, apply only the two-field patch, and restart only the
approved HDWork2-Web runtime. Courier activation, if missing, is a separate scoped
change for the new bot. Do not restart or alter the legacy bot, Tunnel or VPN.
Actual config application/restart is deliberately not performed by the planner.

Verify authenticated conversation/history access first; then one approved reply
must retain the original bot/chat/topic/reply ID and progress from ANTRE to a
confirmed delivery message ID. Merely seeing ANTRE is not end-to-end success.
If startup/schema/grant checks fail, restore the non-secret environment backup
and the previous approved web runtime; do not disable validation to force it up.

## Verification boundary

Verification: 343 backend tests PASS, with focused activation/chat/pool regression
checks also PASS. Automated checks use synthetic environment objects, mock SQL adapters and private
temporary fixture files only. They cover the exact two-field diff, preserved write
permissions, trial isolation and read-only denial, grant-profile parity, missing/overbroad grants,
identity/schema rejection and a preparation CLI that leaves its input unchanged.
The existing real chat service mock tests retain ownership, session, CSRF,
idempotency, audit, original topic/reply and no-write-on-rejection checks.

No office service/environment, real credential, production DB, Telegram transport,
Windows task, Tunnel or VPN was accessed. This cloud checkout cannot access
D:\HDWork2-New or restart the office Windows service. Runtime activation and real
Telegram usability remain unverified until the host-specific steps above are
approved and executed there.

## Correction after host preparation feedback

The earlier LIVE_CHAT_REJECTS_RESTRICTED_TRIAL_RUNTIME gate was too broad: the
existing operational-write runtime permits a valid per-account trial overlay.
The planner now validates that existing scope and preserves it, including expired
trial behavior, instead of rejecting the entire approved general writer. It does
not turn off the trial flag: that could also break the protected bundle's expected
key set. A malformed trial scope or a deployment without the previously approved
general writer still fails closed. Runtime/schema/Courier checks remain pending.

## Approved host-side metadata preflight

After preparation succeeds, use Administrator PowerShell on the office host:

```powershell
.\scripts\check-live-chat-readiness.ps1 -Review $review -ApprovedReadOnly
```

`$review` is the existing review JSON path printed by preparation. The wrapper
verifies the environment hash before opening the unchanged LocalMachine DPAPI
bundle, then supplies only the existing reader/writer passwords to an owned Node
child through private stdin. Tokens and signing secrets are not forwarded. No
secret is printed, passed in command-line arguments, written to a file, or sent
to this chat. No ACL, bundle, environment, task or service is changed. The child
gets only OS-essential environment variables, has a bounded lifetime, and closes
its own DB connections. Do not paste a DPAPI bundle or credentials as input.

The probe is restricted to loopback hdwork2, the existing hdwork_ops_read and
hdwork_ops_write identities, SHOW GRANTS FOR CURRENT_USER, information_schema
column metadata, verified mapping category/profile and Courier lease metadata.
It never SELECTs order/user/message records and never executes database writes.
Missing columns are labelled MISSING_OR_NOT_VISIBLE because insufficient grants
can hide an existing table. Reports contain exact missing profile privileges,
missing/not-visible column names, per-category coverage and lease evidence only;
no raw grants, passwords, chat IDs, bot IDs or customer data are printed.

The probe also compares selected active backend source files with the repository,
without changing either. A mismatch requires a reviewed backend update, not just
flag activation. WEB_SCHEMA_GRANTS_PASS is only a web schema/grant verdict: it
never certifies Courier sending or real Telegram delivery. Actual flag application
and restarts still follow the remaining host checks. The PowerShell wrapper is
reviewed but not executed in the Linux cloud; the Node path is tested with fixture
connections and private temporary configuration files, not the office database.

Host-probe verification: 350 backend tests PASS, including 7 metadata/credential-
transport fixture tests. No host-side probe was executed from the cloud.
