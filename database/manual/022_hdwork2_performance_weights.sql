-- Manual review/apply only. Rehearse on a disposable MySQL 8.4 database.
-- Apply the Web validator that accepts these optional exact grants before granting.
USE hdwork2;
CREATE TABLE IF NOT EXISTS hd2_performance_weights (
 command VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 done_weight DECIMAL(7,2) NOT NULL DEFAULT 1,
 failed_weight DECIMAL(7,2) NOT NULL DEFAULT 1,
 version INT UNSIGNED NOT NULL DEFAULT 0,
 CHECK(command IN ('order','req','mo','config_psb')),
 CHECK(done_weight BETWEEN 0 AND 10000 AND failed_weight BETWEEN 0 AND 10000)
) ENGINE=InnoDB;
INSERT INTO hd2_performance_weights (command) VALUES ('order'),('req'),('mo'),('config_psb')
 ON DUPLICATE KEY UPDATE command=command;
GRANT SELECT ON hdwork2.hd2_performance_weights TO 'hdwork_ops_read'@'localhost';
GRANT SELECT,UPDATE (done_weight, failed_weight, version) ON hdwork2.hd2_performance_weights TO 'hdwork_ops_write'@'localhost';
