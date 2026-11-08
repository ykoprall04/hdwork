const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {MysqlStore}=require('../src/courier/mysql-store');
const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
const {mockPool}=require('./helpers/courier-db');
test('new-bot commands do not adopt unclassified historical rows or touch legacy schemas',async()=>{
 const pool=mockPool();pool.state.orders.push({id:'historical-unclassified',module:'TIAL',sc_in:'NEW-AOi1',status:'DONE'});
 const store=new MysqlStore({pool,botId:'new-only'});
 const processor=createB2CProcessor({store,config:{enabled:true,botId:'new-only',identityKey:'synthetic-new-only-key-000000000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-10011',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1'}],actors:[{id:'9',name:'Test HD'}]}});
 for(let i=1;i<=2;i++){
 await store.accept({version:1,bot_id:'new-only',update_id:String(i),event:{kind:'message',chat_id:'-10011',message_id:String(i),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000+i*86400,text:'/order\nSC/IN:NEW-AOi1\nNO INET:000123\nSN ONT:TEST\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC',attachments:[]}});await processor.processNext();
 }
 assert.equal(pool.state.orders[1].status,'WAITING');assert.equal(pool.state.orders[1].duplicate_of,null);
 assert.equal(pool.state.orders[2].duplicate_of,pool.state.orders[1].id);
 assert.ok(pool.calls.every(sql=>!sql.includes('hd_b2c')&&!sql.includes('UPPER(sc_in)')));
});
test('new group templates are placeholders, non-topic, disabled and contain no credentials',()=>{
 const groups=JSON.parse(fs.readFileSync('ops/examples/new-bot-groups.json','utf8'));
 assert.deepEqual(groups.map(g=>g.profile),['TIAL1','TIAL2','SOLVER1']);assert.ok(groups.every(g=>g.threadId===null&&g.threadMode==='non_topic'&&g.chatId.startsWith('<')));
 const workflow=JSON.parse(fs.readFileSync('ops/examples/new-bot-workflow.json','utf8'));assert.equal(workflow.enabled,false);assert.ok(workflow.groups.every(g=>g.threadId===null));
 assert.equal(Object.keys(workflow).some(k=>/token|password/i.test(k)),false);
});
