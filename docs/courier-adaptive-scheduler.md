# Batch 3: adaptive outbound scheduler (opt in)

Requires FIFO/ACK v2 and coordinated schema/writer rollout. Production plan may set
adaptiveScheduler=true and optional telegramLimits={groupPerMinute:18,globalPerSecond:1}.
Local environment equivalents: COURIER_ADAPTIVE_SCHEDULER_ENABLED=true,
COURIER_GROUP_MESSAGES_PER_MINUTE (1..18), COURIER_GLOBAL_MESSAGES_PER_SECOND (.1..1).
Default group pacing 18/min, global 1/sec, no burst bucket. Keys derive from actual chat_id,
not configured group names. Reservation/cooldown/rate are committed in SQLite metadata
before Telegram send. Restart cannot erase a known pacing reservation. On 429 only that
group slows (rate * .8, minimum 1/min) and waits retry_after. After 20 durable successes,
rate recovers by 1/min up to configured maximum. Cached success never re-sends Telegram.

Claim excludes currently blocked group IDs via bound SQL parameters, only in FIFO mode;
messages remain in MySQL, no RAM-only delivery queue. Same-order FIFO and failed/uncertain
barriers remain. Busy work no longer has a fixed 2s post-cycle wait: global pacing determines
the next slot. Idle fallback <=2s, backed by the durable DB/journal. Local completion wakeups
are hints only; a lost hint cannot strand a message. New web jobs still rely on periodic
fallback until a cross-process hint exists. Telegram inbound remains serial until Batch 4.
Routing refresh is cached 15s for this mode; backend claim/final dispatch checks still enforce
current route/whitelist. No peer rate limit is increased. The shared thread-safe rolling API
budget reserves normal=170, ACK=90, lease=10 per minute (total <=270, below server 300).
Budget exhaustion rejects locally before HTTP; the loop wakes within 2s for ACK/lease work.
Real backend failure retains exponential backoff. No new Courier, no deletion or merging.

Metadata remains private/sanitized. No production measurement, schema execution or deployment
is performed. Focused tests cover dynamic groups, persistent restart pacing, independent 429,
global pacing, empty fallback, reserved API budget and actual FIFO claim exclusions.
