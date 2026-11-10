-- REVIEW ONLY: do not execute until schema/grant changes are explicitly approved.
-- Web account delta only. No CREATE USER, REVOKE, Courier account or order mutation.
-- Matched against the supplied DBA metadata: 62 columns, 26 index rows, 44 privilege rows.
-- Only new SELECT columns are added; existing column grants are not repeated.
-- First recheck current grants against the reviewed baseline. Existing unsafe/extra privileges must
-- be reviewed separately; adding these grants does not remove existing extras.
-- Apply only after the required schema exists and matches manual 012/013.
-- delivered_at was visible on this host; do not blindly rerun its ALTER TABLE.
-- MySQL merges column SELECT grants; existing base permissions are preserved.

GRANT SELECT (attempts, delivered_at, due_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (attempts, created_at, state) ON hdwork2.hd2_courier_inbox TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_system_mappings TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_system_state TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_system_incidents TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_system_jobs TO 'hdwork_ops_read'@'localhost';
GRANT SELECT (bot_id, expires_ms) ON hdwork2.hd2_courier_workers TO 'hdwork_ops_read'@'localhost';
GRANT SELECT ON hdwork2.hd2_chat_messages TO 'hdwork_ops_read'@'localhost';

GRANT SELECT (username) ON hdwork2.users TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_mappings TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_state TO 'hdwork_ops_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_system_incidents TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_jobs TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_requests TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_targets TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_system_alerts TO 'hdwork_ops_write'@'localhost';
GRANT SELECT (bot_id, expires_ms) ON hdwork2.hd2_courier_workers TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_chat_messages TO 'hdwork_ops_write'@'localhost';
