# INVALID order investigation — 15 November 2026

Runtime status: fixed and tested offline only; no production deployment or restart. The user subsequently authorized committing and pushing this fix together with the Telegram logging changes to main. Source publication does not activate the INVALID-order fix.

## Evidence and limits

The Python log at 16:38:09.897 WIB reports `/order` INVALID. At 16:38:09.905, `INBOX_FORWARD` succeeded in 7.19 ms and the journal recorded the persistent backend receipt. Read-only inspection of that journal entry, with only validation labels/classifications printed, confirms one `SC/IN` label with an empty value. Its Python journal state is ACKED with zero forwarding retries. No customer text, identifiers, credentials or tokens are included here.

`INBOX_FORWARD OK` means that the backend committed reception into its durable inbox. It does not mean the inbox worker created an order, committed a rejection reply, or delivered anything to Telegram.

The next two valid commands were forwarded at 16:38:24.113 and 16:38:29.609. The following two successful Telegram delivery results occurred at 16:39:15.589 and 16:39:19.270. The log alone cannot map those outbox IDs to exact original messages. No Telegram timeout/rate-limit error appears in the inspected 16:37:30–16:40:00 window. Poll requests in that window took roughly 0.7–3.7 seconds; successful sends took roughly 0.9 seconds. The active plan has FIFO release enabled, adaptive scheduler disabled and separate I/O disabled.

No production MySQL connection was opened for this investigation. Historical backend inbox state/attempt count, lock waits, exact SQL timings and the presence/absence of an outbox row were therefore not independently queried. The code/configuration defect below is reproduced against real isolated MySQL; historical attempt counts must not be presented as directly observed production data.

## Reproduced defect

1. Python deliberately forwards recognized invalid commands so the backend can reply with a clear reason.
2. The workflow records `ORDER_FORMAT_REJECTED` and tries to enqueue an anchored failure reply, without inserting an order.
3. Production writer V2 enables FIFO release. Its allocator only accepts `hd2_orders` as origin proof.
4. An invalid command has no order row. The allocator returns null and enqueue raises `WRITER_FIFO_ORDER_REQUIRED`.
5. The transaction rolls back both the rejection audit and its outbox insert. The inbox is retried as `HANDLER_FAILED`.
6. Strict inbox FIFO keeps later messages behind that head. The existing worker waits 2, 4, 8, 16 and 32 seconds for five consecutive handler failures: 62 seconds before the next message. This explains a delay pattern consistent with the observed logs; it is not a claim to have read the historical retry count from production.

The original SQL regression failed before the fix and passed after it. Earlier command tests used FIFO/writer-off doubles, so they did not cover this production composition.

## Fix

`rejection.js` supplies a shared canonical failure template and validates the original anchor/content for allocation and outgoing authorization. Only static parser field labels are echoed. Duplicate validation reasons are collapsed so a Telegram-sized input containing hundreds of repeated required labels cannot inflate the reply beyond Telegram's limit and cause another enqueue failure.

For the exact `b2c:<inbox UUID>:format-rejected` namespace only, FIFO allocation can use the original durable inbox row when no order exists. It verifies bot, original message, chat/topic, kind, non-reply origin and recomputed rejection text. It does not create an invalid/fake order. Group/command routing and outgoing/dispatch authorization remain mandatory.

The existing `fifo_order_id` column has no FK. It continues to hold order UUIDs for normal replies; for this narrowly identified namespace it holds the inbox-origin UUID. The claim predicate requires that inbox to be PROCESSED and proves the matching original anchor and timestamp. Existing future-time bounds, unknown-backlog holds, per-original lane sequencing, writer fence, confirmed-rejection release rules, leases and ACK/idempotency remain in force. A pending inbox is never dispatchable. No schema migration or new production grant is needed; the existing least-privilege Courier grant profile was tested, including denial of audit SELECT.

No polling interval, journal/offset logic, Python Courier scheduling, inbox backoff, supervisor, legacy bot or production runtime was changed. Real backend failures and required FIFO holds still take effect; validation rejection simply no longer enters that failure path.

## Offline checks

- Real owned MySQL 8.4 fixtures use unique named pipes, TCP disabled, verified private datadirs and synthetic data only. Fixture servers are shut down after testing.
- Mixed VALID/INVALID orders arrive every 3 seconds on a virtual clock. Real SQL processes each inbox once, persists valid orders/deduplication, and creates one authorized original-message reply for each outcome. Invalids have no order row. No artificial retry due-time is added; replay and duplicate ACK do not resend.
- Python counterpart uses real temporary SQLite, ingress policy, DurableCourier and the ACK pump with mock Telegram/backend transport. It checks the same 3-second sequence, immutable offset progress, ACKED inputs, SETTLED deliveries, replay suppression and SQLite integrity.
- Forged reasons/anchors/keys are rejected; outbox-trigger failure rolls the transaction back and a later retry is idempotent. Duplicate-field stress keeps the rejection short. Pending-origin and unknown-predecessor SQL guards hold.
- Same-original FIFO successors remain blocked until ACK; an independent original remains eligible. Confirmed Telegram 400 rejection can release a known-origin lane using the existing audited mechanism. No fallback sends an unanchored message if Telegram cannot reply to the original.

Virtual timing demonstrates absence of validation-induced head-of-line backoff, not a 3-second production latency guarantee. Actual network/poll timing, database load and Telegram limits remain applicable.

## Activation and existing failures

Activation needs a reviewed new Courier snapshot containing the changed Node backend modules and new helper, followed by the existing cooperative Courier handoff/restart. Its Node backend is owned by Courier, not the Web service. Web/MySQL/personal bots do not need restart; no migration/grant is required.

This patch does not reset DEAD inboxes, replay old updates, resend old replies or change production orders. Historical recovery requires separately checking the specific inbox/outbox state and an explicitly authorized recovery action. Retain pending reply data on rollback: old code cannot claim the new inbox-origin rejection lanes until a compatible snapshot is active again.
