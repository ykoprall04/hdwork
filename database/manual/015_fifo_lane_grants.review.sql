-- REVIEW ONLY. Do not execute during preparation. Requires verified schema 015.
-- Existing accounts only; never CREATE USER, change passwords, grant DELETE or GRANT OPTION.
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_lanes TO 'hdwork_ops_write'@'localhost';
GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_courier_lanes TO 'hdwork_courier'@'localhost';
