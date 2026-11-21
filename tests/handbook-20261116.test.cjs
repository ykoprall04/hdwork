const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {parseCommand}=require('../src/b2c-workflow/commands');
const spec=require('../contracts/b2c-commands.json');
const {rejectionText,matchesRejection}=require('../src/b2c-workflow/rejection');
const messages={
 order:'/order\nSC/IN:X-AO123\nSN ONT:SN1\nTIPE TRANSAKSI:AO\nSTO:BKL\nKETERANGAN:synthetic\nNIK:TEST',
 mo:'/MO\nSC/IN:X-MO123\nTIPE TRANSAKSI:MO\nSTO:BKL\nKETERANGAN:synthetic\nNIK:TEST',
 config_psb:'/config_psb\nOrder ID DSC:X-AO123\nNo SN ONT:SN1\nKeperluan:synthetic\nSTO:BKL'
};
const cases=[];
const fullConfig=messages.config_psb+'\nNIK Atasan:TEST\nService:custom\ntipe ONT:TEST\nNo Inet:000123\nNo Voice:000456\nUsee TV:000789\nDomain:example.invalid\nHostname GPON:GPON1\nIP GPON:192.0.2.2\nIP OLT:192.0.2.1\nRack/Shelf/Slot/Port:1/2/3/4\nNama / NIK Pelapor:Synthetic / TEST\nWITEL:TEST';
function check(text){cases.push(text);return parseCommand(text,'ALL');}
test('handbook matrix: required/optional, blank, dash, unknown, shuffled, aliases, duplicate labels and identity',()=>{
 for(const [command,raw] of Object.entries(messages)){
  assert.equal(check(raw).valid,true);
  assert.equal(check([raw.split('\n')[0],...raw.split('\n').slice(1).reverse()].join('\n')).valid,true);
  assert.equal(check(raw+'\nUnrecognized:anything\nintroductory text').valid,true);
  const canonical=raw.replace('Order ID DSC:','ORDER ID:').replace('No SN ONT:','SN ONT BARU:').replace('Keperluan:','KETERANGAN:');
  for(const field of spec[command].required){
   const rest=canonical.split('\n').filter(l=>l.split(':')[0].toUpperCase()!==field).join('\n');
   assert.equal(check(rest).valid,false,field);
   for(const value of ['', '-', '   '])assert.equal(check(rest+'\n'+field+':'+value).valid,value==='-'&&field!==spec[command].identity,field);
   assert.equal(check(canonical+'\n'+field+':duplicate').valid,false,field);
  }
  for(const field of spec[command].optional){
   assert.equal(check(raw+'\n'+field+':-').valid,true,field);
   assert.equal(check(raw+'\n'+field+':-\n'+field+':-').valid,false,field);
  }
  assert.equal(check(raw.replace('X-AO123','INVALID').replace('X-MO123','INVALID')).valid,false);
 }
 assert.equal(check(messages.config_psb+'\nService:ANY PACKAGE\ntipe ONT:-').valid,true);
 assert.equal(check(messages.config_psb.replace('SN1','bad serial !')).valid,false);
 assert.equal(check(messages.order.replace('SN1','bad serial !')).valid,false);
 for(const pair of [['No SN ONT','SN ONT BARU'],['Order ID DSC','ORDER ID'],['Keperluan','KETERANGAN']])assert.equal(check(messages.config_psb+'\n'+pair[1]+':duplicate').valid,false);
 assert.equal(check(messages.order+'\nNO INET:000123\nNO INET/TELP:000456').valid,false);
 for(const raw of ['/req','/req   ','/req first\nsecond'])assert.deepEqual(check(raw),{valid:true,command:'req',sc_in:null,fields:{},request:raw.slice(4),original:raw});
});
test('complete new config fields retain separate GPON data and historical canonical keys',()=>{
 const raw=fullConfig;
 const p=check(raw);assert.equal(p.valid,true,JSON.stringify(p));
 assert.equal(p.fields['HOSTNAME GPON'],'GPON1');assert.equal(p.fields['IP GPON'],'192.0.2.2');
 assert.equal(p.fields['SN ONT BARU'],'SN1');assert.equal(p.fields.KETERANGAN,'synthetic');assert.equal(p.fields['NAMA/NIK PELAPOR'],'Synthetic / TEST');
});
test('Node/Python parity for the entire handbook validation matrix',()=>{
 const p=spawnSync('python',['-B','-c',"import sys,json;from courier.commands import parse_command;print(json.dumps([parse_command(t,'ALL') for t in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONPATH:'courier_bot',PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),cases.map(t=>parseCommand(t,'ALL')));
});
test('all invalid command replies contain safe reasons, complete template, exact anchor and no MO STB template',()=>{
 for(const raw of Object.values(messages)){
  const p=check(raw+'\nSTO:duplicate'),text=rejectionText(p);assert.match(text,/STO berulang/);assert.ok(text.endsWith(spec[p.command].template.join('\n')));assert.ok(text.length<4096);
  if(p.command==='mo')assert.doesNotMatch(text,/STB ID/);
  const event={kind:'message',reply_to_message_id:null,chat_id:'-1001',message_id:'123',telegram_thread_id:null,text:raw+'\nSTO:duplicate'};
  const payload={chat_id:'-1001',reply_to_message_id:'123',telegram_thread_id:null,text};
  assert.equal(matchesRejection(payload,event,{profile:'ALL'}),true);
  assert.equal(matchesRejection({...payload,text:text+' forged'},event,{profile:'ALL'}),false);
  assert.equal(matchesRejection({...payload,reply_to_message_id:'124'},event,{profile:'ALL'}),false);
 }
});
test('mock storage: all config fields in JSON; raw text unchanged; invalids create no orders; replays deduplicated',async()=>{
 const {mockPool}=require('./helpers/courier-db');const {MysqlStore}=require('../src/courier/mysql-store');const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}});
 const processor=createB2CProcessor({store,config:{enabled:true,botId:'sandbox',identityKey:'synthetic-identity-key-000000000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-1001',threadId:null,threadMode:'non_topic',commandProfile:'ALL'}],actors:[{id:"9",name:"Synthetic"}]}});
 const raw=fullConfig+'\nUnknown:preserved';
 const sequence=[messages.order,raw,raw+'\nSTO:duplicate',messages.mo,messages.mo+'\nNIK:-','/req request body'];
 for(let i=0;i<sequence.length;i++){
  const event={version:1,bot_id:'sandbox',update_id:String(i+1),event:{kind:'message',chat_id:'-1001',message_id:String(i+1),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000+i*3,text:sequence[i],attachments:[]}};
  await store.accept(event);await processor.processNext();await store.accept(event);assert.equal(await processor.processNext(),false);
 }
 assert.equal(pool.state.orders.length,4);assert.equal(pool.state.outbox.length,6);
 const config=pool.state.orders.find(o=>o.command==='config_psb');assert.equal(config.raw_text,raw);
 const fields=JSON.parse(config.command_fields);assert.equal(fields['HOSTNAME GPON'],'GPON1');assert.equal(fields['IP GPON'],'192.0.2.2');assert.equal(fields.Unknown,undefined);
 assert.deepEqual(fields,parseCommand(raw,'ALL').fields);
 for(const i of [2,4]){const reply=JSON.parse(pool.state.outbox[i].payload);assert.equal(reply.reply_to_message_id,String(i+1));assert.match(reply.text,/Template:/);}
});

test('config_psb accepts a dash as the ONT serial through either supported label',()=>{
 for(const label of ['No SN ONT','SN ONT BARU']){
  const input=messages.config_psb.replace('No SN ONT:SN1',label+': -');
  const result=parseCommand(input,'SOLVER1');
  assert.equal(result.valid,true);
  assert.equal(result.fields['SN ONT BARU'],'-');
  assert.deepEqual(parseCommand(input.replace(': -',': '),'SOLVER1').errors,['SN ONT BARU']);
  assert.equal(parseCommand(input.replace('STO:BKL','STO:-'),'SOLVER1').fields.STO,'-');
 }
});
