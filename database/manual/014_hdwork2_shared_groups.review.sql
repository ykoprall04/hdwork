-- MANUAL REVIEW ONLY. Never execute from application startup.
-- Back up schema + mappings first. MySQL DDL commits implicitly.
-- Check the existing constraint name before running this ALTER:
-- SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS
-- WHERE CONSTRAINT_SCHEMA='hdwork2' AND CONSTRAINT_NAME LIKE 'hd2_system_mappings%';
-- 012 creates the unnamed category check as hd2_system_mappings_chk_1 on MySQL 8.
-- STOP if that is not the category IN ('TIAL','LOGIC') constraint on this host.
USE hdwork2;
ALTER TABLE hd2_system_mappings
 ADD COLUMN group_name VARCHAR(100) NOT NULL DEFAULT '',
 ADD COLUMN blocked_before DATETIME(3) NULL,
 DROP CHECK hd2_system_mappings_chk_1,
 ADD CONSTRAINT hd2_mapping_category CHECK(category IN ('TIAL','LOGIC','ALL'));
-- Existing rows, flags, destinations, queues and secrets are unchanged.
-- Existing exact chatRead/chatWrite/courierSendChat TABLE grants cover these
-- mapping columns. Do not add global grants or change credentials.
-- Rollback: keep additive columns/check to retain names and disable boundaries.
-- Disable ALL mappings via audited API BEFORE reverting application code;
-- retain queue fencing until held messages have an approved recovery policy.
