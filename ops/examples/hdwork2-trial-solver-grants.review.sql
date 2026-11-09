-- One NEW dedicated identity only; no schema changes or changes to other accounts.
-- CREATE USER 'hdwork_trial_write'@'localhost' IDENTIFIED BY <PRIVATE_INPUT> ACCOUNT LOCK;
GRANT SELECT (id, is_active, name, role, username) ON hdwork2.users TO 'hdwork_trial_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_trial_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_sessions TO 'hdwork_trial_write'@'localhost';
GRANT SELECT, UPDATE (completion_note, duplicate_decision, final_user_id, finished_at, owner_user_id, started_at, status, version) ON hdwork2.hd2_orders TO 'hdwork_trial_write'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_audit TO 'hdwork_trial_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_web_requests TO 'hdwork_trial_write'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_trial_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_outbox TO 'hdwork_trial_write'@'localhost';
-- Verify exact grants, then unlock ONLY the identity created by this run.
-- Runtime remains LocalService, with general OP_WRITE_ENABLED=false.
-- Application transaction guard restricts all mutations and outgoing messages
-- to trial_yanto's verified testing chat, bot, and original message identity.
