-- REVIEW/APPROVAL ONLY. Never executed by startup or diagnostics.
-- Inspect whether hdwork_courier@localhost exists first. Do not reset an existing
-- password, broaden an existing account or use an administrator as runtime.
-- If absent: create through a secure local admin tool with hidden password input.
-- Syntax only; <HIDDEN_ADMIN_INPUT> is deliberately not executable SQL:
-- CREATE USER 'hdwork_courier'@'localhost' IDENTIFIED WITH caching_sha2_password BY <HIDDEN_ADMIN_INPUT> ACCOUNT LOCK;

GRANT SELECT, INSERT ON hdwork2.hd2_orders TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_inbox TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_daily_keys TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_tial_keys TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_audit TO 'hdwork_courier'@'localhost';
GRANT INSERT ON hdwork2.hd2_live_events TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_workers TO 'hdwork_courier'@'localhost';
GRANT SELECT, INSERT, DELETE ON hdwork2.hd2_courier_nonces TO 'hdwork_courier'@'localhost';

-- No outbox, user/session, UPDATE orders, DDL, global or other-schema permissions.
-- Inspect SHOW GRANTS after approval; unlock only the explicitly approved account:
-- ALTER USER 'hdwork_courier'@'localhost' ACCOUNT UNLOCK;
-- Receive-only does NOT send any Telegram message. A one-message DONE reply needs
-- a separate destination/message verification and explicit approval.
