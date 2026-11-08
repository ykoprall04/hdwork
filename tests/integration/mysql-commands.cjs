// Called only by the guarded disposable harness. Synthetic data; no Telegram client.
const assert=require('node:assert/strict');
const {MysqlStore}=require('../../src/courier/mysql-store');
const {createB2CProcessor}=require('../../src/b2c-workflow/workflow');
const {createOrderReader}=require('../../src/b2c-read/orders');
async function exerciseCommands(pool) {
  let now=100000,update=100;
  const botId='new-bot-test';
  const store=new MysqlStore({pool,botId,now:()=>now});
  const groups=[['-10011','TIAL1'],['-10012','TIAL2'],['-10013','SOLVER1']].map(([chatId,commandProfile])=>({chatId,commandProfile,module:'TIAL',threadId:null,threadMode:'non_topic'}));
  const config={enabled:true,botId,identityKey:'synthetic-new-bot-test-key-0000000000',dedupeBy:'both',groups,actors:[{id:'9',name:'Synthetic HD'}]};
  const workflow=createB2CProcessor({store,config});
  const event=(text,chat='-10011',day=0)=>({version:1,bot_id:botId,update_id:String(++update),event:{kind:'message',chat_id:chat,message_id:String(update),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000+day*86400,text,attachments:[]}});
  const order='/order\nSC/IN: NEW-AOi1_suffix\nNO INET:000123\nSN ONT:TEST\nSTO:ABC\nKETERANGAN:synthetic\nNIK:SYNTHETIC';
  const submit=async e=>{await store.accept(e);await workflow.processNext();};
  const original=event(order);await submit(original);
  const [[canonical]]=await pool.execute("SELECT id FROM hd2_orders WHERE bot_id=? AND command='order'",[botId]);
  const checking=event('PROSES CEK');checking.event.reply_to_message_id=original.event.message_id;await submit(checking);
  // Explicit final state through trusted replies to the original anchor.
  const done=event('DONE');done.event.reply_to_message_id=original.event.message_id;await submit(done);
  const pending=[event(order,'-10012',1),event(order,'-10011',2),event(order,'-10012',3)];
  for(const e of pending)await store.accept(e);
  for(let tick=0;tick<12;tick++){await Promise.allSettled([workflow.processNext(),workflow.processNext()]);now+=60000;}
  const [duplicates]=await pool.execute("SELECT id,status,duplicate_of FROM hd2_orders WHERE bot_id=? AND command='order'",[botId]);
  assert.equal(duplicates.length,4);assert.equal(duplicates.filter(r=>r.status==='DUPLICATE').length,3);
  assert.equal(duplicates.find(r=>r.id===canonical.id).status,'DONE');
  assert.ok(duplicates.filter(r=>r.id!==canonical.id).every(r=>r.duplicate_of===canonical.id));
  await store.accept(original);assert.equal(await workflow.processNext(),false);
  for(const text of ['/config_psb\nOrder ID:NEW-AOi1\nSTO:ABC','/MO\nSC/IN:NEW-AOi1\nSTO:ABC','/req  unchanged\n  original'])for(let i=0;i<2;i++)await submit(event(text,'-10013'));
  const [all]=await pool.execute('SELECT command,raw_text,command_fields,sender_id,telegram_timestamp,duplicate_of FROM hd2_orders WHERE bot_id=?',[botId]);
  assert.equal(all.length,10);
  for(const command of ['config_psb','mo','req']){const rows=all.filter(r=>r.command===command);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.duplicate_of===null));}
  assert.ok(all.filter(r=>r.command==='req').every(r=>r.raw_text==='/req  unchanged\n  original'));
  assert.ok(all.every(r=>r.sender_id==='9'&&Number(r.telegram_timestamp)>0));
  const view=await createOrderReader(pool,true).list({module:'TIAL',limit:'50'});
  assert.equal(view.data.filter(r=>r.command).length,10);
  assert.ok(view.data.every(r=>!Object.hasOwn(r,'raw_text')&&!Object.hasOwn(r,'sender_id')&&!Object.hasOwn(r,'command_fields')));
  const prior=await createOrderReader(pool,true).detail(duplicates.find(r=>r.duplicate_of).id);assert.equal(prior.previous.id,canonical.id);assert.equal(prior.previous.status,'DONE');
  // Inject a fault after order/key writes, while using an actual DB transaction.
  const faultyPool={async getConnection(){const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql,values)=>{if(sql.startsWith('INSERT INTO hd2_audit'))throw Error('Synthetic fault');return target.execute(sql,values);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
  const faultyStore=new MysqlStore({pool:faultyPool,botId,now:()=>now});
  const faulty=createB2CProcessor({store:faultyStore,config});
  const broken=event(order.replace('NEW-AOi1','ROLLBACK-AOi1'));await store.accept(broken);
  await assert.rejects(faulty.processNext(),{statusCode:503});
  const [[after]]=await pool.execute('SELECT COUNT(*) AS total FROM hd2_orders WHERE bot_id=?',[botId]);assert.equal(Number(after.total),10);
  now+=60000;await workflow.processNext();
  const [[recovered]]=await pool.execute('SELECT COUNT(*) AS total FROM hd2_orders WHERE bot_id=?',[botId]);assert.equal(Number(recovered.total),11);
  const [indexes]=await pool.query('SHOW INDEX FROM hd2_orders');assert.ok(indexes.some(r=>r.Key_name==='order_original'&&Number(r.Non_unique)===0));
  assert.ok(!indexes.some(r=>r.Column_name==='sc_in'&&Number(r.Non_unique)===0));
  const [[fk]]=await pool.query("SELECT COUNT(*) AS total FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()");assert.ok(Number(fk.total)>=6);
  const start=performance.now();
  const plans=[];
  for(const sql of ["SELECT id FROM hd2_orders WHERE module='TIAL' ORDER BY created_at DESC,id DESC LIMIT 26", "SELECT id FROM hd2_orders WHERE module='TIAL' AND business_day='2023-11-15' ORDER BY created_at DESC,id DESC LIMIT 26", "SELECT order_id FROM hd2_tial_keys WHERE dedupe_key='synthetic-missing-key'"]){
    const [rows]=await pool.query('EXPLAIN '+sql);plans.push(rows.map(r=>({access:r.type,key:r.key,estimatedRows:r.rows})));
  }
  await createOrderReader(pool,true).list({module:'TIAL',limit:'2',page:'2'});
  return {rows:11,probeMs:Math.round((performance.now()-start)*100)/100,plans,scale:'small-synthetic-not-load-test'};
}
module.exports={exerciseCommands};
