const path = require('node:path');
const {validatePersistentAuth} = require('./persistent-auth');
const {options} = require('./operational-pools');
const origin = 'https://hdwork.yoloo.space';
function environment() {
  return {
    HDWORK2_PUBLIC_ORIGIN: origin, HDWORK2_PUBLIC_ORIGIN_APPROVED: 'true', FRONTEND_ORIGINS: origin,
    PORT: '3090', LOCAL_HTTPS_PORT: '8443',
    HDWORK2_SERVICE_AUTH_POLICY: 'session-audit-only', HDWORK2_SERVICE_AUTH_APPROVED: 'false',
    HDWORK2_AUTH_V2: 'true', HDWORK2_AUTH_ONLY: 'false', HDWORK2_AUTH_WRITE_ENABLED: 'false',
    HDWORK2_AUTH_READ_DASHBOARD: 'true', HDWORK2_LOCAL_READ_ONLY: 'true',
    HDWORK2_OPERATIONS_ENABLED: 'true', B2C_COMMAND_SCHEMA_READY: 'true',
    HDWORK2_OPERATIONAL_WRITE_APPROVED: 'false',
    DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'hdwork2', DB_USER: 'hdwork_auth',
    DB_PASSWORD_DPAPI_FILE: '.local/hdwork-auth.password.dpapi',
    JWT_SECRET_DPAPI_FILE: '.local/web-secrets/session-signing.dpapi',
    OP_READ_ENABLED: 'true', OP_READ_DB_HOST: '127.0.0.1', OP_READ_DB_PORT: '3306',
    OP_READ_DB_NAME: 'hdwork2', OP_READ_DB_USER: 'hdwork_ops_read',
    OP_READ_DB_PASSWORD_DPAPI_FILE: '.local/database-secrets/ops-read-password.dpapi',
    OP_WRITE_ENABLED: 'false', B2C_WORKFLOW_READ_ENABLED: 'false', B2C_STAGING_ENABLED: 'false',
    COURIER_ENABLED: 'false', COURIER_ALLOW_NETWORK: 'false',
  };
}
function ingress() {
  const tls = '    service: https://127.0.0.1:8443\n    originRequest:\n      originServerName: localhost\n      caPool: '+JSON.stringify(path.resolve(__dirname,'../../.local/tls/ca.crt').replace(/\\/g,'/'))+'\n      noTLSVerify: false\n      access:\n        required: true\n        teamName: replace-with-owned-team\n        audTag:\n          - '+ '0'.repeat(64)+'\n';
  const host = '  - hostname: hdwork.yoloo.space\n';
  return '# CANDIDATE ONLY. No actual tunnel ID, Access audience or credentials.\n'+
    'tunnel: 00000000-0000-4000-8000-000000000000\ningress:\n'+
    host+'    path: "^/(ready|internal|legacy|preview|uploads|socket[.]io|json|devtools|metrics)(/|$)"\n    service: http_status:404\n'+
    host+'    path: "^/api/auth/(login|logout|me)$"\n'+tls+
    host+'    path: "^/api/operations(/|$)"\n'+tls+
    host+'    path: "^/api(/|$)"\n    service: http_status:404\n'+
    host+tls+'  - service: http_status:404\n';
}
function validateEnvironment(env) {
  if(env.HDWORK2_SERVICE_AUTH_APPROVED!=='false' || env.DB_PASSWORD || env.JWT_SECRET || env.HDWORK2_PUBLIC_ORIGIN!==origin) throw Error('Candidate must remain inactive and credential-free');
  // Validate the proposed policy with synthetic approval in memory only.
  validatePersistentAuth({...env,HDWORK2_SERVICE_AUTH_APPROVED:'true'});
  const read = options('read',env);
  if(read.user!=='hdwork_ops_read'||read.database!=='hdwork2')throw Error('Read pool scope rejected');
  let writeBlocked=false;try{options('write',env);}catch{writeBlocked=true;}
  if(!writeBlocked)throw Error('Write pool must remain disabled');
  return {ok:true,scope:'offline-candidate',databaseConnected:false,authActivated:false,writePoolBlocked:true};
}
module.exports = {environment,ingress,validateEnvironment,origin};
