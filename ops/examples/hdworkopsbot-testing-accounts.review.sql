-- REVIEW ONLY. The provisioning helper checks existing accounts before any DDL.
-- CREATE USER only for absent accounts; password comes from private DPAPI,
-- never from this file. New accounts are initially locked, then unlocked only
-- after the exact grants below pass review. Existing passwords/status stay intact.
-- CREATE USER 'hdwork_courier'@'localhost' IDENTIFIED WITH caching_sha2_password BY <PRIVATE_INPUT> ACCOUNT LOCK;
-- CREATE USER 'hdwork_ops_read'@'localhost' IDENTIFIED WITH caching_sha2_password BY <PRIVATE_INPUT> ACCOUNT LOCK;

GRANT SELECT, INSERT ON hdwork2.hd2_orders TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_inbox TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_daily_keys TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_tial_keys TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_audit TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_workers TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, DELETE ON hdwork2.hd2_courier_nonces TO 'hdwork_courier'@'localhost';

GRANT SELECT ON hdwork2.hd2_orders TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_audit TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_live_events TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (id,name,role,is_active) ON hdwork2.users TO 'hdwork_ops_read'@'localhost';
-- Match the integrated read policy: feedback metadata only, never payload/lease token.
GRANT SELECT (order_id,request_id,user_id) ON hdwork2.hd2_web_requests TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (id,bot_id,idem_key,created_at,state,telegram_message_id,last_error_code,lease_until_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';

-- No courier outbox permission, read access to payload/lease token, UPDATE orders,
-- user/password modification, DDL on tables,
-- global grants, GRANT OPTION, other database, or existing-account password reset.
