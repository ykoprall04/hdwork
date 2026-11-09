-- Additive migration. Existing trial/active accounts remain approved.
USE hdwork2;
ALTER TABLE users ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';
ALTER TABLE users ADD CONSTRAINT hd2_account_approval_status CHECK (approval_status IN ('PENDING','APPROVED'));
-- Apply before deploying the updated account service. No account/password reset.
