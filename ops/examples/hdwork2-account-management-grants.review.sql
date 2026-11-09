-- MANUAL REVIEW ONLY. Do not execute as part of integration or startup.
-- Writable cookie-auth profile only (HDWORK2_LOCAL_READ_ONLY=false).
-- Requires manual migration 010_hdwork2_account_approval.sql first.
-- Review existing grants: the readiness checker rejects extra privileges.
-- Keep the existing session-audit-only deployment on its narrower profile.
GRANT SELECT, INSERT, UPDATE ON hdwork2.users TO 'hdwork_auth'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_sessions TO 'hdwork_auth'@'localhost';
GRANT SELECT, INSERT ON hdwork2.hd2_security_audit TO 'hdwork_auth'@'localhost';
GRANT SELECT, INSERT, DELETE ON hdwork2.hd2_user_modules TO 'hdwork_auth'@'localhost';
GRANT SELECT, UPDATE ON hdwork2.hd2_auth_guard TO 'hdwork_auth'@'localhost';
