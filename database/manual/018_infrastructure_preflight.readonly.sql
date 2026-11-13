-- OWNER METADATA SESSION ONLY. No password entry in chat; no alternative account discovery.
-- 1142 means UNKNOWN, never ABSENT. Authoritative absence requires adequate metadata
-- privilege and 1146 on the direct probe. A zero information_schema result alone is insufficient.
START TRANSACTION READ ONLY;
SELECT CURRENT_USER() AS account,UTC_TIMESTAMP(3) AS observed_utc;
SELECT TABLE_NAME,ENGINE,TABLE_ROWS,DATA_LENGTH,INDEX_LENGTH
 FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME IN ('hd2_courier_outbox','hd2_courier_lanes','hd2_orders','hd2_audit','hd2_courier_workers');
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME IN ('hd2_courier_outbox','hd2_courier_lanes','hd2_orders','hd2_audit','hd2_courier_workers') ORDER BY TABLE_NAME,ORDINAL_POSITION;
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME
 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
 AND TABLE_NAME IN ('hd2_courier_outbox','hd2_courier_lanes') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;
SELECT state,COUNT(*) AS n FROM hdwork2.hd2_courier_outbox GROUP BY state;
SELECT COUNT(*) AS active_workers FROM hdwork2.hd2_courier_workers WHERE expires_ms>UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000;
SELECT bot_id,conversation_key,next_seq FROM hdwork2.hd2_courier_lanes LIMIT 0;
ROLLBACK;
SHOW GRANTS FOR 'hdwork_ops_write'@'localhost';
SHOW GRANTS FOR 'hdwork_courier'@'localhost';
-- PREFLIGHT expected: exact baseline or exact already-applied versions only; no
-- partial schema, no unlisted QUEUED/SENDING, no >1 active worker. Sealed legacy10
-- QUEUED are the explicit exception before closure. POSTFLIGHT expected: exact
-- 015 columns+2 indexes+lanes PK, 016 columns+index, 017 JSON nullable; minimum
-- lanes SELECT/INSERT/UPDATE; all18 DEAD/admin markers+18 audits; fifo_release
-- unchanged; zero QUEUED/SENDING; zero active sender worker; flags OFF.
