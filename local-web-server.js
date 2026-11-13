const path = require('node:path');
const fs = require('node:fs');
async function startLocalWeb(env = process.env) {
  const drain=require('./src/config/web-drain').create();
  const root = __dirname;
  const config = require('./src/config/api-only-startup').validateApiOnlyConfig(env);
  const port = Number(env.LOCAL_HTTPS_PORT || 8443);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === config.port) throw Error('Port HTTPS lokal tidak valid');
  if (env.HDWORK2_AUTH_V2 !== 'true') throw Error('Cookie auth V2 required');
  const origin=require('./src/config/web-origin').webOrigin(env,port);
  if (env.B2C_STAGING_ENABLED === 'true' || env.COURIER_ENABLED === 'true') throw Error('Integrasi eksternal harus nonaktif');
  if (!['true','false'].includes(env.HDWORK2_LOCAL_READ_ONLY)) throw Error('Tentukan mode read-only lokal secara eksplisit');
  const dist=require('./src/config/web-build').webBuild(root,env);
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw Error('Build frontend terlebih dahulu');
  if(env.LOCAL_WEB_DIST&&fs.realpathSync(dist).toLowerCase()!==dist.toLowerCase())throw Error('Candidate build symlink rejected');
  const server = require('./src/local-web').createLocalWeb({
    drain,cert: fs.readFileSync(path.resolve(root, env.LOCAL_TLS_CERT || '.local/tls/localhost.crt')),
    key: fs.readFileSync(path.resolve(root, env.LOCAL_TLS_KEY || '.local/tls/localhost.key')),
    dist, apiPort: config.port,allowedHosts:origin.allowedHosts,applicationSessionOnly:env.HDWORK2_EDGE_AUTH_MODE==='application-session',
  });
  const pool = require('./src/config/database');
  try { await require('./src/config/local-database-check').checkRuntimeDatabases({authPool:pool}); }
  catch (error) { await pool.end(); throw error; }
  let api;
  try {
    api = await require('./api-only-server').startApiOnly({drain});
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) { if (api) await new Promise(resolve => api.close(resolve)); await pool.end(); throw error; }
  const close = options => drain.close({...options,closePools:()=>pool.end()});
  return { server, api, close, port,drain };
}
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
  startLocalWeb().then(app => {
    console.log(`HD Work lokal: https://localhost:${app.port}; Telegram nonaktif`);
    let closing = false;
    const stop = () => { if (closing) return; closing = true; void app.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(() => { console.error('Web lokal gagal dimulai. Periksa konfigurasi privat, sertifikat, build, port dan koneksi/schema hdwork2.'); process.exitCode = 1; });
}
module.exports = { startLocalWeb };
