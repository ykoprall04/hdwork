
'use strict';

// Persistent service policy validation.
// Does not load credentials or modify database permissions.
function validatePersistentAuth(env) {
  const policy = env.HDWORK2_SERVICE_AUTH_POLICY;
  if (policy === undefined) return false;

  if (!['session-audit-only', 'operational-write'].includes(policy)) {
    throw Error('Persistent auth policy rejected');
  }

  const writable = policy === 'operational-write';

  const required = {
    HDWORK2_SERVICE_AUTH_POLICY: policy,
    HDWORK2_SERVICE_AUTH_APPROVED: 'true',
    HDWORK2_LOCAL_READ_ONLY: writable ? 'false' : 'true',
    HDWORK2_AUTH_V2: 'true',
    HDWORK2_AUTH_ONLY: 'false',
    HDWORK2_AUTH_WRITE_ENABLED: writable ? 'true' : 'false',
    HDWORK2_AUTH_READ_DASHBOARD: 'true',
    HDWORK2_OPERATIONS_ENABLED: 'true',

    DB_USER: 'hdwork_auth',
    DB_NAME: 'hdwork2',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',

    OP_READ_ENABLED: 'true',
    OP_READ_DB_USER: 'hdwork_ops_read',
    OP_READ_DB_NAME: 'hdwork2',
    OP_READ_DB_HOST: '127.0.0.1',
    OP_READ_DB_PORT: '3306',

    OP_WRITE_ENABLED: writable ? 'true' : 'false',
    HDWORK2_OPERATIONAL_WRITE_APPROVED: writable ? 'true' : 'false',

    B2C_WORKFLOW_READ_ENABLED: 'false',
    B2C_STAGING_ENABLED: 'false',
    COURIER_ENABLED: 'false',
    COURIER_ALLOW_NETWORK: 'false',
    HDWORK2_PUBLIC_ORIGIN_APPROVED: 'true'
  };

  if (writable) {
    Object.assign(required, {
      OP_WRITE_DB_USER: 'hdwork_ops_write',
      OP_WRITE_DB_NAME: 'hdwork2',
      OP_WRITE_DB_HOST: '127.0.0.1',
      OP_WRITE_DB_PORT: '3306'
    });
  }

  if (
    Object.entries(required).some(
      ([key, value]) => env[key] !== value
    ) ||
    env.HDWORK2_AUTH_WRITE_UNTIL ||
    env.HDWORK2_PUBLIC_API_ORIGIN
  ) {
    throw Error('Persistent auth scope rejected');
  }

  const { origin } = require('./web-origin').webOrigin(
    env,
    Number(env.LOCAL_HTTPS_PORT || 8443)
  );

  if (
    origin.startsWith('https://localhost:') &&
    !(
      origin === 'https://localhost:8443' &&
      env.HDWORK2_SERVICE_BINDING === 'loopback' &&
      env.HDWORK2_LOCAL_SERVICE_AUTH_APPROVED === 'true'
    )
  ) {
    throw Error(
      'Persistent local auth requires explicit loopback approval'
    );
  }

  return true;
}

module.exports = { validatePersistentAuth };
