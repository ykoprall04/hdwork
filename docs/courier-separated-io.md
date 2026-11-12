# Batch 4: separated I/O and bounded live refresh

Opt in with production plan separateIo=true (requires adaptiveScheduler and fifo-ack-v2),
or local COURIER_SEPARATE_IO_ENABLED=true with the corresponding scheduler/FIFO flags.
Exactly one getUpdates pump uses timeout=25s and a dedicated HTTP timeout=35s. Its bounded
slot holds at most one result batch. The main owner thread commits that batch to SQLite
before the next poll is submitted with the new offset. A failed journal commit leaves the
old offset for replay; no other poller or SQLite writer is started. Backend ingress has a
separate one-request pump; only the owner thread applies receipt/defer changes. Inbox
idempotency and existing strict inbound head retry remain. ACK/outbound don't wait on
Telegram long poll or ingress HTTP. All internal clients share the existing <=270/min budget.
401/403/409 from getUpdates stops that inbound component for operator review rather than
competing with a possibly conflicting poller; outbound remains separate. No real Telegram
call is made by tests.

After-commit in-process SSE hints are coalesced. They never replace indexed MySQL live-event
tailing: other processes/lost hints use <=1s idle fallback; active batches tail at 250ms for
2 seconds. Zero clients means no timer/DB tail. Auth is cached only within one tick for the
same token, not across permission updates. Module filtering/revocation/backpressure remain.
Frontend coalesces at most 100ms from the first event (no indefinite trailing debounce).
Cross-process web enqueue wakeups still rely on periodic fallback, not a new network port.
Single Courier/SQLite ownership, hashes, original routing and retry safety remain.

Targeted validation: blocked inbound poll and blocked ingress POST allow concurrent outbound;
no offset advance before durable append; no second getUpdates before consumption; conflict
halts inbound only; SSE per-token auth and module filters; existing workflow frontend tests.
No production restart, schema operation, deployment or new remote access path.
