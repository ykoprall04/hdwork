-- Existing authorized metadata session only. STOP on errors, unknown visibility or STOP rows.
SELECT CURRENT_USER() AS account,DATABASE() AS db,VERSION() AS version,UTC_TIMESTAMP(3) AS observed_utc;
SHOW GRANTS FOR CURRENT_USER;
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
SELECT CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'STOP_ACTIVE_QUEUE' END AS gate,COUNT(*) AS active_count
 FROM hdwork2.hd2_courier_outbox WHERE bot_id='hdworkopsbot-testing' AND state IN ('QUEUED','SENDING');
SELECT state,COUNT(*) AS count FROM hdwork2.hd2_courier_outbox WHERE bot_id='hdworkopsbot-testing' GROUP BY state;
SELECT id,created_at,state,attempts,last_error_code FROM hdwork2.hd2_courier_outbox
 WHERE bot_id='hdworkopsbot-testing' AND state='DEAD' ORDER BY created_at,id;
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,CHARACTER_SET_NAME,COLLATION_NAME
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
 AND (TABLE_NAME IN ('hd2_courier_outbox','hd2_courier_lanes') OR (TABLE_NAME='hd2_orders' AND COLUMN_NAME='telegram_timestamp'))
 ORDER BY TABLE_NAME,ORDINAL_POSITION;
SELECT TABLE_NAME,ENGINE,TABLE_ROWS,DATA_LENGTH,INDEX_LENGTH FROM information_schema.TABLES
 WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox');
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;
SELECT COUNT(*) AS orders_without_original_timestamp FROM hdwork2.hd2_orders
 WHERE bot_id='hdworkopsbot-testing' AND telegram_timestamp IS NULL;
ROLLBACK;
-- Separately compare server UTC with an operator-verified clock and trusted original Telegram times.
-- Skew >=300s or unverifiable original timestamp provenance => STOP. Do not change clocks here.
SHOW CREATE TABLE hdwork2.hd2_courier_lanes;
SHOW CREATE TABLE hdwork2.hd2_courier_outbox;
-- 1142 = UNKNOWN; 1146 = absence only with verified sufficient metadata authority.
