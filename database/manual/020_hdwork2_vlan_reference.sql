-- MANUAL REVIEW/APPLY ONLY. Never run by application startup or the Web updater.
-- Rehearse on an owned isolated MySQL first; production execution needs approval.
USE hdwork2;
CREATE TABLE hd2_vlan_reference (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 ip_olt VARCHAR(15) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 wilayah ENUM('SBU','SBS','MDR') NOT NULL,
 vlan_inet VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 vlan_voip VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 UNIQUE KEY vlan_exact (ip_olt,wilayah,vlan_inet,vlan_voip),
 KEY vlan_lookup (ip_olt,wilayah)
) ENGINE=InnoDB;
-- Different VLAN pairs for one IP/region are intentionally representable.
-- Lookup must report ambiguity, never select an arbitrary row.
GRANT SELECT ON hdwork2.hd2_vlan_reference TO 'hdwork_ops_read'@'localhost';
GRANT SELECT,INSERT,UPDATE,DELETE ON hdwork2.hd2_vlan_reference TO 'hdwork_ops_write'@'localhost';
-- No Courier grant: reference lookup is a Web operation, not a sender dependency.
