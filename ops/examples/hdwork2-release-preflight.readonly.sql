-- READ ONLY. Run against the existing hdwork2 database with local root prompt.
-- No DDL, DML, GRANT, REVOKE, application secrets or order contents are emitted.
-- This checks metadata/counts and emits hashes for comparison before/after later work.
SELECT DATABASE() AS database_name, CURRENT_USER() AS account, VERSION() AS server_version, @@port AS port;

SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('users','hd2_web_requests','hd2_courier_outbox') ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='hdwork2' AND (TABLE_NAME='users' OR CONSTRAINT_NAME='hd2_account_approval_status') ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT 'routines' AS object_kind, COUNT(*) AS object_count FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='hdwork2' UNION ALL SELECT 'triggers',COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='hdwork2' UNION ALL SELECT 'events',COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='hdwork2';

SELECT 'hd2_audit' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_audit`
UNION ALL
SELECT 'hd2_auth_guard' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_auth_guard`
UNION ALL
SELECT 'hd2_courier_inbox' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_courier_inbox`
UNION ALL
SELECT 'hd2_courier_nonces' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_courier_nonces`
UNION ALL
SELECT 'hd2_courier_outbox' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_courier_outbox`
UNION ALL
SELECT 'hd2_courier_workers' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_courier_workers`
UNION ALL
SELECT 'hd2_daily_keys' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_daily_keys`
UNION ALL
SELECT 'hd2_live_events' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_live_events`
UNION ALL
SELECT 'hd2_order_statuses' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_order_statuses`
UNION ALL
SELECT 'hd2_orders' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_orders`
UNION ALL
SELECT 'hd2_security_audit' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_security_audit`
UNION ALL
SELECT 'hd2_sessions' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_sessions`
UNION ALL
SELECT 'hd2_tial_keys' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_tial_keys`
UNION ALL
SELECT 'hd2_user_modules' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_user_modules`
UNION ALL
SELECT 'hd2_web_requests' AS table_name, COUNT(*) AS row_count FROM hdwork2.`hd2_web_requests`
UNION ALL
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM hdwork2.`users`;

SHOW GRANTS FOR 'hdwork_courier'@'localhost';

SHOW GRANTS FOR 'hdwork_ops_read'@'localhost';

SHOW GRANTS FOR 'hdwork_auth'@'localhost';

SELECT SHA2(CAST(JSON_ARRAY(`id`,`bot_id`,`module`,`business_day`,`chat_id`,`message_id`,`thread_id`,`sc_in`,`inet`,`status`,`duplicate_of`,`last_actor_id`,`started_at`,`finished_at`,`created_at`,`command`,`duplicate_decision`,`command_fields`,`raw_text`,`sender_id`,`telegram_timestamp`,`owner_user_id`,`final_user_id`,`version`,`completion_note`,`access_module`) AS CHAR CHARACTER SET utf8mb4),256) AS order_row_sha256 FROM hdwork2.hd2_orders ORDER BY id;
