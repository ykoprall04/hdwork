-- MANUAL ONLY, MySQL 8.4. Use mysql batch/SOURCE with DELIMITER support, no --force.
-- Dedicated DBA session, no concurrent migration or unrelated open transaction.
-- Requires CREATE/ALTER ROUTINE, EXECUTE, CREATE, REFERENCES and the grant authority
-- for the two existing Web accounts. Never grant routine access to application users.
-- The helper is removed on success; after failure, rerun this whole file.
-- No table/data is dropped or repaired automatically. DDL/GRANT are not one transaction.
USE hdwork2;
DELIMITER $$
DROP PROCEDURE IF EXISTS hd2_migrate_order_notes_019$$
CREATE PROCEDURE hd2_migrate_order_notes_019()
SQL SECURITY INVOKER
BEGIN
 DECLARE previous_metadata_timeout BIGINT DEFAULT @@SESSION.lock_wait_timeout;
 DECLARE previous_row_timeout BIGINT DEFAULT @@SESSION.innodb_lock_wait_timeout;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION
 BEGIN
  SET SESSION lock_wait_timeout=previous_metadata_timeout;
  SET SESSION innodb_lock_wait_timeout=previous_row_timeout;
  RESIGNAL;
 END;
 -- Per lock attempt, not a total runtime deadline; not a zero-downtime guarantee.
 SET SESSION lock_wait_timeout=5;
 SET SESSION innodb_lock_wait_timeout=5;

 IF (SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_orders','users')
       AND TABLE_TYPE='BASE TABLE' AND ENGINE='InnoDB')<>2
 OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
     AND ((TABLE_NAME='hd2_orders' AND COLUMN_NAME='id' AND COLUMN_TYPE='char(36)'
           AND CHARACTER_SET_NAME='ascii' AND COLLATION_NAME='ascii_bin')
       OR (TABLE_NAME='users' AND COLUMN_NAME='id' AND COLUMN_TYPE='bigint unsigned'))
     AND IS_NULLABLE='NO')<>2
 OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME IN ('hd2_orders','users') AND INDEX_NAME='PRIMARY')<>2
 OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME IN ('hd2_orders','users') AND INDEX_NAME='PRIMARY' AND COLUMN_NAME='id' AND SEQ_IN_INDEX=1)<>2
 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='019: incompatible parent tables; no automatic repair';
 END IF;

 CREATE TABLE IF NOT EXISTS hd2_order_notes (
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY notes_updated_by(updated_by),
  FOREIGN KEY(order_id) REFERENCES hd2_orders(id),
  FOREIGN KEY(updated_by) REFERENCES users(id)
 ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

 -- Validate the actual table after CREATE, including a table from a partial run.
 -- Index/constraint names and the specific utf8mb4 collation may differ in an
 -- existing valid table. Body must actually support utf8mb4; never ALTER old data.
 IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND TABLE_TYPE='BASE TABLE' AND ENGINE='InnoDB')<>1
 OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes')<>4
 OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND IS_NULLABLE='NO' AND GENERATION_EXPRESSION=''
     AND ((COLUMN_NAME='order_id' AND COLUMN_TYPE='char(36)' AND CHARACTER_SET_NAME='ascii'
           AND COLLATION_NAME='ascii_bin' AND COLUMN_DEFAULT IS NULL AND EXTRA='')
       OR (COLUMN_NAME='body' AND DATA_TYPE='text' AND CHARACTER_SET_NAME='utf8mb4' AND COLUMN_DEFAULT IS NULL AND EXTRA='')
       OR (COLUMN_NAME='updated_by' AND COLUMN_TYPE='bigint unsigned' AND COLUMN_DEFAULT IS NULL AND EXTRA='')
       OR (COLUMN_NAME='updated_at' AND COLUMN_TYPE='datetime(3)' AND EXTRA='DEFAULT_GENERATED'
           AND LOWER(REPLACE(REPLACE(REPLACE(COLUMN_DEFAULT,'(',''),')',''),' ',''))='utc_timestamp3')))<>4
 OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND INDEX_NAME='PRIMARY')<>1
 OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND INDEX_NAME='PRIMARY' AND COLUMN_NAME='order_id' AND SEQ_IN_INDEX=1)<>1
 OR NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND COLUMN_NAME='updated_by' AND SEQ_IN_INDEX=1 AND IS_VISIBLE='YES')
 OR EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND NON_UNIQUE=0 AND INDEX_NAME<>'PRIMARY')
 OR EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND CONSTRAINT_TYPE='CHECK')
 OR (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND REFERENCED_TABLE_NAME IS NOT NULL)<>2
 OR (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND REFERENCED_TABLE_NAME IS NOT NULL)<>2
 OR (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND REFERENCED_TABLE_SCHEMA='hdwork2' AND REFERENCED_COLUMN_NAME='id'
     AND POSITION_IN_UNIQUE_CONSTRAINT=1 AND ORDINAL_POSITION=1
     AND ((COLUMN_NAME='order_id' AND REFERENCED_TABLE_NAME='hd2_orders')
       OR (COLUMN_NAME='updated_by' AND REFERENCED_TABLE_NAME='users')))<>2
 OR (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='hdwork2'
     AND TABLE_NAME='hd2_order_notes' AND DELETE_RULE IN ('RESTRICT','NO ACTION') AND UPDATE_RULE IN ('RESTRICT','NO ACTION'))<>2
 OR EXISTS (SELECT 1 FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA='hdwork2'
     AND EVENT_OBJECT_TABLE='hd2_order_notes')
 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='019: incompatible notes table; preserve data and review schema';
 END IF;

 -- Repeating these grants is additive. A failure leaves table/data intact;
 -- after correcting DBA/account prerequisites, rerun without dropping the table.
 GRANT SELECT ON hdwork2.hd2_order_notes TO 'hdwork_ops_read'@'localhost';
 GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_order_notes TO 'hdwork_ops_write'@'localhost';
 SET SESSION lock_wait_timeout=previous_metadata_timeout;
 SET SESSION innodb_lock_wait_timeout=previous_row_timeout;
END$$
CALL hd2_migrate_order_notes_019()$$
DROP PROCEDURE hd2_migrate_order_notes_019$$
DELIMITER ;
-- Roll back application code without dropping notes or restoring operational data.
