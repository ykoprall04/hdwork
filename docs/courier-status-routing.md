# Batch 5: delivery status and shared B2C reply routing

QUEUED=ANTRE. SENDING with a live lease=MENGIRIM (transport or awaiting backend ACK;
not proof of Telegram success). Expired/missing lease, uncertain error or SENT without
message ID=TIDAK_PASTI. SENT plus message ID=TERKIRIM; definitive DEAD rejection=GAGAL.
A durable cached Telegram result still waits for its backend ACK before dashboard success.
No optimistic completion or automatic resend is added. Existing lease metadata is selected
by chat/history and order feedback; status remains string-compatible with the client.

Shared-mode B2C replies now accept active verified original routes in stored TIAL, LOGIC or
ALL category, consistent with universal ingress. Mapping/profile/history is not rewritten.
Nonshared mode and ASSUREN/B2B/REPLACEMENT retain their original category guard. Bot/chat/topic,
order owner/version/module/session, current actor role, route verification and idempotency
remain mandatory; unavailable routes still reject before outbox creation. No production
messages, DB changes, credentials or deployment are involved in tests.
