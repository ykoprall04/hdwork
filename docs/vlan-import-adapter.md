# VLAN import connection adapter

`scripts/lib/vlan-import-session.cjs` implements the existing importer's
`create() -> {pool, close}` contract. Merely requiring it opens no connection.
It reuses `operational-pools.options('write', env)` and the same protected bundle
bootstrap and validation used by Web. No Courier identity is used. No dotenv,
DPAPI file discovery or separate password storage is added.

An approved operator must supply the existing Web writer settings in the process
environment, including its existing `OP_WRITE_DB_PASSWORD_DPAPI_FILE` reference
and writer approval flags. This reference is a callback scope key, not a file
the adapter decrypts. No plaintext password environment variable is allowed.
The existing protected launcher must supply its validated bundle through owned
stdin, as it does for Web. The adapter selects only `writePassword` under the
`operational-write` policy, rejects equal reader/writer references, and clears
the parsed bundle fields after selection. Password remains in driver memory only.
An in-process approved caller can instead inject the existing scoped `readSecret`
callback via `adapter({env, readSecret}).create()`; this does not change `create()`'s
result contract. The adapter does not attach to or modify the running Web process.
Actual launcher/Windows identity integration remains a separately approved step;
an ordinary terminal without protected stdin cannot run apply successfully.

## One-shot operator connection check (source only; not activated)

The existing `run-protected-web.ps1` wrapper accepts `-CheckVlanAdapter`.
It uses the existing protected bundle bootstrap and runs the existing
`protected-web-service.js` entry with `--check-vlan-adapter`. This branch never
starts HTTP, auth pools, trial senders, raw logging or Web state writers.
It checks the adapter's database/account/UUID gates plus server hostname `woc`
and port 3306, closes connections and exits. The wrapper applies a 30-second
child timeout, emits only fixed PASS/FAILED JSON and never retries this mode.

Later, after approval, prepare an ACL-protected candidate snapshot containing
the reviewed wrapper, entry point, helper and adapter dependencies. Prepare its
existing-format Web control config with matching source hashes, Node pin and
encrypted-bundle pin; do not reuse stale pins or modify the active task/config.
The control path supplied here is a pin manifest, not a request to start its Web
supervisor. The mode requires LocalService (`S-1-5-19`), protected directory ACLs
and matching pins before bootstrap. It is not runnable from an ordinary user
terminal and does not grant itself elevation.

From a separately authorized operator execution context running as LocalService:

```powershell
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "<reviewed-snapshot>\scripts\run-protected-web.ps1" -CheckVlanAdapter -ExpectedServerUuid "<trusted-operator-UUID>" -ControlConfig "<reviewed-control-config>" -ConfigSha256 "<reviewed-config-SHA256>"
```

This is not an import and does not use `--apply`. Provisioning any one-time
LocalService execution context or candidate artifacts needs separate approval;
the active Scheduled Task target must remain unchanged. Do not run the normal
wrapper without the check switch as a connection test: that starts a Web child.

Mock verification:

```powershell
node --test tests/vlan-connection-check.test.cjs tests/vlan-import-bundle.test.cjs tests/vlan.test.js tests/production-control.test.js
```

Also supply `VLAN_IMPORT_SERVER_UUID`, obtained and independently checked through
an authorized operator session. Do not discover and automatically trust a UUID
from an unverified import connection. Before exposing the pool, and for each
connection acquired by the importer, the adapter checks:

```sql
SELECT DATABASE() AS db,CURRENT_USER() AS account,@@server_uuid AS server_uuid;
```

Required identity: database `hdwork2`, account `hdwork_ops_write@localhost`,
and exact expected server UUID. Failure closes the initial pool, or releases
the rejected subsequent connection, and returns a generic error without logging
configuration, credentials or driver messages. Permissions/schema prerequisites
remain a separate reviewed activation step; the adapter does not apply grants.

Default preview remains unchanged:

```powershell
node scripts/import-vlan.js --file "D:\VLAN_GABUNGAN (2).xlsx"
```

Only after approval and verified environment/schema/grants:

```powershell
node scripts/import-vlan.js --file "D:\VLAN_GABUNGAN (2).xlsx" --apply --session "D:\HDWork2-New\scripts\lib\vlan-import-session.cjs"
```

Offline verification (owned TCP-disabled MySQL; synthetic credentials only):

```powershell
node --test tests/vlan-import-session.test.cjs
```

Mock-only bundle/adapter verification without MySQL or secret access:

```powershell
node --test --test-name-pattern="bundle|mock|preview" tests/vlan-import-bundle.test.cjs tests/vlan-import-session.test.cjs
node --test tests/vlan.test.js
```

The fixture verifies all 426 Excel tuples, idempotent repeat import, account,
database and server rejection, Courier-account configuration rejection, safe
error messages and preview/apply separation. Production adapter initialization
is never invoked by these tests.
