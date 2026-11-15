# VLAN import connection adapter

`scripts/lib/vlan-import-session.cjs` implements the existing importer's
`create() -> {pool, close}` contract. Merely requiring it opens no connection.
It reuses `operational-pools.options('write', env)` and the existing
`private-database-env.readPrivateDpapi` helper, without dotenv or automatic
production-runtime discovery. No Courier identity is used.

An approved operator must supply the existing Web writer settings in the process
environment, including its existing `OP_WRITE_DB_PASSWORD_DPAPI_FILE` reference
and writer approval flags. No plaintext password environment variable is allowed
by the existing options validator. The DPAPI helper retains its existing file,
scope and Windows identity requirements; this adapter adds no secret storage.
Compatibility with the actual production credential reference and executing
Windows identity must be verified during a separately approved activation.

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

The fixture verifies all 426 Excel tuples, idempotent repeat import, account,
database and server rejection, Courier-account configuration rejection, safe
error messages and preview/apply separation. Production adapter initialization
is never invoked by these tests.
