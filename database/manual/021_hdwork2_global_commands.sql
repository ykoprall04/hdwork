-- MANUAL REVIEW/APPLY ONLY; never executed by application startup/updater.
-- Preflight with scripts/lib/global-command-deployment.js before manual apply.
-- Rehearse in an isolated test database before approved production deployment.
USE hdwork2;
CREATE TABLE IF NOT EXISTS hd2_global_commands (
 command VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 version INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 CHECK(command IN ('order','req','config_psb','mo')),
 CHECK(enabled IN (0,1))
) ENGINE=InnoDB;
-- Re-run preserves every existing enabled/version/updated_at value.
INSERT INTO hd2_global_commands(command) VALUES ('order'),('req'),('config_psb'),('mo')
 ON DUPLICATE KEY UPDATE command=command;
GRANT SELECT ON hdwork2.hd2_global_commands TO 'hdwork_ops_read'@'localhost';
GRANT SELECT,UPDATE ON hdwork2.hd2_global_commands TO 'hdwork_ops_write'@'localhost';
GRANT SELECT ON hdwork2.hd2_global_commands TO 'hdwork_courier'@'localhost';
-- Audit uses existing hd2_audit, in the SAME transaction as each actual change.
-- No order, inbox, outbox, journal, offset, ACK or lease migration.
