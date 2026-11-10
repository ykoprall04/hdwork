-- READ-ONLY DBA metadata inspection. Use an existing authorized DBA session.
-- No customer/order rows, password fields, migrations, grants or runtime writes.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hdwork2'
  AND (TABLE_NAME IN ('hd2_system_mappings','hd2_system_requests','hd2_system_state',
       'hd2_system_incidents','hd2_system_targets','hd2_system_alerts',
       'hd2_system_jobs','hd2_chat_messages')
       OR (TABLE_NAME='hd2_courier_outbox' AND COLUMN_NAME='delivered_at'))
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Index metadata checks uniqueness needed for mappings, requests and chat replay.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA='hdwork2'
  AND TABLE_NAME IN ('hd2_system_mappings','hd2_system_requests','hd2_system_state',
      'hd2_system_incidents','hd2_system_targets','hd2_system_alerts',
      'hd2_system_jobs','hd2_chat_messages')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Effective declared privilege metadata only; no authentication/user table reads.
SELECT 'GLOBAL' AS SCOPE_KIND, GRANTEE, '*' AS OBJECT_SCHEMA, '*' AS OBJECT_NAME,
       '' AS COLUMN_NAME, PRIVILEGE_TYPE, IS_GRANTABLE
FROM information_schema.USER_PRIVILEGES
WHERE GRANTEE IN ('''hdwork_ops_read''@''localhost''','''hdwork_ops_write''@''localhost''')
UNION ALL
SELECT 'SCHEMA', GRANTEE, TABLE_SCHEMA, '*', '', PRIVILEGE_TYPE, IS_GRANTABLE
FROM information_schema.SCHEMA_PRIVILEGES
WHERE GRANTEE IN ('''hdwork_ops_read''@''localhost''','''hdwork_ops_write''@''localhost''')
UNION ALL
SELECT 'TABLE', GRANTEE, TABLE_SCHEMA, TABLE_NAME, '', PRIVILEGE_TYPE, IS_GRANTABLE
FROM information_schema.TABLE_PRIVILEGES
WHERE GRANTEE IN ('''hdwork_ops_read''@''localhost''','''hdwork_ops_write''@''localhost''')
UNION ALL
SELECT 'COLUMN', GRANTEE, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, PRIVILEGE_TYPE, IS_GRANTABLE
FROM information_schema.COLUMN_PRIVILEGES
WHERE GRANTEE IN ('''hdwork_ops_read''@''localhost''','''hdwork_ops_write''@''localhost''');
