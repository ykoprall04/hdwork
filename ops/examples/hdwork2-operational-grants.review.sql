-- RECOMMENDATION ONLY. Never executed by any project runner.
-- Existing accounts must be separately provisioned by an approved administrator.
-- No CREATE USER, passwords, global grants, DDL, GRANT OPTION or legacy schema.
-- hdwork_auth remains unchanged. Names below are proposed, not existing accounts.

-- Dashboard read-only account. Not yet wired as a separate runtime pool.
GRANT SELECT ON hdwork2.hd2_orders TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (order_id,request_id,user_id) ON hdwork2.hd2_web_requests TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (id,bot_id,idem_key,created_at,state,telegram_message_id,last_error_code,lease_until_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_audit TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_live_events TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (id,name,role,is_active) ON hdwork2.users TO 'hdwork_ops_read'@'localhost';

-- Courier webOnly=true command ingestion. No users/session/auth permissions.
-- Order existence uses FOR SHARE, so no UPDATE on hd2_orders is needed.
GRANT SELECT, INSERT ON hdwork2.hd2_orders TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_inbox TO 'hdwork_courier'@'localhost';
-- Receive-only does not need any outbox permission. Future sending requires a
-- separate approval and the courierSend policy; DO NOT apply this optional grant:
-- GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_outbox TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_daily_keys TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_tial_keys TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_audit TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_workers TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, DELETE ON hdwork2.hd2_courier_nonces TO 'hdwork_courier'@'localhost';

-- OPTIONAL: separate web operational write identity, OFF by default.
-- Review/approve separately. Never give these rights to auth/read/courier users.
GRANT SELECT (id,name,role,is_active) ON hdwork2.users TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_sessions TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_orders TO 'hdwork_ops_write'@'localhost';
GRANT UPDATE (status,owner_user_id,final_user_id,duplicate_decision,completion_note,started_at,finished_at,version) ON hdwork2.hd2_orders TO 'hdwork_ops_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_audit TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_web_requests TO 'hdwork_ops_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_write'@'localhost';
-- enqueueOn uses ON DUPLICATE KEY UPDATE id=id, even for idempotent retries.
GRANT UPDATE (id) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_write'@'localhost';
-- Do not run the old non-webOnly Telegram status path under the courier account.
