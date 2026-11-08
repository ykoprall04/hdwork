-- MANUAL ONLY. Requires 004-008; rehearse on a fresh disposable MySQL 8 first.
USE hdwork2;

-- Strict ingress sequence for the new worker; existing primary/FK keys survive.
ALTER TABLE hd2_courier_inbox
  ADD COLUMN received_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD UNIQUE KEY courier_inbox_sequence (received_seq),
  ADD KEY courier_inbox_ordered (bot_id, state, received_seq);

-- Shared by the one courier listener for this installation, never the web API.
CREATE TABLE hd2_courier_workers (
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  worker_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_ms BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

-- Replay protection survives listener restarts within the signature window.
CREATE TABLE hd2_courier_nonces (
  bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nonce CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_ms BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (bot_id, nonce),
  KEY courier_nonce_expiry (expires_ms)
) ENGINE=InnoDB;

-- Additive only. Do not drop journal/inbox/outbox/order/audit data for rollback.
