// Separate, opt-in development foundation. Never imported by the web API startup.
async function startCourier() {
  if (process.env.COURIER_ENABLED !== 'true' || process.env.COURIER_STORE !== 'memory') throw Error('Courier disabled or unsupported store');
  const port = Number(process.env.COURIER_PORT || 3091);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === Number(process.env.PORT || 3090)) throw Error('Invalid courier port');
  const { MemoryStore } = require('./src/courier/memory-store');
  const { createCourierApp } = require('./src/courier/app');
  const app = createCourierApp({ botId: process.env.COURIER_BOT_ID, key: process.env.COURIER_SERVICE_KEY, store: new MemoryStore({ botId: process.env.COURIER_BOT_ID }) });
  const server = require('node:http').createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
if (require.main === module) startCourier().catch(() => { console.error('Courier startup failed'); process.exitCode = 1; });
module.exports = { startCourier };
