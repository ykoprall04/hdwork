-- Run ONLY in an existing authenticated MySQL console with metadata visibility.
-- Never source the adjacent migration/grant files during this inspection.
-- No credential handling, message bodies, routes, customer fields or journal tokens.
SELECT VERSION() AS server_version, CURRENT_USER() AS metadata_account;
SET TRANSACTION READ ONLY;
START TRANSACTION;
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
 WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox');
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,
 CHARACTER_SET_NAME,COLLATION_NAME
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox')
 ORDER BY TABLE_NAME,ORDINAL_POSITION;
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME
 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME IN ('hd2_courier_lanes','hd2_courier_outbox')
 ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;
-- JSON lines can be exported as dead-metadata.jsonl (client output only, no INTO OUTFILE).
SELECT JSON_OBJECT('id',id,'createdAtUtc',created_at,'state',state,
 'attempts',attempts,'errorCode',last_error_code,
 'telegramResultPresent',telegram_message_id IS NOT NULL) AS dead_metadata
 FROM hdwork2.hd2_courier_outbox
 WHERE bot_id='hdworkopsbot-testing' AND state='DEAD' ORDER BY created_at,id;
ROLLBACK;
-- Execute separately. 1146 = table absent, 1142 = permission denied. Do not infer absence
-- from an empty information_schema result with an account of unverified privileges.
SHOW CREATE TABLE hdwork2.hd2_courier_lanes;
SHOW CREATE TABLE hdwork2.hd2_courier_outbox;
