const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {start}=require('./helpers/temporary-courier-mysql.cjs');
const {workbookRows,importRows}=require('../src/vlan/import');
const {lookup}=require('../src/vlan/reference');
const {createService}=require('../src/vlan/service');
test('owned TCP-disabled MySQL: VLAN import, lookup, CRUD, real order detail and HTTP authorization',async t=>{
 fs.mkdirSync('.local',{recursive:true});const f=await start(path.resolve('.local'));let server,checks=0;
 try{
  await f.c.query('CREATE DATABASE hdwork2');await f.c.query('USE hdwork2');
  for(const sql of require('../ops/mysql/disposable-guard').migrationStatements())await f.c.query(sql);
  for(const sql of require('./helpers/e2e-contracts.cjs').schemaStatements(['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql','011_hdwork2_registration_rejection.sql','012_hdwork2_system_monitoring.sql','013_hdwork2_live_chat.sql','014_hdwork2_shared_groups.review.sql']))await f.c.query(sql);
  for(const name of ['015_hdwork2_fifo_ack.review.sql','016_fifo_release.PLAN_ONLY.sql','017_administrative_closure.PLAN_ONLY.sql'])for(const sql of fs.readFileSync(path.join('database/manual',name),'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await f.c.query(sql);
  const migration=fs.readFileSync('database/manual/020_hdwork2_vlan_reference.sql','utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
  // Execute schema on the verified owned fixture only. Test grants are separate below.
  for(const sql of migration.filter(s=>!/^USE |^GRANT /i.test(s)))await f.c.query(sql);
  let file=process.env.HDWORK_VLAN_XLSX;
  if(!file){const Excel=require('exceljs'),book=new Excel.Workbook(),s=book.addWorksheet('VLAN');s.addRow(['no','ip','vlan inet','vlan voip','wilayah']);s.addRow([1,'172.27.104.245',3954,'507-513','SBU']);s.addRow([2,'172.27.104.245',3952,'500-502 504-516 519 530 532','MDR']);s.addRow([3,'172.27.142.139',1035,'0','MDR']);file=path.join(f.root,'synthetic.xlsx');await book.xlsx.writeFile(file);}
  const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),beforeHash=hash();
  const rows=await workbookRows(file);await importRows(f.pool,rows);await importRows(f.pool,rows);
  const [[count]]=await f.pool.query('SELECT COUNT(*) n FROM hd2_vlan_reference');assert.equal(count.n,rows.length);assert.equal(hash(),beforeHash);
  const [storedRows]=await f.pool.query('SELECT ip_olt,wilayah,vlan_inet,vlan_voip FROM hd2_vlan_reference');
  const sorted=items=>items.map(r=>JSON.stringify([r.ip_olt,r.wilayah,r.vlan_inet,r.vlan_voip])).sort();assert.deepEqual(sorted(storedRows),sorted(rows));
  if(process.env.HDWORK_VLAN_XLSX){assert.equal(rows.length,426);assert.deepEqual(rows.reduce((a,r)=>(a[r.wilayah]=(a[r.wilayah]||0)+1,a),{}),{SBU:249,SBS:83,MDR:94});}
  assert.equal((await lookup(f.pool,'172.27.104.245','BBA')).vlan_inet,'3954');
  assert.equal((await lookup(f.pool,'172.27.104.245','ABT')).vlan_voip,'500-502 504-516 519 530 532');
  assert.equal((await lookup(f.pool,'172.27.142.139','ABT')).vlan_voip,'0');
  await t.test('import is atomic on failure',async()=>{
   await f.c.query("CREATE TRIGGER fixture_vlan_reject BEFORE INSERT ON hd2_vlan_reference FOR EACH ROW BEGIN IF NEW.ip_olt='192.0.2.2' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offline failure'; END IF; END");
   try{await assert.rejects(importRows(f.pool,[{ip_olt:'192.0.2.1',wilayah:'SBU',vlan_inet:'1',vlan_voip:'2'},{ip_olt:'192.0.2.2',wilayah:'SBU',vlan_inet:'3',vlan_voip:'4'}]));}finally{await f.c.query('DROP TRIGGER fixture_vlan_reject');}
   assert.equal((await lookup(f.pool,'192.0.2.1','BBA')).reason,'NOT_FOUND');
   assert.equal((await lookup(f.pool,'192.0.2.2','BBA')).reason,'NOT_FOUND');
   checks++;
  });
  const actors=[{id:1,role:'ADMIN'},{id:2,role:'SUPER_ADMIN'},{id:3,role:'HD'},{id:4,role:'USER'},{id:5,role:'SHOW_ONLY'}];
  const token=a=>'offline-token-'+a.id;
  for(const a of actors){await f.c.execute('INSERT INTO users(id,name,username,password_hash,role,is_active) VALUES (?,?,?,?,?,TRUE)',[a.id,'Fixture','fixture'+a.id,'synthetic',a.role]);await f.c.execute('INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES (?,?,TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP(3)))',[require('../src/access/service').digest(token(a)),a.id]);}
  const service=createService({readPool:f.pool,writePool:f.pool}),entry={ip_olt:'192.0.2.1',wilayah:'SBU',vlan_inet:'2443',vlan_voip:'200-231'};
  await t.test('role checks, duplicates, ambiguity, stale roles and revoked sessions',async()=>{
   for(const a of actors.slice(2)){await assert.rejects(service.list({},a),{statusCode:403});await assert.rejects(service.mutate('add',null,entry,a,token(a)),{statusCode:403});}
   const added=await service.mutate('add',null,entry,actors[0],token(actors[0]));
   await assert.rejects(service.mutate('add',null,entry,actors[0],token(actors[0])),{statusCode:409});
   const other=await service.mutate('add',null,{...entry,vlan_voip:'0'},actors[1],token(actors[1]));assert.equal((await lookup(f.pool,entry.ip_olt,'BBA')).reason,'AMBIGUOUS');
   await service.mutate('delete',other.id,null,actors[1],token(actors[1]));assert.equal((await lookup(f.pool,entry.ip_olt,'BBA')).status,'found');
   await service.mutate('update',added.id,{...entry,vlan_voip:'500-504 507 509'},actors[0],token(actors[0]));assert.equal((await lookup(f.pool,entry.ip_olt,'BBA')).vlan_voip,'500-504 507 509');
   assert.equal((await service.list({q:'192.0.2.1'},actors[0])).data.length,1);
   await f.c.query("UPDATE users SET role='HD' WHERE id=1");await assert.rejects(service.mutate('delete',added.id,null,actors[0],token(actors[0])),{statusCode:403});await f.c.query("UPDATE users SET role='ADMIN' WHERE id=1");
   await f.c.query('UPDATE hd2_sessions SET revoked=TRUE WHERE user_id=1');await assert.rejects(service.mutate('delete',added.id,null,actors[0],token(actors[0])),{statusCode:401});await f.c.query('UPDATE hd2_sessions SET revoked=FALSE WHERE user_id=1');
   checks++;
  });
  const {MysqlStore}=require('../src/courier/mysql-store'),{createB2CProcessor}=require('../src/b2c-workflow/workflow');
  const store=new MysqlStore({pool:f.pool,botId:'vlan-fixture',env:{}});
  const raw='/config_psb\nORDER ID:DGPS-AO123\nSN ONT BARU:SNFIXTURE\nSERVICE (1P/2P/3P/1P-Voice):1P\nTIPE ONT:TEST\nSTO:BBA\nKETERANGAN:fixture\nNO INTERNET:000123\nODP:ODP-TEST/4\nIP OLT:192.0.2.1\nSlot:2\nPort:3\nValins ID:VALINS1';
  await store.accept({version:1,bot_id:'vlan-fixture',update_id:'1',event:{kind:'message',chat_id:'-1001',message_id:'101',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:Math.floor(Date.now()/1000),text:raw,attachments:[]}});
  await createB2CProcessor({store,config:{enabled:true,botId:'vlan-fixture',botUsername:'SyntheticOpsBot',webOnly:true,identityKey:'synthetic-identity-key-000000000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-1001',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1',allowedCommands:['config_psb']}],actors:[]}}).processNext();
  const [[order]]=await f.pool.query('SELECT id,command_fields,raw_text FROM hd2_orders');assert.equal(order.raw_text,raw);const fields=typeof order.command_fields==='string'?JSON.parse(order.command_fields):order.command_fields;assert.equal(fields.ip_olt,'192.0.2.1');assert.equal(fields.valins_id,'VALINS1');
  const reader=require('../src/operations/read').reader(f.pool),detail=await reader.detail(order.id,{...actors[2],modules:['LOGIC_PSB']});assert.equal(detail.fields.ip_olt,'192.0.2.1');assert.equal(detail.originalMessage,raw);
  await assert.rejects(reader.detail(order.id,{...actors[2],modules:['TIAL']}),{statusCode:404});
  const express=require('express'),app=express();app.use(express.json());
  app.use((req,res,next)=>{const a=actors.find(x=>String(x.id)===req.headers['x-fixture-user']);if(!a)return res.sendStatus(401);req.user={...a,modules:['LOGIC_PSB']};req.sessionToken=token(a);next();});
  const {createRoutes,formatHandler}=require('../src/vlan/routes');
  app.use('/vlan',createRoutes({readPool:()=>f.pool,writePool:()=>f.pool,http:{csrf(req){if(req.headers['x-csrf-token']!=='fixture')throw Object.assign(Error(),{statusCode:403});}}}));
  app.get('/orders/:id/vlan-format',async(req,res)=>{try{await formatHandler({readOrder:(id,u)=>reader.detail(id,u),readPool:()=>f.pool})(req,res);}catch(e){res.status(e.statusCode||503).json({error:true});}});
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
  const call=(url,role=1,body,csrf=true)=>fetch(base+url,{method:body?'POST':'GET',headers:{'x-fixture-user':String(role),'content-type':'application/json',...(csrf?{'x-csrf-token':'fixture'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  await t.test('HTTP CRUD denies ordinary users/CSRF; order format is authorized and read-only',async()=>{
   for(const role of [3,4,5]){assert.equal((await call('/vlan',role)).status,403);assert.equal((await call('/vlan',role,entry)).status,403);assert.equal((await call('/vlan/1/delete',role,{})).status,403);}
   assert.equal((await call('/vlan',1,entry,false)).status,403);assert.equal((await call('/vlan',2)).status,200);
   const created=await call('/vlan',1,{...entry,ip_olt:'192.0.2.99'});assert.equal(created.status,201);const {id}=await created.json();
   assert.equal((await call('/vlan/'+id+'/update',2,{...entry,ip_olt:'192.0.2.99',vlan_voip:'0'})).status,200);assert.equal((await call('/vlan/'+id+'/delete',1,{})).status,200);
   const counts=async()=>JSON.stringify((await f.pool.query('SELECT (SELECT COUNT(*) FROM hd2_orders) orders,(SELECT COUNT(*) FROM hd2_courier_outbox) outbox,(SELECT COUNT(*) FROM hd2_audit) audits'))[0]);const before=await counts();
   const response=await call('/orders/'+order.id+'/vlan-format',3);assert.equal(response.status,200);const format=await response.json();assert.match(format.text,/DATA VLAN VOIP 500-504 507 509/);assert.match(format.text,/INET \/ POTS : 000123/);assert.equal(await counts(),before);
   checks++;
  });
  await t.test('migration grants work with the existing least-privilege Web profiles',async()=>{
   const mysql=require('mysql2/promise'),password=crypto.randomUUID();
   for(const [user,role] of [['hdwork_ops_read','chatRead'],['hdwork_ops_write','chatWriteFifo']]){
    await f.c.query('CREATE USER ?@\'localhost\' IDENTIFIED BY ?',[user,password]);
    for(const [table,ps] of Object.entries(require('../src/config/operational-grants').policies[role]))await f.c.query('GRANT '+ps.join(', ')+' ON hdwork2.`'+table+'` TO ?@\'localhost\'',[user]);
   }
   for(const sql of migration.filter(s=>/^GRANT /i.test(s)))await f.c.query(sql);
   const pools=['hdwork_ops_read','hdwork_ops_write'].map(user=>mysql.createPool({socketPath:f.socketPath,user,password,database:'hdwork2',connectionLimit:1,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}}));
   try{for(let i=0;i<2;i++){const [grants]=await pools[i].query('SHOW GRANTS FOR CURRENT_USER');assert.equal(require('../src/config/operational-grants').reviewOperationalGrants(grants,i?'chatWriteFifo':'chatRead').ok,true);}
    const limited=createService({readPool:pools[0],writePool:pools[1]});assert.equal((await limited.list({q:'192.0.2.1'},actors[0])).data.length,1);const a=await limited.mutate('add',null,{...entry,ip_olt:'192.0.2.88'},actors[0],token(actors[0]));await limited.mutate('delete',a.id,null,actors[0],token(actors[0]));
    await assert.rejects(pools[0].execute('DELETE FROM hd2_vlan_reference WHERE id=0'),{code:'ER_TABLEACCESS_DENIED_ERROR'});
    checks++;
   }finally{await Promise.all(pools.map(p=>p.end()));}
  });
  assert.equal(checks,4);console.log(JSON.stringify({status:'VLAN_ISOLATED_MYSQL_PASS',importedRows:rows.length,workbookUnchanged:hash()===beforeHash,productionAccessed:false,telegramCalls:0}));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.stop();}
});
