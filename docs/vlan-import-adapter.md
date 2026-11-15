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
