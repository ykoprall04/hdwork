-- MANUAL REVIEW ONLY. MySQL 8.0+, InnoDB. NEVER auto-run on startup.
-- Backup/review required. Uses only new hd2_* tables in hdwork2, not legacy orders/users.
USE hdwork2;
CREATE TABLE hd2_order_statuses (
  code VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  label VARCHAR(40) NOT NULL
) ENGINE=InnoDB;
INSERT INTO hd2_order_statuses(code,label) VALUES
('WAITING','MENUNGGU'),('IN_PROGRESS','PROSES CEK'),('DONE','DONE'),('FAILED','GAGAL'),('DUPLICATE','DUPLICATE');
CREATE TABLE hd2_courier_inbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  update_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  state ENUM('PENDING','PROCESSED','IGNORED','DEAD') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  due_ms BIGINT UNSIGNED NOT NULL,
  last_error_code VARCHAR(32) NULL,
  processed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  UNIQUE KEY inbox_update(bot_id,update_id),
  KEY inbox_pending(bot_id,state,due_ms,id)
) ENGINE=InnoDB;
CREATE TABLE hd2_courier_outbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idem_key VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  state ENUM('QUEUED','SENDING','SENT','DEAD') NOT NULL DEFAULT 'QUEUED',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  due_ms BIGINT UNSIGNED NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until_ms BIGINT UNSIGNED NULL,
  last_ack_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  last_ack_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  telegram_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  last_error_code VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  UNIQUE KEY outbox_idempotency(bot_id,idem_key),
  KEY outbox_pending(bot_id,state,due_ms,id),
  KEY outbox_expired(bot_id,state,lease_until_ms,id)
) ENGINE=InnoDB;
CREATE TABLE hd2_orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  module VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  business_day DATE NOT NULL,
  chat_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  thread_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  sc_in VARCHAR(100) NULL,
  inet VARCHAR(100) NULL,
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  duplicate_of CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  last_actor_id VARCHAR(20) NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  UNIQUE KEY order_original(bot_id,chat_id,message_id),
  KEY order_day(bot_id,module,business_day,status),
  FOREIGN KEY(status) REFERENCES hd2_order_statuses(code),
  FOREIGN KEY(duplicate_of) REFERENCES hd2_orders(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_daily_keys (
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  module VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  business_day DATE NOT NULL,
  dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY(bot_id,module,business_day,dedupe_key),
  FOREIGN KEY(order_id) REFERENCES hd2_orders(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  inbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id VARCHAR(20) NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY audit_order(order_id,created_at),
  FOREIGN KEY(inbox_id) REFERENCES hd2_courier_inbox(id),
  FOREIGN KEY(order_id) REFERENCES hd2_orders(id)
) ENGINE=InnoDB;
-- Do not delete/reset data to rerun. No DROP/ALTER legacy, triggers or GRANTs here.
