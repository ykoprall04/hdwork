const {randomUUID,createHmac}=require('node:crypto');
const {jakartaDay}=require('./parser');
async function saveCommand({e,parsed,settings,group,tx,audit}) {
  const c=tx.connection;
  const [[existing]]=await c.execute('SELECT * FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=? FOR UPDATE',[settings.botId,e.chat_id,e.message_id]);
  if(existing)return {disposition:'IGNORED'};
  let duplicate=null,key=null;
  if(parsed.command==='order'){
    key=createHmac('sha256',settings.identityKey).update('tial-order:'+parsed.sc_in.toUpperCase()).digest('hex');
    await c.execute('INSERT INTO hd2_tial_keys (dedupe_key) VALUES (?) ON DUPLICATE KEY UPDATE dedupe_key=dedupe_key',[key]);
    const [[reservation]]=await c.execute('SELECT order_id FROM hd2_tial_keys WHERE dedupe_key=? FOR UPDATE',[key]);
    duplicate=reservation.order_id;
    if(!duplicate){
      const [[historical]]=await c.execute("SELECT id FROM hd2_orders WHERE UPPER(sc_in)=? AND module='TIAL' AND duplicate_of IS NULL AND status<>'DUPLICATE' AND (command='order' OR command IS NULL) ORDER BY created_at,id LIMIT 1 FOR UPDATE",[parsed.sc_in.toUpperCase()]);
      duplicate=historical?.id || null;
    }
  }
  const id=randomUUID(),status=duplicate?'DUPLICATE':'WAITING';
  await c.execute('INSERT INTO hd2_orders (id,bot_id,module,business_day,chat_id,message_id,thread_id,sc_in,inet,status,duplicate_of,command,command_fields,raw_text,sender_id,telegram_timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,settings.botId,group.module,jakartaDay(e.timestamp),e.chat_id,e.message_id,e.telegram_thread_id,parsed.sc_in,parsed.fields['NO INET']||parsed.fields['NO INTERNET']||null,status,duplicate,parsed.command,JSON.stringify(parsed.fields),e.text,e.sender_id,e.timestamp]);
  if(key)await c.execute('UPDATE hd2_tial_keys SET order_id=? WHERE dedupe_key=?',[duplicate||id,key]);
  await audit(duplicate?'DUPLICATE_ORDER_RECORDED':'ORDER_RECEIVED',{id,status:null},status);
  return {disposition:'PROCESSED'};
}
module.exports={saveCommand};
