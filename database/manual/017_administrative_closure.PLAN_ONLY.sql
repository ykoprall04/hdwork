-- PLAN ONLY. Requires reviewed exact 015/016 and 005/008/009 prerequisites.
-- Existing ENUM terminal DEAD is retained; no new delivery state, no backfill or GRANT.
USE hdwork2;
ALTER TABLE hd2_courier_outbox ADD COLUMN administrative_closure JSON NULL;
-- Deliberately separate from fifo_release. Administrative closure never releases FIFO.
