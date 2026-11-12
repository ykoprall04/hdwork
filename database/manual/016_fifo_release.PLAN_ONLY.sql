-- PLAN ONLY. Never auto-apply. Requires EXACT 015, 006 order timestamp, 005/008 audit, 009 runtime.
-- Non-idempotent. No status/backfill/retry, no production GRANT, no DELETE.
-- Existing rows remain UNKNOWN/HOLD; do not infer identity or Telegram rejection.
USE hdwork2;
ALTER TABLE hd2_courier_outbox
 ADD COLUMN fifo_order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN fifo_release JSON NULL,
 ADD COLUMN telegram_error JSON NULL,
 ADD KEY outbox_fifo_unknown (bot_id,fifo_order_id,created_at);
-- fifo_release is a per-ID disposition marker, never a replacement for SENT.
-- Enable HDWORK2_COURIER_FIFO_RELEASE_ENABLED only after reviewed migration/grants/protocol.
