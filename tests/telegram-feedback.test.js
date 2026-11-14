const test=require('node:test'),assert=require('node:assert/strict');
const {saveCommand}=require('../src/b2c-workflow/command-storage');
async function scenario({timestamp=200,duplicate=null,exists=false,failEnqueue=false}={}){
 const events=[];
 const c={async execute(sql){events.push(sql);if(sql.startsWith('SELECT *'))return [[...(exists?[{id:'existing'}]:[])]];if(sql.startsWith('SELECT order_id'))return [[{order_id:duplicate}]];return [{affectedRows:1}];}};
 const e={chat_id:'-5436357946',message_id:'25',telegram_thread_id:null,timestamp,sender_id:'123',text:'/order dummy'};
 const settings={botId:'hdworkopsbot-testing',identityKey:'x'.repeat(40),webOnly:true,feedbackNotBefore:100};
 const parsed={command:'order',sc_in:'TRIAL-AO20261109B',fields:{'NO INET':'000123'}};
 const group={module:'TIAL',threadMode:'non_topic'};
 const sent=[];
 const run=()=>saveCommand({e,parsed,settings,group,tx:{connection:c,async enqueue(key,payload){events.push('ENQUEUE');if(failEnqueue)throw Error('OUTBOX_UNAVAILABLE');sent.push({key,payload});}},audit:async()=>events.push('AUDIT')});
 return {run,events,sent};
}
test('new receipt is enqueued in order transaction after persistence with original reply anchor',async()=>{
 const s=await scenario();await s.run();assert.equal(s.sent.length,1);
 assert.match(s.sent[0].key,/^trial-received:100:/);
 assert.deepEqual(s.sent[0].payload,{method:'sendMessage',chat_id:'-5436357946',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'25',text:'Order diterima'});
 assert.ok(s.events.findIndex(x=>x.startsWith('INSERT INTO hd2_orders'))<s.events.indexOf('ENQUEUE'));
 assert.ok(s.events.indexOf('AUDIT')<s.events.indexOf('ENQUEUE'));
});
test('old orders, business duplicates and message replay do not enqueue receipt',async()=>{
 for(const options of [{timestamp:99},{duplicate:'canonical'},{exists:true}]){const s=await scenario(options);await s.run();assert.equal(s.sent.length,0);}
});
test('outbox failure propagates so parent order transaction rolls back',async()=>{
 const s=await scenario({failEnqueue:true});await assert.rejects(s.run(),/OUTBOX_UNAVAILABLE/);
});
test('feedback configuration cannot target any other bot/group',()=>{
 const {validateConfig}=require('../src/b2c-workflow/config');
 const base={enabled:true,botId:'hdworkopsbot-testing',identityKey:'k'.repeat(40),dedupeBy:'sc_in',actors:[],webOnly:true,botUsername:'HDWorkOpsBot',feedbackNotBefore:100,groups:[{module:'TIAL',chatId:'-5436357946',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1',allowedCommands:['order']}]};
 assert.equal(validateConfig(base).feedbackNotBefore,100);
 assert.throws(()=>validateConfig({...base,botId:'production'}));
 assert.throws(()=>validateConfig({...base,groups:[{...base.groups[0],chatId:'-999'}]}));
});
