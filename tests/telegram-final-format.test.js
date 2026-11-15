const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {parseCommand}=require('../src/b2c-workflow/commands');
const spec=require('../contracts/b2c-commands.json');
const full='DGPS261114132409411765742-AOi426111401240987426bc70_111745119-878740503~2026111413264845783074';
const order=`/order\nSC/IN:${full}\nSN ONT:SN1\nTIPE TRANSAKSI:ignored\nSTO:ABC\nKETERANGAN:pasang\nNIK:TEST`;
const config=`/config_psb\nService:INDIHOME\nOrder ID:${full}\nService (1P/2P/3P/1P-Voice):1P\nTipe ONT:TEST\nSTO:ABC\nKeterangan:pasang`;
const mo='/MO\nSC/IN:8WVGR038GTS1I8GV6VJC1AMCA-MOk42610270909056813c78f0_109244604-847961427\nTIPE TRANSAKSI:ignored\nSTO:ABC\nKETERANGAN:pindah\nNIK:TEST';
const cases=[];
function check(text){cases.push(text);return parseCommand(text,'TIAL1');}
test('four final formats, required empties/duplicates, optional dashes and free text',()=>{
 for(const raw of [order,config,mo]){
  const parsed=check(raw);assert.equal(parsed.valid,true,JSON.stringify(parsed));
  for(const field of spec[parsed.command].required){
   const lines=raw.split('\n'),index=lines.findIndex(l=>l.split(':')[0].toUpperCase()===field);
   assert.ok(index>=0);
   for(const value of ['', '-', '   ']){const copy=[...lines];copy[index]=field+':'+value;assert.equal(check(copy.join('\n')).valid,false);}
   assert.equal(check(raw+'\n'+lines[index]).valid,false);
  }
  for(const field of spec[parsed.command].optional)assert.equal(check(raw+'\n'+field+':-').valid,true);
  const extra=raw+'\nfree text\nUnknown:extra';const p=check(extra);assert.equal(p.valid,true);assert.equal(p.original,extra);assert.equal(p.fields.KETERANGAN,parsed.fields.KETERANGAN);
  const reordered=[raw.split('\n')[0].toUpperCase(),...raw.split('\n').slice(1).reverse()].join('\n');assert.equal(check(reordered).valid,true);
 }
 for(const raw of ['/req','/REQ   ','/req anything: -\n arbitrary'])assert.equal(check(raw).valid,true);
 assert.equal(check(config).fields.SERVICE,'INDIHOME');
 assert.equal(check(config).fields['SERVICE (1P/2P/3P/1P-VOICE)'],'1P');
});
test('SC/IN extraction and transaction source; direct identity only for MO',()=>{
 assert.equal(check(order).sc_in,full.split('_')[0]);assert.equal(check(config).sc_in,full.split('_')[0]);
 assert.equal(check(mo).sc_in,'MOk42610270909056813c78f0');
 for(const code of ['AOx123','pDAx123','MOk42610270909056813c78f0','DOENFKWEJHFVIOS']){
  const p=check(mo.replace(/SC\/IN:[^\n]+/,'SC/IN:'+code));assert.equal(p.sc_in,code);assert.equal(p.fields['TIPE TRANSAKSI'],/^(PDA|AO|MO|DO)/i.exec(code)[1].toUpperCase());
  assert.equal(check(order.replace(full,code)).valid,false);assert.equal(check(config.replace(full,code)).valid,false);
  assert.equal(check(order.replace(full,'PREFIX-'+code+'_suffix')).fields['TIPE TRANSAKSI'],p.fields['TIPE TRANSAKSI']);
 }
});
test('network group pairing, ambiguous groups, unrelated ports, ODP normalization',()=>{
 for(const [suffix,expected] of [['4','04'],['9','09'],['45','45']]){
  const p=check(order+`\nODP:ODP-ABC/`+suffix+'\nPort:99\nIP OLT:10.0.0.1\nSlot:2\nPort:3\nother text\nPort:88');
  assert.equal(p.valid,true);assert.equal(p.fields.odp,'ODP-ABC/'+expected);assert.equal(p.fields.ip_olt,'10.0.0.1');assert.equal(p.fields.slot,'2');assert.equal(p.fields.port,'3');
 }
 for(const tail of ['\nIP OLT:10.0.0.1\nSlot:2\nfree\nPort:88','\nPort:88','\nIP OLT:10.0.0.1\nSlot:2\nPort:3\nIP OLT:10.0.0.2\nSlot:4\nPort:5'])assert.equal(check(order+tail).fields.port,null);
 assert.equal(check(order+'\nODP:X/4\nSummary ODP:Y/9').fields.odp,null);
});
test('Python and JavaScript return identical final-format contracts',()=>{
 const script="import json,sys; from courier.commands import parse_command; print(json.dumps([parse_command(t,'TIAL1') for t in json.load(sys.stdin)]))";
 const p=spawnSync('python',['-c',script],{input:JSON.stringify(cases),encoding:'utf8',env:{...process.env,PYTHONPATH:'courier_bot'}});
 assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),cases.map(t=>parseCommand(t,'TIAL1')));
});
module.exports={order,config,mo};
test('mock Courier persists JSON/raw text, rejects invalid, keeps replay and dashboard compatibility',async()=>{
 const {mockPool}=require('./helpers/courier-db');const {MysqlStore}=require('../src/courier/mysql-store');const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}});
 const workflow=createB2CProcessor({store,config:{enabled:true,botId:'sandbox',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-1001',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1'}],actors:[{id:'9',name:'Synthetic'}]}});
 const envelope=(n,text)=>({version:1,bot_id:'sandbox',update_id:String(n),event:{kind:'message',chat_id:'-1001',message_id:String(n),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text,attachments:[]}});
 const raw=order+'\nODP:ODP-ABC/4\nIP OLT:10.0.0.1\nSlot:2\nPort:3\nextra text';
 const messages=[raw,config,mo,'/req',raw,order.replace('SN ONT:SN1','SN ONT:-')];
 for(let i=0;i<messages.length;i++){await store.accept(envelope(i+1,messages[i]));await workflow.processNext();}
 assert.equal(pool.state.orders.length,5);assert.equal(pool.state.orders[4].status,'DUPLICATE');
 assert.equal(pool.state.orders[0].raw_text,raw);assert.equal(JSON.parse(pool.state.orders[0].command_fields).odp,'ODP-ABC/04');
 const reply=JSON.parse(pool.state.outbox.at(-1).payload);assert.match(reply.text,/SN ONT/);assert.equal(reply.reply_to_message_id,'6');
 await store.accept(envelope(6,messages[5]));assert.equal(await workflow.processNext(),false);assert.equal(pool.state.outbox.length,6);
 const {reader}=require('../src/operations/read');const hd={id:1,role:'HD',is_active:1,username:'synthetic',modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO']};
 let row=pool.state.orders[0];
 const c={async query(){},async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql){if(sql.includes('o.command_fields'))return [[{...row,module:'TIAL',version:1}]];return [[]];}};
 const dashboard=reader({async getConnection(){return c;}});
 let detail=await dashboard.detail(row.id,hd);assert.equal(detail.fields.odp,'ODP-ABC/04');assert.equal(detail.originalMessage,raw);
 row=pool.state.orders[1];detail=await dashboard.detail(row.id,hd);assert.equal(detail.fields['SERVICE (1P/2P/3P/1P-VOICE)'],'1P');assert.equal(detail.fields.SERVICE,'INDIHOME');
 row=pool.state.orders[3];detail=await dashboard.detail(row.id,hd);assert.equal(detail.originalMessage,'/req');assert.equal(detail.requestText,'');
 row={...pool.state.orders[1],command_fields:JSON.stringify({SERVICE:'2P','TIPE ONT BARU':'legacy'}),raw_text:'legacy original'};
 detail=await dashboard.detail(row.id,hd);assert.equal(detail.fields.SERVICE,'2P');assert.equal(detail.fields['TIPE ONT BARU'],'legacy');assert.equal(detail.originalMessage,'legacy original');
});
