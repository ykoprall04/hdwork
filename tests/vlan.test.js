const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {STO_AREA,regionForSto,input,lookup}=require('../src/vlan/reference');
const {parseCommand}=require('../src/b2c-workflow/commands');
const {formatOrder}=require('../src/vlan/format');
const order='/order\nSC/IN:DGPS-AO123\nSN ONT:SYNTHETIC\nTIPE TRANSAKSI:AO\nSTO:BBA\nKETERANGAN:fixture\nNIK:TEST\nNO INET:000123\nNO VOICE:000456';
const config='/config_psb\nORDER ID:DGPS-AO123\nSERVICE (1P/2P/3P/1P-Voice):1P\nTIPE ONT:SYNTHETIC\nSTO:BBA\nKETERANGAN:fixture';
const network='\nSummary ODP:ODP-TEST/4\nPORT ODP:99\nIP OLT:192.0.2.1\nSlot:2\nPort:3\nValins ID:VALINS-TEST';
test('final STO mapping is exact; unknown STO never guesses a region',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(STO_AREA).map(([k,v])=>[k,v.length])),{SBU:23,MDR:18,SBS:7});
 assert.equal(new Set(Object.values(STO_AREA).flat()).size,48);
 assert.equal(regionForSto(' bba '),'SBU');assert.equal(regionForSto('ABT'),'MDR');assert.equal(regionForSto('TPO'),'SBS');assert.equal(regionForSto('SBY'),null);assert.equal(regionForSto('UNKNOWN'),null);
});
test('both commands parse optional network groups; no network keeps required validation unchanged',()=>{
 const required=require('../contracts/b2c-commands.json');
 assert.deepEqual(required.order.required,['SC/IN','SN ONT','TIPE TRANSAKSI','STO','KETERANGAN','NIK']);
 assert.deepEqual(required.config_psb.required,['ORDER ID','SERVICE (1P/2P/3P/1P-VOICE)','TIPE ONT','STO','KETERANGAN']);
 const cases=[];
 for(const base of [order,config]){
  assert.equal(parseCommand(base,'TIAL1').valid,true);
  for(const tail of [network,network.replace('Summary ODP','ODP'),network.replace('/4','/04'),network.replace('Port:3','PORT ODP:3'),network+'\nPort:88',network+'\nIP OLT:192.0.2.2\nSlot:4\nPort:5',''])cases.push(base+tail);
  const p=parseCommand(base+network,'TIAL1');assert.equal(p.valid,true);assert.equal(p.fields.odp,'ODP-TEST/04');assert.equal(p.fields.ip_olt,'192.0.2.1');assert.equal(p.fields.slot,'2');assert.equal(p.fields.port,'3');assert.equal(p.fields.valins_id,'VALINS-TEST');
  assert.equal(parseCommand(base+network.replace('Port:3','PORT ODP:3'),'TIAL1').fields.port,null);
  assert.equal(parseCommand(base+network+'\nIP OLT:192.0.2.2\nSlot:4\nPort:5','TIAL1').fields.ip_olt,null);
 }
 const result=spawnSync('python',['-B','-c',"import json,sys;from courier.commands import parse_command;print(json.dumps([parse_command(t,'TIAL1') for t in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8',env:{...process.env,PYTHONPATH:path.resolve('courier_bot'),HDWORK2_RAW_LOG_ENABLED:'false'},windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),cases.map(raw=>parseCommand(raw,'TIAL1')));
});
test('lookup binds IP+region; missing, ambiguous and unknown produce manual check',async()=>{
 let calls=0;const pool={async execute(sql,args){calls++;assert.match(sql,/DISTINCT/);assert.deepEqual(args,['192.0.2.1','SBU']);return [[{vlan_inet:'1035',vlan_voip:'0'}]];}};
 assert.deepEqual(await lookup(pool,'192.0.2.1','BBA'),{status:'found',wilayah:'SBU',vlan_inet:'1035',vlan_voip:'0'});
 assert.equal((await lookup(pool,'192.0.2.1','UNKNOWN')).reason,'UNKNOWN_STO');assert.equal((await lookup(pool,null,'BBA')).reason,'MISSING_IP');assert.equal(calls,1);
 assert.equal((await lookup({execute:async()=>[[]]},'192.0.2.1','BBA')).reason,'NOT_FOUND');
 assert.equal((await lookup({execute:async()=>[[{vlan_inet:'1',vlan_voip:'2'},{vlan_inet:'3',vlan_voip:'4'}]]},'192.0.2.1','BBA')).reason,'AMBIGUOUS');
});
test('format is editable-ready text with fixed tags/message, full original numbers, grouped ports and literal ranges',async()=>{
 const pool={execute:async()=>[[{vlan_inet:'1035',vlan_voip:'500-502 504-516 519 530 532'}]]};
 const detail={data:{command:'order',scIn:'DGPS-AO123'},fields:{'NO INET':'••••0123'},originalMessage:order+network};
 const result=await formatOrder(detail,pool);
 assert.match(result.text,/^#PELURUSAN #PSB\n/);assert.match(result.text,/INET \/ POTS : 000123 \/ 000456/);assert.match(result.text,/SLOT \/ PORT : 2 \/ 3/);assert.match(result.text,/ID VALINS : VALINS-TEST/);assert.match(result.text,/PESAN : 1P INET\nDGPS-AO123/);assert.ok(result.text.endsWith('DATA VLAN VOIP 500-502 504-516 519 530 532'));
 assert.equal(detail.fields['NO INET'],'••••0123');
 const manual=await formatOrder({...detail,originalMessage:order.replace('STO:BBA','STO:UNKNOWN')+network},{execute(){throw Error('Must not query');}});assert.equal(manual.lookup.reason,'UNKNOWN_STO');assert.match(manual.text,/DATA VLAN INET CEK VLAN MANUAL/);
 const missing=await formatOrder(detail,{async execute(){throw Object.assign(Error(),{code:'ER_NO_SUCH_TABLE'});}});assert.equal(missing.lookup.reason,'REFERENCE_UNAVAILABLE');
});
test('VLAN validates as text, retains zero/ranges and rejects invalid input',()=>{
 const r={ip_olt:'192.0.2.1',wilayah:'SBU',vlan_inet:'1035',vlan_voip:'0'};assert.deepEqual(input(r),r);assert.equal(input({...r,vlan_voip:'500-504 507 509'}).vlan_voip,'500-504 507 509');
 for(const patch of [{vlan_voip:''},{vlan_voip:'501-500'},{vlan_voip:"1'); DROP TABLE users"},{wilayah:'SBY'},{ip_olt:'999.0.0.1'},{vlan_inet:100}])assert.throws(()=>input({...r,...patch}));
});
test('Web formatter remains compatible with the existing four-key network helper',async()=>{
 const fs=require('fs'),vm=require('vm'),{createRequire}=require('module');const filename=path.resolve('src/vlan/format.js'),normal=createRequire(filename),module={exports:{}};
 const requireWithLegacyNetwork=name=>name==='../b2c-workflow/order-network'?{parseNetwork(raw){const {valins_id,...original}=normal(name).parseNetwork(raw);return original;}}:normal(name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:requireWithLegacyNetwork,module});
 const detail={data:{command:'config_psb',scIn:'DGPS-AO123'},originalMessage:config+network,fields:{}};
 const result=await module.exports.formatOrder(detail,{execute:async()=>[[{vlan_inet:'1',vlan_voip:'0'}]]});assert.match(result.text,/ID VALINS : VALINS-TEST/);assert.match(result.text,/SLOT \/ PORT : 2 \/ 3/);
});
test('grant review accepts additive reference grants only for correct Web roles',()=>{
 const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
 for(const role of ['read','chatRead','write','chatWriteFifo','courierSendChatFifo']){
  const grants=Object.entries(policies[role]).flatMap(([table,ps])=>ps.map(p=>({grant:`GRANT ${p} ON hdwork2.${table} TO fixture`})));
  assert.equal(reviewOperationalGrants(grants,role).ok,true);
  const permission=role.toLowerCase().includes('write')?'SELECT, INSERT, UPDATE, DELETE':'SELECT';
  assert.equal(reviewOperationalGrants([...grants,{grant:`GRANT ${permission} ON hdwork2.hd2_vlan_reference TO fixture`}],role).ok,!role.toLowerCase().includes('courier'));
  if(role==='read')assert.equal(reviewOperationalGrants([...grants,{grant:'GRANT DELETE ON hdwork2.hd2_vlan_reference TO fixture'}],role).ok,false);
 }
});
