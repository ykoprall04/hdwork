-- MANUAL, additive, no seeds or runtime configuration activation.
USE hdwork2;
CREATE TABLE hd2_system_mappings (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 bot_id VARCHAR(64) NOT NULL, category VARCHAR(20) NOT NULL, profile VARCHAR(20) NOT NULL,
 chat_id VARCHAR(20) NOT NULL, thread_id VARCHAR(20) NULL,
 route_key VARCHAR(45) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 verified BOOLEAN NOT NULL DEFAULT FALSE, version INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 UNIQUE KEY mapping_pair(bot_id,route_key),
 CHECK(category IN ('TIAL','LOGIC'))
) ENGINE=InnoDB;
CREATE TABLE hd2_system_requests (
 actor_id BIGINT UNSIGNED NOT NULL, request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii NOT NULL, result JSON NULL,
 PRIMARY KEY(actor_id,request_id)
) ENGINE=InnoDB;
CREATE TABLE hd2_system_state (
 component VARCHAR(32) PRIMARY KEY, status VARCHAR(12) NOT NULL,
 checked_at DATETIME(3) NOT NULL, code VARCHAR(64) NOT NULL,
 CHECK(status IN ('ONLINE','DEGRADED','OFFLINE','UNKNOWN'))
) ENGINE=InnoDB;
CREATE TABLE hd2_system_incidents (
 id CHAR(36) CHARACTER SET ascii PRIMARY KEY, component VARCHAR(32) NOT NULL,
 from_status VARCHAR(12) NULL, to_status VARCHAR(12) NOT NULL,
 code VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 KEY incident_time(created_at,id)
) ENGINE=InnoDB;
CREATE TABLE hd2_system_targets (
 bot_id VARCHAR(64) PRIMARY KEY, chat_id VARCHAR(20) NOT NULL, thread_id VARCHAR(20) NULL,
 anchor_id VARCHAR(20) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 verified BOOLEAN NOT NULL DEFAULT FALSE, updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB;
CREATE TABLE hd2_system_alerts (
 bot_id VARCHAR(64) NOT NULL, alert_key VARCHAR(64) NOT NULL, window_id BIGINT UNSIGNED NOT NULL,
 outbox_id CHAR(36) CHARACTER SET ascii NULL,
 PRIMARY KEY(bot_id,alert_key)
) ENGINE=InnoDB;
CREATE TABLE hd2_system_jobs (
 kind VARCHAR(20) NOT NULL, window_id BIGINT UNSIGNED NOT NULL,
 state VARCHAR(16) NOT NULL, filename VARCHAR(100) NULL,
 bytes BIGINT UNSIGNED NULL, sha256 CHAR(64) CHARACTER SET ascii NULL,
 code VARCHAR(64) NULL, created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 finished_at DATETIME(3) NULL, PRIMARY KEY(kind,window_id)
) ENGINE=InnoDB;
ALTER TABLE hd2_courier_outbox ADD COLUMN delivered_at DATETIME(3) NULL;
