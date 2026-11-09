-- Reviewed provisioning input. Executed only by the explicitly confirmed writer provisioner.
-- Target: hdwork2 on local MySQL only. No CREATE USER, password change, REVOKE,
-- schema/global grants, GRANT OPTION, courier changes, or reader changes.
-- Auth must already exist/unlocked. Provisioner creates writer only after confirming absence.
-- Auth section is the additive delta from SHOW GRANTS observed during this audit.
-- Write section is the exact current runtime write-policy profile; omit statements
-- already satisfied by the existing account, after reviewing actual SHOW GRANTS.
-- Writer has no INSERT on orders: new orders come only from Telegram ingestion.
-- Do not substitute the trial account or widen auth/read roles.

-- AUTH: four additive statements, preserving password and all existing grants.
GRANT INSERT, UPDATE ON hdwork2.users TO 'hdwork_auth'@'localhost';
GRANT SELECT ON hdwork2.hd2_security_audit TO 'hdwork_auth'@'localhost';
GRANT INSERT, DELETE ON hdwork2.hd2_user_modules TO 'hdwork_auth'@'localhost';
GRANT SELECT, UPDATE ON hdwork2.hd2_auth_guard TO 'hdwork_auth'@'localhost';

-- OPERATIONS WRITE: ten statements matching the current strict write policy.
GRANT SELECT (id,name,role,is_active) ON hdwork2.users TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_sessions TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_orders TO 'hdwork_ops_write'@'localhost';
GRANT UPDATE (status,owner_user_id,final_user_id,duplicate_decision,completion_note,started_at,finished_at,version) ON hdwork2.hd2_orders TO 'hdwork_ops_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_audit TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_web_requests TO 'hdwork_ops_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_write'@'localhost';
GRANT UPDATE (id) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_write'@'localhost';
