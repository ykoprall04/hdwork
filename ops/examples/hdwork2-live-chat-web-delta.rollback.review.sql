-- REVIEW ONLY. Requires approval; not executed by preparation/readiness.
-- Restore the prior web configuration/code before removing chat permissions.
-- Use only if the pre-change grants still equal the reviewed baseline and these
-- exact additions were applied. Do not revoke permissions added independently later.
-- Removes only new feature permissions; preserves pre-existing column grants.

REVOKE SELECT, INSERT ON hdwork2.hd2_chat_messages FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT (bot_id, expires_ms) ON hdwork2.hd2_courier_workers FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_alerts FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_targets FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_requests FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_jobs FROM 'hdwork_ops_write'@'localhost';
REVOKE INSERT ON hdwork2.hd2_system_incidents FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_state FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT, INSERT, UPDATE ON hdwork2.hd2_system_mappings FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT (username) ON hdwork2.users FROM 'hdwork_ops_write'@'localhost';
REVOKE SELECT ON hdwork2.hd2_chat_messages FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT (bot_id, expires_ms) ON hdwork2.hd2_courier_workers FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT ON hdwork2.hd2_system_jobs FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT ON hdwork2.hd2_system_incidents FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT ON hdwork2.hd2_system_state FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT ON hdwork2.hd2_system_mappings FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT (attempts, created_at, state) ON hdwork2.hd2_courier_inbox FROM 'hdwork_ops_read'@'localhost';
REVOKE SELECT (attempts, delivered_at, due_ms) ON hdwork2.hd2_courier_outbox FROM 'hdwork_ops_read'@'localhost';
