# Batch 2 — conversation FIFO and independent durable ACK

Development implementation only. No deployment, production DB access, real Telegram sends,
service restart, schema execution or production pin edit is performed. One Telegram poller
remains. Existing flags are OFF by default, preserving the legacy schema/runtime path.

## Audit and resulting design

Old outbox ordering used due_ms + random UUID and could reorder equal-time enqueues or let
B skip A after A received 429. Journal next_ack selected the oldest sequence even when not
due; has_ack blocked every claim. ACK HTTP ran synchronously before/after sending. Restart
cached successful IDs but an interrupted SENDING row without a saved result could be retried.

FIFO mode adds a lane keyed by SHA256 of bot/chat/topic/original reply anchor; text is not
part of its identity. An existing order's operational notifications and chat share its
original Telegram anchor. Separate topics, bots, orders and alert anchors remain separate.
The lane row is locked transactionally while allocating monotonically increasing BIGINT
sequences. Producer retries can leave sequence gaps, which are harmless: ordering uses
existing predecessors, not contiguous integers. Idempotency/payload-hash conflicts still
roll back. Lane allocation serializes same-conversation producers through commit.

Claim first excludes any row with an earlier non-SENT predecessor in the same lane, then
locks an available lane with SKIP LOCKED and rechecks predecessors using a current locking read (FOR SHARE). This
avoids relying solely on a subquery read snapshot or SKIP LOCKED for correctness. A queued,
SENDING, retry-delayed, held, permanent failure or uncertain predecessor blocks its own
lane, including after lease expiry. It does not block other conversations. A bounded candidate scan can skip a busy lane while returning at most the requested
number of deliveries; it does not wait on a producer-held lane. No message is
merged, dropped, automatically skipped, or treated as sent to release successors.

ACK HTTP runs on at most one bounded daemon thread inside the same Courier process, using
a separate InternalClient and HTTP opener. It is not another Courier, getUpdates reader or
SQLite writer. Main thread owns all SQLite mutations, polls completed ACK results and
continues claiming eligible other lanes while ACK HTTP is slow. ACK processing also runs
before inbound polling/send cooldown. Existing delivery authorization, whitelist/topic
checks, lease ownership, internal HMAC/nonces, rate limit and polling schedule remain.

The journal records a result/cache before ACK submission. Independent due selection uses
(state=ACK_PENDING, due<=now) ordered by due/seq. Failure backoff is exponential (2,4,8,...,
max 300s including Retry-After), at most 8 attempts before ACK_REVIEW; 400/401/403/409/413 go
to review immediately. ACK bytes and cached Telegram IDs remain durable. This bounds auto
retry without silently discarding delivery evidence. Compare-and-set on original ACK bytes
prevents an old completion/retry from clearing or deferring a newer lease attempt's ACK.
On shutdown an in-flight ACK may be replayed idempotently after restart; its thread never
accesses a closed journal or sends Telegram messages.

A late ACK is accepted only for the same delivery lease while SENDING or held solely by
LEASE_EXPIRED; a changed token or conflicting committed ACK still fails. This resolves a
known durable cached Telegram result after the 60s lease without resending Telegram. ACK
settlements are audited with outbox ID/state. A successful ACK releases only its own head.
The current 2s Courier scheduling interval is unchanged: improvement targets blocked-ACK
and timeout cases, not a claimed Telegram 1–3s production guarantee. Inbound forwarding and
other backend/network bottlenecks remain measurable separately.

## Uncertain outcomes and reconciliation

Strict journal mode returns a cached Telegram success without sending again. A persisted
SENDING row with no result is a crash window and is never resent automatically. Network,
timeout and unknown outcomes use existing DEAD + uncertain error codes, displayed as
TIDAK_PASTI. Only proven Telegram 429 rejection is eligible for automated send retry after
backend reclaims it. Permanent failure/uncertainty retains the FIFO barrier.
Chat history now selects lease_until_ms so expired active delivery feedback can be identified.
Neither exactly-once transport nor an unknown Telegram response can be inferred from a
missing ACK. No Telegram search or real messages are used for tests.

An offline operator tool is available as `python -m courier.reconcile`:

- Required existing absolute --journal and --lock-directory. The existing OS polling lock
  prevents mutation while Courier is active. It never deletes/unlinks a lock or resets offsets.
- --list shows only delivery UUID/payload hash/state/attempts, no message bodies or credentials.
- --retry-ack with exact --delivery-id and --expected-hash reopens an ACK_REVIEW job. It
  retries the same backend result, never Telegram send, and records local audit metadata.
