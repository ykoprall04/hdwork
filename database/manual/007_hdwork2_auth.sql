-- MANUAL ONLY. Fresh hdwork2 auth baseline; review existing users type/collation FIRST.
-- Fresh-only: an existing users table must STOP this file at its first statement.
-- DBA adaptation for existing users requires a separate approved plan. No --force.
-- FK id type must match BIGINT UNSIGNED exactly.
USE hdwork2;
CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role VARCHAR(20) NOT NULL,
 city_id BIGINT UNSIGNED NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
-- Existing ENUM role requires DBA-reviewed conversion; preserves existing strings.
ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL;
CREATE TABLE hd2_user_modules (
 user_id BIGINT UNSIGNED NOT NULL,
 module VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(user_id,module), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 revoked BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 KEY session_user(user_id,revoked), KEY session_expiry(expires_at),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_security_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 actor_id BIGINT UNSIGNED NULL,
 target_id BIGINT UNSIGNED NULL,
 action VARCHAR(40) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
 KEY security_time(created_at,id),
 FOREIGN KEY(actor_id) REFERENCES users(id), FOREIGN KEY(target_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE hd2_auth_guard (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO hd2_auth_guard VALUES (1);
-- No account/password imported or seeded. No startup auto-migration.
