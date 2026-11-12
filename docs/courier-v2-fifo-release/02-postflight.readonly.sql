-- Existing authorized metadata session only. Run only after exact 015+016 validation.
SELECT CURRENT_USER() AS account,DATABASE() AS db,UTC_TIMESTAMP(3) AS observed_utc;
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
SELECT CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'STOP_ACTIVE_QUEUE' END AS gate,COUNT(*) AS active_count
 FROM hdwork2.hd2_courier_outbox WHERE bot_id='hdworkopsbot-testing' AND state IN ('QUEUED','SENDING');
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME='hd2_courier_outbox' AND COLUMN_NAME IN ('conversation_key','conversation_seq','fifo_order_id','fifo_release','telegram_error');
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;
SELECT state,COUNT(*) AS count FROM hdwork2.hd2_courier_outbox WHERE bot_id='hdworkopsbot-testing' GROUP BY state;
SELECT id,created_at,state,attempts,last_error_code,fifo_order_id IS NOT NULL AS identity_present,
 fifo_release IS NOT NULL AS released,JSON_UNQUOTE(JSON_EXTRACT(fifo_release,'$.source')) AS release_source,
 JSON_EXTRACT(fifo_release,'$.late') AS marked_late
 FROM hdwork2.hd2_courier_outbox WHERE bot_id='hdworkopsbot-testing' AND state='DEAD' ORDER BY created_at,id;
SELECT COUNT(*) AS unresolved_unknown_holds FROM hdwork2.hd2_courier_outbox
 WHERE bot_id='hdworkopsbot-testing' AND state<>'SENT' AND fifo_release IS NULL
 AND (fifo_order_id IS NULL OR conversation_key IS NULL OR conversation_seq IS NULL);
SELECT action,COUNT(*) AS count FROM hdwork2.hd2_audit
 WHERE action IN ('COURIER_FIFO_AUTO_RELEASE_ALERT','COURIER_FIFO_MANUAL_RELEASE','COURIER_FIFO_MANUAL_LATE') GROUP BY action;
ROLLBACK;
SHOW CREATE TABLE hdwork2.hd2_courier_lanes;
SHOW CREATE TABLE hdwork2.hd2_courier_outbox;
-- Run SHOW GRANTS FOR CURRENT_USER separately under writer, Courier and approved manual-review role.
