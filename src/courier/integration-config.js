// Pure validation, before loading a database driver, opening a socket or worker.
const { validateGroups } = require('./groups');
function configuration(env) {
  const reject = () => { throw Error('Courier integration configuration rejected'); };
  for (const flag of ['COURIER_RECEIVE_ENABLED', 'COURIER_OUTBOX_ENABLED', 'COURIER_WORKER_ENABLED','COURIER_DATABASE_ROUTING_ENABLED','HDWORK2_SYSTEM_ALERTS_APPROVED','COURIER_CHAT_ENABLED','COURIER_PRODUCTION_MODE']) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag])) reject();
  }
  if (env.HDWORK2_LOCAL_READ_ONLY !== 'false' || env.COURIER_ENABLED !== 'true' || env.COURIER_INTEGRATION_ENABLED !== 'true' ||
      env.COURIER_STORE !== 'mysql' || env.COURIER_SCHEMA_READY !== 'true' ||
      env.HDWORK2_OPERATIONS_ENABLED !== 'true' || env.HDWORK2_AUTH_V2 !== 'true' ||
      env.B2C_COMMAND_SCHEMA_READY !== 'true' || env.COURIER_DB_NAME !== 'hdwork2' ||
      env.COURIER_DB_HOST !== '127.0.0.1' ||
      !['USER', 'PASSWORD'].every(k => typeof env['COURIER_DB_' + k] === 'string' && env['COURIER_DB_' + k].trim()) ||
      ['root', 'mysql.sys', 'mysql.session', env.DB_USER, env.B2C_STAGING_DB_USER].includes(env.COURIER_DB_USER) ||
      !/^[a-z][a-z0-9_-]{1,63}$/.test(env.COURIER_BOT_ID || '') ||
      typeof env.COURIER_SERVICE_KEY !== 'string' || Buffer.byteLength(env.COURIER_SERVICE_KEY) < 32 ||
      typeof env.COURIER_IDENTITY_KEY !== 'string' || Buffer.byteLength(env.COURIER_IDENTITY_KEY) < 32 ||
      env.COURIER_IDENTITY_KEY === env.COURIER_SERVICE_KEY ||
      !/^[A-Za-z0-9_]{5,32}$/.test(env.COURIER_BOT_USERNAME || '') ||
      Number(env.WEB_CONCURRENCY || 1) !== 1 || Number(env.NODE_APP_INSTANCE || 0) !== 0) reject();
  if(env.COURIER_CHAT_ENABLED==='true'&&env.COURIER_DATABASE_ROUTING_ENABLED!=='true')reject();
  const activationBoundary=require('./activation-boundary').boundary(env.COURIER_ACTIVATION_NOT_BEFORE);
  if(env.COURIER_PRODUCTION_MODE==='true'&&(!activationBoundary||env.COURIER_CHAT_ENABLED!=='true'))reject();
  const port = env.COURIER_PORT || '3091', dbPort = env.COURIER_DB_PORT || '3306';
  if (![port, dbPort].every(p => /^[1-9]\d{0,4}$/.test(p) && Number(p) <= 65535) || Number(port) === Number(env.PORT || 3090) || Number(port) === Number(dbPort)) reject();
  let groups;
  try { groups = validateGroups(JSON.parse(env.COURIER_COMMAND_GROUPS_JSON)); } catch { reject(); }
  return {
    port: Number(port), botId: env.COURIER_BOT_ID, key: env.COURIER_SERVICE_KEY, activationBoundary: activationBoundary?.iso,
    database: { host: '127.0.0.1', port: Number(dbPort), user: env.COURIER_DB_USER,
      password: env.COURIER_DB_PASSWORD, database: 'hdwork2', connectionLimit: 2, connectTimeout: 5000,
      multipleStatements: false, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true },
    workflow: { enabled: true, webOnly: true, chatEnabled:env.COURIER_CHAT_ENABLED==='true', botId: env.COURIER_BOT_ID,
      botUsername: env.COURIER_BOT_USERNAME, identityKey: env.COURIER_IDENTITY_KEY, dedupeBy: 'sc_in', actors: [],
      groups: groups.map(g => ({ module: ['ASSUREN','B2B','REPLACEMENT'].includes(g.profile)?g.profile:g.profile === 'SOLVER1' ? 'LOGIC_PSB' : 'TIAL',
        chatId: g.chatId, threadId: g.threadId, threadMode: g.threadMode, commandProfile: g.profile, allowedCommands: g.commands })) },
    groups
  };
}
module.exports = { configuration };
