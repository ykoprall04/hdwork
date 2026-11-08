// Creates missing private configuration only. Never connects to MySQL or Telegram.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function missing(file, content) {
  try { fs.writeFileSync(path.join(root, file), content, { flag: 'wx', mode: 0o600 }); console.log(file + ': dibuat; nilai privat tidak ditampilkan'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; console.log(file + ': dipertahankan'); }
}
missing('.env', [
  'NODE_ENV=development', 'PORT=3090', 'DB_HOST=127.0.0.1', 'DB_PORT=3306', 'DB_NAME=hdwork2',
  'DB_USER=hdwork_auth', 'DB_PASSWORD=', 'DB_PASSWORD_DPAPI_FILE=.local/hdwork-auth.password.dpapi', 'JWT_SECRET=' + randomBytes(48).toString('base64url'),
  'FRONTEND_ORIGINS=https://localhost:8443', 'HDWORK2_AUTH_V2=true',
  'HDWORK2_OPERATIONS_ENABLED=true', 'B2C_COMMAND_SCHEMA_READY=true', 'B2C_WORKFLOW_READ_ENABLED=true',
  'B2C_STAGING_ENABLED=false', 'COURIER_ENABLED=false', 'COURIER_ALLOW_NETWORK=false',
  'HDWORK2_LOCAL_READ_ONLY=true',
  'LOCAL_HTTPS_PORT=8443', 'LOCAL_TLS_CERT=.local/tls/localhost.crt', 'LOCAL_TLS_KEY=.local/tls/localhost.key', '',
].join('\n'));
missing('frontend/.env.local', 'VITE_API_BASE_URL=https://localhost:8443\nVITE_DEV_PORT=5173\nVITE_HDWORK2_AUTH_COOKIE=true\nVITE_HDWORK2_OPERATIONS=true\n');
