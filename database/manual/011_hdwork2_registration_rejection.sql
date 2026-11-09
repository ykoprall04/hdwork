-- Forward-only approval vocabulary extension; preserves all users, passwords and sessions.
-- Review and apply only on an explicitly approved target after migration 010.
USE hdwork2;
ALTER TABLE users DROP CHECK hd2_account_approval_status, ADD CONSTRAINT hd2_account_approval_status CHECK (approval_status IN ('PENDING','APPROVED','REJECTED'));