- --verified-receipt MESSAGE_ID additionally requires --evidence-sha256 and
  --confirm-original-chat-topic-reply after manual verification in authorized operator tools.
  It binds the exact delivery/payload hash/original lease, preserves conflicting success
  caches, records local evidence, and queues a success ACK. It does not send Telegram.

A verified-receipt ACK may upgrade a same-lease DEAD uncertain result to SENT, with explicit
reconciliation/evidence fields and backend audit. It cannot override a different lease,
replace another success ID, or automatically resolve a known permanent rejection. Evidence
verification is an operator responsibility; a hash alone is not proof of Telegram receipt.
Use the same approved DPAPI owner, stop the owned Courier first and preserve its journal;
no secrets are requested on argv. CLI/example usage must use actual verified paths and IDs.
Do not run reconciliation against a copied/empty journal or while the poller is active.

## Compatibility and activation prerequisites (not executed)

1. Review/back up existing schema and apply database/manual/015_hdwork2_fifo_ack.review.sql
   through the authorized migration procedure. It adds hd2_courier_lanes and nullable
   conversation metadata/indexes on outbox only. No data deletion/backfill/status reset is
   included. Actual MySQL lock/EXPLAIN and Windows startup validation remain required.
2. Review least-privilege lane SELECT/INSERT/UPDATE grants for operational writer and Courier.
   New exact grant profiles are chatWriteFifo / courierSendChatFifo; no lane access is given
   to the native read account. Missing schema/grants fail startup before accepting traffic.
3. Drain legacy in-scope non-SENT rows or review an explicit ordered plan while web and Courier
   are stopped. New FIFO claim rejects unsequenced non-SENT rows within the existing activation
   boundary, rather than guessing historical order or replaying old data.
   `fifo.sequenceReviewed(store, {entries:[{id,payloadHash}], reviewSha256,servicesStopped:true})`
   is an offline migration primitive, not an HTTP endpoint. Digest is the existing contract
   digest of {botId,entries}. It checks inactive worker lease under lock, no existing sequenced
   rows, exact hashes/IDs and complete in-scope coverage; allocates in operator-reviewed order;
   changes metadata only; preserves failures/bodies/status and records audit. It is not an
   automated backfill or a way to bypass uncertain messages. Do this before enabling writers.
4. Enable HDWORK2_COURIER_FIFO_ENABLED=true in reviewed web configuration. Approved production
   Courier plan may opt in with deliveryMode='fifo-ack-v2'; production loader then sets the
   backend flag and COURIER_FIFO_ACK_ENABLED=true for Python. Custom local compositions set
   these corresponding flags explicitly. FIFO backend requires chat+outbox enabled.
5. Courier validates a read-only authenticated capabilities endpoint before READY/claim and
   checks claim delivery_protocol='fifo-ack-v2'. Mismatched peers fail closed. Coordinate
   backend/web/Courier cutover with the same one-poller lock, bot identity, journal and anchors.
   Do not switch to FIFO while old writers can create unsequenced rows.
6. Prepare a new reviewed deployment packet with code, schema/grant proof, flags and pins.
   **The historical RAW LOG 1fc87f5 deployment helper is not a Batch 2 deployment tool** and
   deliberately rejects changed application sources. No such production cutover is run here.

SQLite journal initialization adds last_result/last_lease_token, a due index and a small
reconciliation audit table without deleting old rows or changing WAL/FULL durability. Back
up the stopped journal before an approved version change. Do not downgrade to a sender
that ignores strict crash-window rules or disable FIFO on an active v2 queue.

## Verification and limits

Mock/fixture tests exercise real store methods using a SQL contract double, and real temp
SQLite files / mocked HTTP using an actual blocked ACK thread. Cases include same-time and
concurrent producer FIFO, idempotency, independent lanes, 429/failure barriers, stale/late ACK,
restart cache, crash uncertainty, ACK exhaustion, CAS protection, protocol mismatch,
offline lock/audit reconciliation and old backlog review. No production DB or Telegram is
accessed. SQL double results do not establish real MySQL optimizer/locking performance;
validate index plans and concurrency on disposable MySQL data before production activation.
RAW LOG full storage, daily WIB rotation and 7-day retention are unchanged. Stage 1 viewer
shows the additional ACK_HTTP/ACK_RETRY/reconciliation events with existing redaction.

Development validation recorded: Stage 1 viewer 14 tests passed before its separate commit;
final Batch 2 full Node suite 520 passed, Python suite 66 passed, zero failures. All database
behavior tests used SQL doubles or temporary SQLite, not a production or real MySQL instance.
Actual Windows viewer mode checks and real MySQL concurrency/EXPLAIN remain pre-deployment
validation tasks. No claimed production latency improvement is measured by these fixtures.
