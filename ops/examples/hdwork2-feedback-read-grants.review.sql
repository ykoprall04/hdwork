-- MANUAL REVIEW ONLY. Additive read metadata grants; do not run against an active DB during Batch B.
-- Requires existing 004-008 schema and the dedicated hdwork_ops_read account.
-- No payload, password hash, session token, lease token, writes or credential changes.
GRANT SELECT (order_id,request_id,user_id) ON hdwork2.hd2_web_requests TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (id,bot_id,idem_key,created_at,state,telegram_message_id,last_error_code,lease_until_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';
