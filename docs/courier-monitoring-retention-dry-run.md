# Batch 6: metadata metrics and retention dry-run only

No cleanup timer/job, deletion endpoint, database driver, DELETE/UPDATE query or automatic
purging is added by retention-dry-run.js. It accepts explicit metadata snapshots and returns
candidate UUID/content-field names plus protected reason counts; never bodies. Actual live
cross-store snapshot collection is not wired or executed. Unknown confirmation/provenance
is protected, not guessed. Original-order classification must be explicitly false.

Cutoff is most recent 00:00 WIB (17:00 UTC prior day), frozen by fixedCutoff across batches.
Both creation and processing completion must precede it. OUT requires SENT, Telegram ID,
SETTLED journal and explicit no retry/ACK pending. IN requires PROCESSED inbox/ACKED journal.
Original order messages, current/unprocessed/failed/uncertain rows and missing anchors are
protected. Default batch 200, max 500. Output proposes content redaction only across chat,
outbox/inbox payload text/attachments and journal incoming chat copy; it preserves entire
order/status/audit, Telegram IDs, reply anchors, dedup, success cache, offsets and route fields.
Input objects are never mutated. No actual content is read by this pure planner.

courier-log-metrics.js reduces existing sanitized records to stage counts/errors, reason
counts, maximum queue age and duration p50/p95/max (percentiles only with >=20 samples).
CLI reads a local log file, caps the window at 100k metadata records and prints no raw lines.
Queue timing/ACK retry fields reuse RAW LOG. Scheduler 429 telemetry adds a hashed group key,
current adaptive rate and retry_after; no group/chat body or credentials are exposed.
No claim of measured production latency, physical erasure or 24h real production soak.

Tests use frozen metadata/temporary fixtures only. Verify no input mutation, current/pending/
failed/uncertain/retry/ACK protection, IN prerequisites, fixed WIB cutoff across midnight,
original-order protection and secret-free metrics. Production cleanup remains disabled.
