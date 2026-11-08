-- MANUAL ONLY. Requires 004-007, reviewed backup and disposable rehearsal.
USE hdwork2;
ALTER TABLE hd2_orders
 ADD COLUMN owner_user_id BIGINT UNSIGNED NULL,
 ADD COLUMN final_user_id BIGINT UNSIGNED NULL,
 ADD COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN completion_note TEXT NULL,
 ADD COLUMN access_module VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin
 GENERATED ALWAYS AS (CASE command WHEN 'order' THEN 'TIAL' WHEN 'config_psb' THEN 'LOGIC_PSB' WHEN 'mo' THEN 'LOGIC_MO' WHEN 'req' THEN 'REQ' ELSE module END) STORED,
 ADD FOREIGN KEY(owner_user_id) REFERENCES users(id),
 ADD FOREIGN KEY(final_user_id) REFERENCES users(id),
 ADD KEY work_incoming(access_module,status,telegram_timestamp,id),
 ADD KEY work_process(access_module,status,started_at,id),
 ADD KEY work_recap(access_module,business_day,status,duplicate_decision,owner_user_id,final_user_id,command,telegram_timestamp),
 ADD KEY work_export(access_module,business_day,id),
 ADD KEY work_owner(owner_user_id,status,started_at,id);
ALTER TABLE hd2_audit MODIFY COLUMN inbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN user_id BIGINT UNSIGNED NULL,
 ADD FOREIGN KEY(user_id) REFERENCES users(id);
CREATE TABLE hd2_web_requests (
 user_id BIGINT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result JSON NULL,
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(order_id) REFERENCES hd2_orders(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_live_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 module VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind ENUM('arrival','change') NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 KEY live_module(module,id)
) ENGINE=InnoDB;
-- Status dictionary and canonical reservations remain unchanged.
-- Additive schema; never DROP records to roll back. DDL commits per statement.
