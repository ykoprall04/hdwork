// Opt-in composition root. Never imported by api-only-server.js or server.js.
async function startIntegration({ env = process.env,testWindow,testingRead,report=code=>console.error(code) } = {}) {
  const config = require('./src/courier/integration-config').configuration(env);
  if (require('node:cluster').isWorker) throw Error('Courier integration requires one fork');
  const pool = require('mysql2/promise').createPool(config.database);
  let server, worker;
  try {
    // Readiness is read-only. No automatic schema creation or provisioning.
    const [[target]]=await pool.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
    if(target.db!=='hdwork2'||target.account!==config.database.user+'@localhost')throw Error('Courier database identity rejected');
    const [grants]=await pool.query('SHOW GRANTS FOR CURRENT_USER');
    if(!require('./src/config/operational-grants').reviewOperationalGrants(grants,(env.COURIER_OUTBOX_ENABLED==='true'?'courierSend':'courier')+(env.COURIER_CHAT_ENABLED==='true'?'Chat':env.COURIER_DATABASE_ROUTING_ENABLED==='true'?'System':'')).ok)throw Error('Courier database grants rejected');
    await pool.execute('SELECT bot_id FROM hd2_courier_workers LIMIT 0');
    await pool.execute('SELECT nonce FROM hd2_courier_nonces LIMIT 0');
    await pool.execute('SELECT version,access_module FROM hd2_orders LIMIT 0');
    await pool.execute('SELECT received_seq FROM hd2_courier_inbox LIMIT 0');
    if(env.COURIER_DATABASE_ROUTING_ENABLED==='true'&&env.COURIER_OUTBOX_ENABLED==='true')await pool.execute('SELECT delivered_at FROM hd2_courier_outbox LIMIT 0');
    if(env.COURIER_CHAT_ENABLED==='true')await pool.execute('SELECT id,order_id FROM hd2_chat_messages LIMIT 0');
    const { MysqlStore } = require('./src/courier/mysql-store');
    const store = new MysqlStore({ pool, botId: config.botId, orderedInbox: true,recordDeliveryTime:env.COURIER_DATABASE_ROUTING_ENABLED==='true' });
    const { RuntimeStore } = require('./src/courier/runtime-store');
    const basePolicy = require('./src/courier/groups').createGroupPolicy({ botId: config.botId, botUsername: env.COURIER_BOT_USERNAME, groups: config.groups });
    const databasePolicy=env.COURIER_DATABASE_ROUTING_ENABLED==='true'?require('./src/system/routing').databasePolicy({system:require('./src/system/store').createSystem({readPool:pool,writePool:pool}),botId:config.botId,botUsername:env.COURIER_BOT_USERNAME,alertsApproved:env.HDWORK2_SYSTEM_ALERTS_APPROVED==='true',chatEnabled:env.COURIER_CHAT_ENABLED==='true'}):null;
    if(databasePolicy)await databasePolicy.configuration();
    const policy=testWindow?require('./src/courier/single-order-window').singleOrderWindow(basePolicy,testWindow):(databasePolicy||basePolicy);
    const app = require('./src/courier/integration-app').createIntegrationApp({ store,
      runtime: new RuntimeStore(store), policy, botId: config.botId, key: config.key,
      receive: env.COURIER_RECEIVE_ENABLED === 'true', send: env.COURIER_OUTBOX_ENABLED === 'true',testingRead:testWindow?testingRead:undefined,onFailure:testWindow?report:undefined });
    server = require('node:http').createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
    if (env.COURIER_WORKER_ENABLED === 'true') worker = require('./src/courier/inbox-worker').startInboxWorker(
      {async processNext(){const workflow=databasePolicy?await databasePolicy.workflow(config.workflow):config.workflow;return require('./src/b2c-workflow/workflow').createB2CProcessor({store,config:workflow}).processNext();}},
      { report }
    );
    let closing;
    const close = () => closing ||= (async () => {
      const closed = new Promise(resolve => server.close(resolve));
      await worker?.close();
      await closed;
      await pool.end();
    })();
    return { server, close };
  } catch (error) { server?.close(); await worker?.close(); await pool.end(); throw error; }
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--run') throw Error('Explicit run required');
  const app = await startIntegration();
  const shutdown = () => { app.close().catch(() => { console.error('Courier shutdown failed'); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); process.once('SIGBREAK', shutdown);
}
if (require.main === module) main().catch(() => { console.error('Courier integration startup rejected'); process.exitCode = 1; });
module.exports = { startIntegration };
