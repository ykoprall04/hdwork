const { randomUUID, createHmac } = require('node:crypto');
const { eventEnvelope, fail } = require('../courier/contract');
const { validateConfig } = require('./config');
const { parseOrder, parseStatus, jakartaDay } = require('./parser');
function createB2CProcessor({ store, config }) {
  const settings = validateConfig(config);
  if (!store || store.botId !== settings.botId || typeof store.processNext !== 'function') throw fail();
  async function handle(body, tx) {
    const { event: e } = eventEnvelope(body, settings.botId);
    const c = tx.connection;
    async function audit(action, order = null, toStatus = null, detail = null) {
      await c.execute('INSERT INTO hd2_audit (id,inbox_id,order_id,action,actor_id,from_status,to_status,detail) VALUES (?,?,?,?,?,?,?,?)', [randomUUID(),tx.inboxId,order?.id || null,action,e.sender_id,order?.status || null,toStatus,detail ? JSON.stringify(detail) : null]);
    }
    async function ignore(action, order = null) { await audit(action,order); return { disposition:'IGNORED' }; }
    const group = settings.groups.find(g => g.chatId === e.chat_id && g.threadId === e.telegram_thread_id);
    if (!group) return ignore('UNMAPPED_GROUP_OR_THREAD');
    // An edit cannot silently rewrite the original order or replay a status action.
    if (e.kind !== 'message') return ignore('EDIT_REQUIRES_REVIEW');
    if (!group.commandProfile && e.text.trimStart().startsWith('/')) return ignore('COMMAND_CONFIG_REQUIRED');
    if (group.commandProfile && (e.reply_to_message_id === null || e.text.trimStart().startsWith('/'))) {
      const parsed=require('./commands').parseCommand(e.text,group.commandProfile);
      if (!parsed.valid) return ignore('COMMAND_VALIDATION_REJECTED');
      return require('./command-storage').saveCommand({e,parsed,settings,group,tx,audit});
    }
    if (e.reply_to_message_id !== null && process.env.HDWORK2_OPERATIONS_ENABLED==='true') return ignore('TELEGRAM_STATUS_DEFERRED_BATCH12');
    if (e.reply_to_message_id !== null) {
      const actor = settings.actors.find(a => a.id === e.sender_id);
      if (!actor) return ignore('UNAUTHORIZED_STATUS_SENDER');
      const [[order]] = await c.execute('SELECT * FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=? FOR UPDATE', [settings.botId,e.chat_id,e.reply_to_message_id]);
      if (!order || order.module !== group.module || order.thread_id !== e.telegram_thread_id) return ignore('UNKNOWN_REPLY_ANCHOR');
      if (order.status === 'DUPLICATE' || order.duplicate_of) return ignore('DUPLICATE_REPLY_IGNORED',order);
      const action = parseStatus(e.text);
      if (!action) return ignore('NOT_A_STATUS_COMMAND',order);
      const allowed = (order.status === 'WAITING' && action.status === 'IN_PROGRESS') || (order.status === 'IN_PROGRESS' && ['DONE','FAILED'].includes(action.status));
      if (!allowed) return ignore(order.status === action.status ? 'STATUS_ALREADY_APPLIED' : 'INVALID_STATUS_TRANSITION',order);
      await c.execute("UPDATE hd2_orders SET status=?,last_actor_id=?,started_at=CASE WHEN ?='IN_PROGRESS' THEN UTC_TIMESTAMP(3) ELSE started_at END,finished_at=CASE WHEN ? IN ('DONE','FAILED') THEN UTC_TIMESTAMP(3) ELSE finished_at END WHERE id=? AND bot_id=?", [action.status,e.sender_id,action.status,action.status,order.id,settings.botId]);
      await audit('STATUS_CHANGED',order,action.status,action.reason ? {reason:action.reason} : null);
      const text = action.status === 'IN_PROGRESS' ? `🟡 Data di cek ${actor.name}` : action.status === 'DONE' ? '🟢 DONE' : '🔴 GAGAL';
      await tx.enqueue(`b2c:${tx.inboxId}:status`, {method:'sendMessage',chat_id:e.chat_id,telegram_thread_id:group.threadId,thread_mode:group.threadMode,reply_to_message_id:order.message_id,text});
      return { disposition:'PROCESSED' };
    }
    const data = parseOrder(e.text);
    if (!data) return ignore('UNRECOGNIZED_ORDER_FORMAT');
    const fields = settings.dedupeBy === 'both' ? [data.sc_in,data.inet] : [data[settings.dedupeBy]];
    if (fields.some(value=>!value)) return ignore('MISSING_DEDUPLICATION_FIELD');
    const [[existing]] = await c.execute('SELECT * FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=? FOR UPDATE', [settings.botId,e.chat_id,e.message_id]);
    if (existing) return ignore('ORIGINAL_MESSAGE_ALREADY_RECORDED',existing);
    const day = jakartaDay(e.timestamp);
    const key = createHmac('sha256',settings.identityKey).update(JSON.stringify(fields)).digest('hex');
    const scope = [settings.botId,group.module,day,key];
    await c.execute('INSERT INTO hd2_daily_keys (bot_id,module,business_day,dedupe_key) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE dedupe_key=dedupe_key',scope);
    const [[reservation]] = await c.execute('SELECT order_id FROM hd2_daily_keys WHERE bot_id=? AND module=? AND business_day=? AND dedupe_key=? FOR UPDATE',scope);
    if (!reservation) throw fail(503);
    const orderId = randomUUID(), duplicate = reservation.order_id || null, status = duplicate ? 'DUPLICATE' : 'WAITING';
    await c.execute('INSERT INTO hd2_orders (id,bot_id,module,business_day,chat_id,message_id,thread_id,sc_in,inet,status,duplicate_of) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [orderId,settings.botId,group.module,day,e.chat_id,e.message_id,e.telegram_thread_id,data.sc_in,data.inet,status,duplicate]);
    if (!duplicate) await c.execute('UPDATE hd2_daily_keys SET order_id=? WHERE bot_id=? AND module=? AND business_day=? AND dedupe_key=?',[orderId,...scope]);
    await audit(duplicate ? 'DUPLICATE_ORDER_RECORDED' : 'ORDER_RECEIVED',{id:orderId,status:null},status);
    return { disposition:'PROCESSED' };
  }
  // Explicit single-step processing only. No timer, bot client, network or startup hook.
  return { processNext: () => store.processNext(handle) };
}
module.exports = { createB2CProcessor };
