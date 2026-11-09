-- MANUAL, additive, no data copy, runtime flags or seeded conversations.
USE hdwork2;
CREATE TABLE hd2_chat_messages (
 seq BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 chat_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 thread_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 telegram_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 reply_to_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 direction VARCHAR(8) NOT NULL, sender_id VARCHAR(20) NULL, user_id BIGINT UNSIGNED NULL,
 body TEXT NOT NULL, attachments JSON NULL,
 outbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 telegram_timestamp BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 UNIQUE KEY chat_ingress(bot_id,chat_id,telegram_message_id),
 KEY chat_order(order_id,seq), KEY chat_anchor(bot_id,chat_id,telegram_message_id),
 FOREIGN KEY(order_id) REFERENCES hd2_orders(id), FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(outbox_id) REFERENCES hd2_courier_outbox(id),
 CHECK(direction IN ('IN','OUT'))
) ENGINE=InnoDB;
