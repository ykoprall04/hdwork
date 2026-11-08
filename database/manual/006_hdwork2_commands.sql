-- REVIEW ONLY. Never run automatically. Requires 004/005. Backup/rehearsal first.
USE hdwork2;
ALTER TABLE hd2_orders
  ADD COLUMN command VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN duplicate_decision ENUM('CONTINUE_CHECK','REJECT_DUPLICATE') NULL,
  ADD COLUMN command_fields JSON NULL,
  ADD COLUMN raw_text TEXT NULL,
  ADD COLUMN sender_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN telegram_timestamp BIGINT UNSIGNED NULL;
CREATE TABLE hd2_tial_keys (
  dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  FOREIGN KEY(order_id) REFERENCES hd2_orders(id)
) ENGINE=InnoDB;
-- No SC/IN uniqueness on orders: every original message, including duplicates, survives.
-- Existing rows remain unchanged. New-bot history starts in hdwork2.
-- Never import legacy orders or rebuild keys from legacy/staging rows.
