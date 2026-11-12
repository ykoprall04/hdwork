# Courier v2 preparation follow-up — application 707f7ec

Preparation-only continuation of operator packet
`C:\ProgramData\HDWork2CourierV2Prep-2b68c600f8ce44c2a033f9b3902260e9`.
Expected preparation SHA256:
`c48da7844ee8f854e247336c4dbb7305554224be8cbe2ed54d6ff5bab6ff084b`.
No token/password/bundle/env decryption or production database connection is implemented
by the new follow-up helper. Do not run the older preparation helper under this restriction.

## Frontend evidence (cloud staging, not Windows production)

- Exact clean checkout `707f7ecd1aaafc810199e1016598d577f7e4390f` before/after build.
- Locked `npm ci --prefix frontend`; official `build-operational-frontend.js --build`,
  API origin `https://hdwork2.yoloo.space`, cookie/operations/live-chat flags enabled.
- Official `frontend-only-release.verified()` validates all 57 static files and entry assets.
- Manifest SHA256: `1cea13d83a7bbb73e57ae0be87811299c0cc55ed0d65383f39df9d4f0e409341`.
- Cloud directory `/workspace/work/courier-v2-staging-707f7ec/frontend/dist`.
  Build artifacts are not committed/transferred as archives. Windows helper builds from
  GitHub independently and records its actual hash; cross-platform byte identity is not assumed.
- Follow-up generates a manifest and provenance report only, no active-dist plan/Apply call.

## Production schema: TIDAK DAPAT DIPASTIKAN (izin)

Prior audit could not establish whether schema 015 is absent or invisible to Courier.
Use `database/manual/015_metadata_dead.readonly.sql` ONLY inside an existing authenticated
metadata-capable MySQL console. No new connection/access path or credential handling here.
Share only resulting metadata, not connection settings or authentication material.

- TERPASANG requires actual lane/outbox columns, types/nullability/defaults/collations,
  InnoDB and exact indexes matching 015. Partial/incompatible installation remains blocked.
- BELUM TERPASANG requires a sufficiently privileged metadata account proving absence
  (e.g. direct SHOW CREATE returning 1146). Empty information_schema alone is insufficient.
- 1142 or unverifiable metadata privileges => TIDAK DAPAT DIPASTIKAN (izin).
- Migration 015 is additive, not idempotent and MySQL DDL can commit partially. Never run it
  over a partial installation. Dependency for the changed outbox structure is migration 004;
  migration 012 separately adds delivered_at and the complete application has further
  prerequisites. The isolated rehearsal tests 004 + 015, not production equivalence.

`tests/rehearse-schema015.py` creates its own unique network-disabled, tmpfs MySQL 8
container. It validates real DDL/indexes and fixture DEAD predecessor/legacy gating, then
removes only its own container. It never uses production data or credentials.

## Grants review file only

`database/manual/015_fifo_lane_grants.review.sql` contains two table-scoped grants for
the exact existing writer/Courier localhost accounts: SELECT, INSERT, UPDATE, no DELETE,
no reader change, no account creation. Required by fifo.allocate (insert lane, select next_seq
for update, increment next_seq) and fifo.head (read/lock lane). Migration SQL contains no
grant execution; the follow-up helper copies both as separate review files without execution.

## Five DEAD rows: individual evidence pending

Operator output established DEAD=5, but omitted IDs/times/attempts/error codes and results.
No per-message cause or sent/not-sent conclusion is supported yet. Metadata SQL emits only
ID/time/state/attempts/errorCode/Telegram-result-present, not payload/route/customer details.
Optional JSONL export can be checked with:

```powershell
python.exe -B .\scripts\review-courier-v2-backup.py --directory <preparation> --dead-metadata <jsonl>
```

Reader verifies the original preparation hash, backup SHA and SQLite integrity in immutable
read-only mode. It queries only result/ACK presence booleans per ID, not ACK content/tokens.
No match in an older backup does NOT prove Telegram never received a message.
Cached success => hold/no replay, review ACK evidence. Transport timeout/lease expiry =>
uncertain, hold/no replay. BAD_REQUEST alone cannot distinguish invalid route from other
rejection; FORBIDDEN/RATE_LIMIT evidence indicates rejection but is not retry authorization.
Database causes require matching audit/error evidence; do not infer them from retry count.

**Activation blocker confirmed by code:** mysql-store.claim checks every in-scope non-SENT
row lacking FIFO metadata and returns FIFO_LEGACY_BACKLOG_REVIEW_REQUIRED, including DEAD.
It does not automatically retry DEAD. With FIFO metadata, DEAD blocks later rows in that
same conversation (`prior.state <> SENT`), while other lanes remain eligible. Thus simply
sequencing DEAD does not remove the hold on its conversation; excluding it could skip an
uncertain predecessor. No bypass, sequence assignment, retry or status change is authorized
or implemented in this continuation. Stop activation pending explicit per-row disposition.

## Windows staging and final gate

Run `scripts/stage-courier-v2-followup.ps1` from the GitHub helper checkout. It checks the
previous preparation hash, verifies only the offline backup, creates a new private child
directory, copies review SQL, clones exact application target and builds/attests frontend.
It makes no production DB requests and cannot certify live schema/DEAD details automatically
without the already-authenticated metadata console results.

No service restarts, production migrations/grants/config/pins/flags/data changes, Telegram
calls, retention jobs, bot operations or main merge occur. The last task was truncated after
"backup SQLite"; only original offline backup hash/integrity are rechecked pending the rest.
