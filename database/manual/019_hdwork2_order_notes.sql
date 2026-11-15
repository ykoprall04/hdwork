-- MANUAL ONLY: additive Batch 3 migration. Not applied by application startup.
-- Apply/review separately before enabling notes in production. No Courier grants.
USE hdwork2;
CREATE TABLE hd2_order_notes (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 body TEXT NOT NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 FOREIGN KEY(order_id) REFERENCES hd2_orders(id),
 FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB;
GRANT SELECT ON hdwork2.hd2_order_notes TO 'hdwork_ops_read'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_order_notes TO 'hdwork_ops_write'@'localhost';
-- Roll back application code without dropping notes or restoring operational data.
