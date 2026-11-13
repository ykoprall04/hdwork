// Dedicated HTTP entry point: no legacy app, Telegram, sockets, agent or worker.
async function startApiOnly({drain}={}) {
  // Validate before loading the app, database drivers/pools or HTTP listener.
  const config = require('./src/config/api-only-startup').validateApiOnlyConfig();
  const http = require('node:http');
  const { createApiOnlyApp } = require('./src/api-only-app');
  const app = createApiOnlyApp();
  const port = config.port;
  const server = http.createServer(drain?drain.wrap(app):app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  drain?.attach(server);
  return server;
}
if (require.main === module) {
  require('dotenv').config();
  startApiOnly().then(() => console.log('HD Work API-only aktif pada loopback')).catch(() => { console.error('API-only gagal dimulai; periksa konfigurasi lokal'); process.exitCode = 1; });
}
module.exports = { startApiOnly };
