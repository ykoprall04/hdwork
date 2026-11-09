// Service availability is continuous; individual sessions still expire after 8h.
// Pure validation: never loads credentials, opens a pool or changes approval.
function validatePersistentAuth(env) {
  if (env.HDWORK2_SERVICE_AUTH_POLICY === undefined) return false;
  const required = {
    HDWORK2_SERVICE_AUTH_POLICY: 'session-audit-only',
    HDWORK2_SERVICE_AUTH_APPROVED: 'true',
    HDWORK2_LOCAL_READ_ONLY: 'true', HDWORK2_AUTH_V2: 'true',
    HDWORK2_AUTH_ONLY: 'false', HDWORK2_AUTH_WRITE_ENABLED: 'false',
    HDWORK2_AUTH_READ_DASHBOARD: 'true', HDWORK2_OPERATIONS_ENABLED: 'true',
    DB_USER: 'hdwork_auth', DB_NAME: 'hdwork2', DB_HOST: '127.0.0.1', DB_PORT: '3306',
    OP_READ_ENABLED: 'true', OP_READ_DB_USER: 'hdwork_ops_read',
    OP_READ_DB_NAME: 'hdwork2', OP_READ_DB_HOST: '127.0.0.1', OP_READ_DB_PORT: '3306',
    OP_WRITE_ENABLED: 'false', HDWORK2_OPERATIONAL_WRITE_APPROVED: 'false',
    B2C_WORKFLOW_READ_ENABLED: 'false', B2C_STAGING_ENABLED: 'false',
    COURIER_ENABLED: 'false', COURIER_ALLOW_NETWORK: 'false',
    HDWORK2_PUBLIC_ORIGIN_APPROVED: 'true',
  };
  if (Object.entries(required).some(([key, value]) => env[key] !== value) ||
      env.HDWORK2_AUTH_WRITE_UNTIL || env.HDWORK2_PUBLIC_API_ORIGIN) {
    throw Error('Persistent auth scope rejected');
  }
  const {origin} = require('./web-origin').webOrigin(env, Number(env.LOCAL_HTTPS_PORT || 8443));
  if (origin.startsWith('https://localhost:') &&
      !(origin==='https://localhost:8443'&&env.HDWORK2_SERVICE_BINDING==='loopback'&&env.HDWORK2_LOCAL_SERVICE_AUTH_APPROVED==='true')) throw Error('Persistent local auth requires explicit loopback approval');
  return true;
}
module.exports = {validatePersistentAuth};
