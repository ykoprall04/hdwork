-- MANUAL REVIEW ONLY. Dedicated backup identity, preserving all other accounts.
-- No CREATE USER, password, GRANT OPTION or execution by the application.
GRANT SELECT, SHOW VIEW ON hdwork2.* TO 'hdwork_backup'@'localhost';
