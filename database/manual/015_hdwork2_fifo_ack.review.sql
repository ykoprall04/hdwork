-- MANUAL REVIEW ONLY. Never run automatically at startup. Back up/review before DDL.
-- Enable only after all non-SENT legacy rows for this bot have been drained or reconciled.
-- No DELETE, UPDATE/backfill, journal reset or legacy table change is performed here.
USE hdwork2;
CREATE TABLE hd2_courier_lanes (
 bot_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 conversation_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 next_seq BIGINT UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY(bot_id,conversation_key)
) ENGINE=InnoDB;
ALTER TABLE hd2_courier_outbox
 ADD COLUMN conversation_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN conversation_seq BIGINT UNSIGNED NULL,
 ADD UNIQUE KEY outbox_conversation_sequence(bot_id,conversation_key,conversation_seq),
 ADD KEY outbox_conversation_head(bot_id,conversation_key,conversation_seq,state);
-- Review separate least-privilege grants for operational writer and Courier:
-- hd2_courier_lanes SELECT, INSERT, UPDATE only. No grants to the read account.
-- Keep flags OFF until schema, grants, old backlog and both protocol peers are verified.
