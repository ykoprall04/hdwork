-- REVIEW ONLY. No runtime grants are changed; explicit user approval required.
-- ADMIN maintenance exception: existing SUPER_ADMIN UI is monitoring-only.
-- Runtime application remains hdwork_auth/hdwork_ops_read, globally read-only.
-- The helper verifies an active, real SUPER_ADMIN browser and the row FOR UPDATE.
-- Parameter values below come from private process memory, never a secret file.
START TRANSACTION;
-- SELECT the exact testing order FOR UPDATE and assert WAITING/version=0,
-- no duplicate and no owner; assert active SUPER_ADMIN actor 1.
UPDATE hdwork2.hd2_orders
SET status='DONE', final_user_id=1, finished_at=UTC_TIMESTAMP(3),
    completion_note='Live testing DONE melalui tindakan administratif satu order yang disetujui.',
    version=version+1
WHERE id='7790b19e-f9d4-4c79-ae43-2ad10cdbf405'
  AND bot_id='hdworkopsbot-testing' AND chat_id='-5436357946'
  AND message_id='6' AND thread_id IS NULL AND sc_in='LIVE-AO20261108142737'
  AND status='WAITING' AND version=0 AND duplicate_of IS NULL
  AND owner_user_id IS NULL AND final_user_id IS NULL;
-- Assert affectedRows=1. In SAME transaction insert hd2_audit action
-- LIVE_TEST_DONE (actor 1, WAITING -> DONE), and hd2_live_events TIAL/change.
-- Helper performs the audit/event inserts; do not run this fragment alone.
COMMIT;
-- No Telegram send, user/role/password/grants changes, other-order update or DDL.
