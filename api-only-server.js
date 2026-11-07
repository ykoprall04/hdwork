// Dedicated HTTP entry point: no legacy app, Telegram, sockets, agent or worker.
async function startApiOnly() {
  const http = require('node:http');
  const { createApiOnlyApp } = require('./src/api-only-app');
  const app = createApiOnlyApp();
  const port = Number(process.env.PORT || 3090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT tidak valid');
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
if (require.main === module) {
  require('dotenv').config();
  startApiOnly().then(() => console.log('HD Work API-only aktif pada loopback')).catch(() => { console.error('API-only gagal dimulai; periksa konfigurasi lokal'); process.exitCode = 1; });
}
module.exports = { startApiOnly };
