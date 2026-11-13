const { randomUUID } = require('node:crypto');
const {logger,observe}=require('../observability/raw-log');
const { eventEnvelope, outbound, digest, fail, messageId } = require('./contract');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const activeTransactions=new WeakSet();
const backoff = attempt => Math.min(60000, 2000 * 2 ** (attempt - 1));
class MysqlStore {
  constructor({ pool, botId, env = process.env, now = Date.now, maxAttempts = 5, orderedInbox = false, recordDeliveryTime = false, activationBoundary, chatDeliveryEvents = false, fifo = env.HDWORK2_COURIER_FIFO_ENABLED==='true', fifoRelease = env.HDWORK2_COURIER_FIFO_RELEASE_ENABLED==='true', routeFence = env.HDWORK2_SHARED_GROUPS_ENABLED==='true' }) {
    this.writerV2=require('../config/courier-writer').bots(env).includes(botId);
    if(this.writerV2){fifo=true;fifoRelease=true;}
    this.fifo=fifo;
    if(fifoRelease&&!fifo)throw Error('FIFO_RELEASE_REQUIRES_FIFO');
    this.fifoRelease=fifoRelease;
    this.routeFence=routeFence;
    this.inboxFence=routeFence?require('./route-fence').eligible('hd2_courier_inbox',true):'';
    this.outboxFence=routeFence?require('./route-fence').eligible('hd2_courier_outbox'):'';
    this.pool = pool; this.botId = botId; this.now = now; this.maxAttempts = maxAttempts;
    this.orderedInbox = orderedInbox; this.recordDeliveryTime = recordDeliveryTime;
    this.chatDeliveryEvents = chatDeliveryEvents;
    this.activationBoundary = require('./activation-boundary').boundary(activationBoundary);
    this.boundarySql = this.activationBoundary ? ' AND created_at>?' : '';
    this.boundaryParams = this.activationBoundary ? [this.activationBoundary.sql] : [];
  }
  async transaction(run) {
    const connection = await observe('MYSQL_POOL_ACQUIRE',{},()=>this.pool.getConnection());
    let liveDirty=false;
    const execute=connection.execute;
    connection.execute=function(...args){if(typeof args[0]==='string'&&/^INSERT INTO hd2_live_events\b/.test(args[0]))liveDirty=true;return observe('MYSQL_EXECUTE',{},()=>execute.apply(this,args));};
    try { await observe('MYSQL_BEGIN',{},()=>connection.beginTransaction()); activeTransactions.add(connection); const result = await run(connection); await observe('MYSQL_COMMIT',{},()=>connection.commit());if(liveDirty){try{require('../operations/live-signal').notify();}catch(error){logger().emit('LIVE_WAKE_FAILED',{status:'ERROR'},error);}} return result; }
    catch (error) { try { await observe('MYSQL_ROLLBACK',{},()=>connection.rollback()); } catch { /* release still required */ } throw error; }
    finally { activeTransactions.delete(connection);connection.execute=execute;connection.release(); }
  }
  async accept(body) {
    const payload = eventEnvelope(body, this.botId), hash = digest(payload), id = randomUUID();
    if (this.activationBoundary && payload.event.timestamp * 1000 <= this.activationBoundary.ms) throw fail(400);
    return this.transaction(async c => {
      await c.execute('INSERT INTO hd2_courier_inbox (id,bot_id,update_id,payload_hash,payload,due_ms) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [id, this.botId, payload.update_id, hash, JSON.stringify(payload), this.now()]);
      const [[row]] = await c.execute('SELECT id,payload_hash FROM hd2_courier_inbox WHERE bot_id=? AND update_id=? FOR UPDATE', [this.botId, payload.update_id]);
      if (!row || row.payload_hash !== hash) throw fail(409);
      logger().emit('INBOX_ACCEPTED',{correlationId:row.id,status:'PRECOMMIT'});
      return { receipt_id: row.id, duplicate: row.id !== id };
    });
  }
  async enqueueOn(c, key, body) {
    if (typeof key !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(key)) throw fail();
    const payload = outbound(body), hash = digest(payload), id = randomUUID();
    if(this.writerV2){if(!activeTransactions.has(c))throw Object.assign(fail(503),{code:'WRITER_TRANSACTION_REQUIRED'});await require('./writer-fence').enter(c,this.botId);}
    if(this.routeFence){const [[route]]=await c.execute('SELECT id FROM hd2_system_mappings WHERE bot_id=? AND chat_id=? AND thread_id<=>? AND enabled=TRUE AND verified=TRUE FOR SHARE',[this.botId,payload.chat_id,payload.telegram_thread_id]);if(!route)throw fail(403);}
    const lane=this.fifo?await (this.fifoRelease?require('./fifo-release').allocateOrder(c,this.botId,payload):require('./fifo').allocate(c,this.botId,payload)):null;
    if(this.writerV2&&!lane)throw Object.assign(fail(503),{code:'WRITER_FIFO_ORDER_REQUIRED'});
    await c.execute('INSERT INTO hd2_courier_outbox (id,bot_id,idem_key,payload_hash,payload,due_ms'+(lane?',conversation_key,conversation_seq':'')+(lane&&this.fifoRelease?',fifo_order_id':'')+') VALUES (?,?,?,?,?,?'+(lane?',?,?':'')+(lane&&this.fifoRelease?',?':'')+') ON DUPLICATE KEY UPDATE id=id', [id, this.botId, key, hash, JSON.stringify(payload), this.now(),...(lane?[lane.key,lane.sequence]:[]),...(lane&&this.fifoRelease?[lane.orderId]:[])]);
    const [[row]] = await c.execute('SELECT id,payload_hash FROM hd2_courier_outbox WHERE bot_id=? AND idem_key=? FOR UPDATE', [this.botId, key]);
    if (!row || row.payload_hash !== hash) throw fail(409);
    logger().emit('OUTBOX_ENQUEUE', {correlationId:row.id,status:'PRECOMMIT'});
    return row.id;
  }
  enqueue(key, body) { return this.transaction(c => this.enqueueOn(c, key, body)); }
  async claim(limit = 1, options = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw fail();
    const blocked=options.excludeChats??[];if(!Array.isArray(blocked)||blocked.length>128||blocked.some(x=>typeof x!=='string'||!/^-[1-9]\d{0,19}$/.test(x))||blocked.length&&!this.fifo)throw fail();
    const chatFence=blocked.length?" AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.chat_id')) NOT IN ("+blocked.map(()=>'?').join(',')+")":'';
    return this.transaction(async c => {
      if (options.before) await options.before(c);
      const now = this.now();
      if(this.fifo&&!this.fifoRelease){const [legacy]=await c.execute("SELECT id FROM hd2_courier_outbox WHERE bot_id=? AND state<>'SENT' AND (conversation_key IS NULL OR conversation_seq IS NULL)"+this.boundarySql+" LIMIT 1 FOR SHARE",[this.botId,...this.boundaryParams]);if(legacy.length)throw Object.assign(fail(503),{code:'FIFO_LEGACY_BACKLOG_REVIEW_REQUIRED'});}
      const [expired] = await c.execute("SELECT id,attempts FROM hd2_courier_outbox WHERE bot_id=? AND state='SENDING' AND lease_until_ms<=?" + this.boundarySql + this.outboxFence + " ORDER BY lease_until_ms,id LIMIT 100 FOR UPDATE SKIP LOCKED", [this.botId, now, ...this.boundaryParams]);
      for (const row of expired) {logger().emit('OUTBOX_EXPIRED',{correlationId:row.id,status:'PRECOMMIT',reason:'LEASE_EXPIRED'});await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', ['DEAD', now + backoff(row.attempts), 'LEASE_EXPIRED', row.id, this.botId]);}
      const [rows] = await c.execute(`SELECT id,payload,attempts,created_at${this.fifo?',conversation_key,conversation_seq':''} FROM hd2_courier_outbox WHERE bot_id=? AND state='QUEUED' AND due_ms<=? AND attempts<?` + this.boundarySql + this.outboxFence + (this.fifo?require(this.fifoRelease?'./fifo-release':'./fifo').predicate:'') + chatFence + " ORDER BY due_ms,id LIMIT ? FOR UPDATE SKIP LOCKED", [this.botId, now, this.maxAttempts, ...this.boundaryParams,...blocked, this.fifo?Math.min(10,limit*4):limit]);
      const messages = [];
      for (const row of rows) {
        if(messages.length>=limit)break;
        if(this.fifo&&!await require(this.fifoRelease?'./fifo-release':'./fifo').head(c,this.botId,row)){logger().emit('OUTBOX_BLOCKED',{correlationId:row.id,reason:'ORDER_PREDECESSOR'});continue;}
        if (options.authorize && !await options.authorize(json(row.payload), c)) {
          logger().emit('OUTBOX_REJECTED',{correlationId:row.id,status:'PRECOMMIT',reason:'AUTHORIZATION_DENIED'});
          await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', ['DEAD', now, 'BAD_REQUEST', row.id, this.botId]);
          continue;
        }
        const lease = randomUUID();
        await c.execute("UPDATE hd2_courier_outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until_ms=? WHERE id=? AND bot_id=?", [lease, now + 60000, row.id, this.botId]);
        logger().emit('OUTBOX_SELECTED',{correlationId:row.id,attempt:row.attempts+1,queueAgeMs:Number.isFinite(new Date(row.created_at).getTime())?Math.max(0,now-new Date(row.created_at).getTime()):undefined,status:'PRECOMMIT'});
        messages.push({ delivery_id: row.id, lease_token: lease, attempt: row.attempts + 1, payload: json(row.payload) });
      }
      return messages;
    });
  }
  async authorizeDelivery(id,body,options={}) {
    return this.transaction(async c=>{
      await options.before?.(c);
      const [[row]]=await c.execute("SELECT id,payload FROM hd2_courier_outbox WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=? AND lease_until_ms>?"+this.boundarySql+this.outboxFence+' FOR SHARE',[id,this.botId,body.lease_token,this.now(),...this.boundaryParams]);
      return !!row&&await options.authorize(json(row.payload),c);
    });
  }
  async settle(id, body) {
    if (!body || typeof body.lease_token !== 'string' || !['sent', 'retry', 'failed'].includes(body.result)) throw fail();
    const ack = { lease_token: body.lease_token, result: body.result, telegram_message_id: body.result === 'sent' ? messageId(body.telegram_message_id) : null, error_code: body.result === 'sent' ? null : body.error_code, retry_after: body.retry_after ?? 0 };
    if(this.fifoRelease&&body.telegram_error!==undefined)ack.telegram_error=require('./fifo-release').telegramError(body.telegram_error);
    if (!['NETWORK', 'RATE_LIMIT', 'FORBIDDEN', 'BAD_REQUEST', 'UNKNOWN', 'ECONNRESET', 'ETIMEDOUT', null].includes(ack.error_code) || !Number.isInteger(ack.retry_after) || ack.retry_after < 0 || ack.retry_after > 300) throw fail();
    if(body.reconciliation!==undefined){if(!this.fifo||body.reconciliation!==true||body.result!=='sent'||!/^[a-f0-9]{64}$/.test(body.evidence_sha256||''))throw fail();ack.reconciliation=true;ack.evidence_sha256=body.evidence_sha256;}
    const hash = digest(ack);
    return this.transaction(async c => {
      const [[row]] = await c.execute('SELECT * FROM hd2_courier_outbox WHERE id=? AND bot_id=?' + this.boundarySql + ' FOR UPDATE', [id, this.botId, ...this.boundaryParams]);
      if (!row) throw fail(409);
      if(row.administrative_closure)throw fail(409); // A late ACK cannot undo administrative closure.
      const reconcile=this.fifo&&body.reconciliation===true&&/^[a-f0-9]{64}$/.test(body.evidence_sha256||'')&&body.result==='sent'&&row.state==='DEAD'&&require('./delivery-state').uncertain(row.last_error_code)&&row.lease_token===body.lease_token;
      if (row.last_ack_token === body.lease_token&&!reconcile) { if (row.last_ack_hash !== hash) throw fail(409); return { duplicate: true }; }
      const late=this.fifo&&row.lease_token===body.lease_token&&(row.state==='SENDING'||row.state==='DEAD'&&row.last_error_code==='LEASE_EXPIRED');
      if (!reconcile&&!late&&(row.state !== 'SENDING' || row.lease_token !== body.lease_token || Number(row.lease_until_ms) <= this.now())) throw fail(409);
      let state = require('./delivery-state').settlementState(body.result,ack.error_code,row.attempts,this.maxAttempts);
      if(this.fifoRelease&&row.state==='DEAD'){
        if(state==='SENT')throw fail(409); // Preserve DEAD; retain receipt in journal for per-ID review.
        state='DEAD'; // A delayed RATE_LIMIT ACK must never resurrect an expired DEAD lease.
      }
      if(this.fifoRelease&&row.fifo_release&&state==='SENT')throw fail(409); // No late ACK may rewrite an operator disposition.
      await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_ack_token=?,last_ack_hash=?,telegram_message_id=?,last_error_code=? WHERE id=? AND bot_id=?', [state, this.now() + Math.max(ack.retry_after * 1000, backoff(row.attempts)), body.lease_token, hash, ack.telegram_message_id, ack.error_code, id, this.botId]);
      let releaseAlert=false;
      if(this.fifoRelease){
        if(ack.telegram_error)await c.execute('UPDATE hd2_courier_outbox SET telegram_error=? WHERE id=? AND bot_id=?',[JSON.stringify(ack.telegram_error),id,this.botId]);
        releaseAlert=await require('./fifo-release').automatic(c,{...row,state,last_error_code:ack.error_code},ack.telegram_error,this.now());
      }
      if(this.fifo)await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_DELIVERY_ACK',?)",[randomUUID(),JSON.stringify({outboxId:id,state,late:Number(row.lease_until_ms)<=this.now(),reconciliation:ack.reconciliation===true,evidenceSha256:ack.reconciliation?body.evidence_sha256:undefined})]);
      if(this.recordDeliveryTime&&state==='SENT')await c.execute('UPDATE hd2_courier_outbox SET delivered_at=UTC_TIMESTAMP(3) WHERE id=? AND bot_id=?',[id,this.botId]);
      if(this.chatDeliveryEvents)await c.execute("INSERT INTO hd2_live_events(module,kind) SELECT DISTINCT o.access_module,'change' FROM hd2_chat_messages m JOIN hd2_orders o ON o.id=m.order_id WHERE m.outbox_id=? AND m.bot_id=?",[id,this.botId]);
      return { duplicate: false, releaseAlert };
    }).then(result=>{
      if(result.releaseAlert)logger().emit('FIFO_RELEASE_ALERT',{correlationId:id,status:'ALERT',reason:'CONFIRMED_TELEGRAM_400'});
      return {duplicate:result.duplicate};
    });
  }
  async processNext(handler) {
    let selected;
    try {
      return await this.transaction(async c => {
        const [[row]] = this.orderedInbox
          ? await c.execute("SELECT id,payload,attempts,due_ms FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING'" + this.boundarySql + this.inboxFence + " ORDER BY received_seq LIMIT 1 FOR UPDATE", [this.botId, ...this.boundaryParams])
          : await c.execute("SELECT id,payload,attempts FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING' AND due_ms<=?" + this.boundarySql + this.inboxFence + " ORDER BY due_ms,id LIMIT 1 FOR UPDATE SKIP LOCKED", [this.botId, this.now(), ...this.boundaryParams]);
        if (!row) return false;
        if (this.orderedInbox && Number(row.due_ms) > this.now()) return false;
        selected = row.id;
        logger().emit('INBOX_SELECTED',{correlationId:row.id,attempt:row.attempts+1,status:'PRECOMMIT'});
        const result = await handler(json(row.payload), { connection: c, inboxId: row.id, enqueue: (key, payload) => this.enqueueOn(c, key, payload) });
        const state = result?.disposition === 'IGNORED' ? 'IGNORED' : 'PROCESSED';
        await c.execute('UPDATE hd2_courier_inbox SET state=?,attempts=attempts+1,processed_at=UTC_TIMESTAMP(3) WHERE id=? AND bot_id=?', [state, row.id, this.botId]);
        return true;
      });
    } catch (error) {
      logger().emit('INBOX_PROCESS_FAILURE',{correlationId:selected,status:'ERROR'},error);
      if (selected) await this.transaction(async c => {
        const [[row]] = await c.execute('SELECT state,attempts FROM hd2_courier_inbox WHERE id=? AND bot_id=? FOR UPDATE', [selected, this.botId]);
        if (row?.state === 'PENDING') await c.execute('UPDATE hd2_courier_inbox SET attempts=?,state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', [row.attempts + 1, row.attempts + 1 >= this.maxAttempts ? 'DEAD' : 'PENDING', this.now() + backoff(row.attempts + 1), 'HANDLER_FAILED', selected, this.botId]);
      });
      throw fail(503);
    }
  }
}
for(const name of ['transaction','accept','enqueueOn','claim','authorizeDelivery','settle','processNext']){
 const original=MysqlStore.prototype[name];MysqlStore.prototype[name]=function(...args){
  const data={};if(['settle','authorizeDelivery'].includes(name))data.correlationId=args[0];
  return observe('MYSQL_'+name.replace(/[A-Z]/g,c=>'_'+c).toUpperCase(),data,()=>original.apply(this,args));
 };
}
module.exports = { MysqlStore };
