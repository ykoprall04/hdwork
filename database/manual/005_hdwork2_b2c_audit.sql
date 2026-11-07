-- MANUAL REVIEW ONLY: run only after approved 004 migration rehearsal.
-- Not loaded by startup. No legacy tables or data updates.
USE hdwork2;
ALTER TABLE hd2_audit ADD COLUMN detail JSON NULL;
-- Failure reasons can be sensitive. Restrict access and approve retention first.
