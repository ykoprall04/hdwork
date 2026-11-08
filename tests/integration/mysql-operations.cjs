// Opt-in only; creates schemas exclusively through the existing disposable guard.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{PassThrough}=require('node:stream');
async function run({env=process.env,argv=process.argv.slice(2),driverFactory=()=>require('mysql2/promise')}={}){
 if(argv.length!==1||argv[0]!=='--run-operations-disposable')throw Error('Operations rehearsal disabled');
 const guard=require('../../ops/mysql/disposable-guard'),options=guard.config(env,['--run-disposable']);const pool=driverFactory().createPool(options);const oldFlag=process.env.HDWORK2_OPERATIONS_ENABLED;
 try{
 const c=await pool.getConnection();try{await guard.verifyTarget(c,options.database);for(const sql of guard.migrationStatements())await c.query(sql);
 for(const file of ['007_hdwork2_auth.sql','008_hdwork2_operations.sql']){const statements=fs.readFileSync(path.resolve(__dirname,'../../database/manual',file),'utf8').replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);assert.equal(statements.shift(),'USE hdwork2');for(const sql of statements){assert.match(sql,/^(CREATE TABLE (users|hd2_[a-z_]+)|ALTER TABLE (users|hd2_orders|hd2_audit)|INSERT INTO hd2_auth_guard)/);await c.query(sql);}}}finally{c.release();}
 process.env.HDWORK2_OPERATIONS_ENABLED='true';
 const {createService}=require('../../src/access/service'),{createStore}=require('../../src/access/store'),{MysqlStore}=require('../../src/courier/mysql-store');
 const {createB2CProcessor}=require('../../src/b2c-workflow/workflow'),{act}=require('../../src/operations/mutate'),{reader}=require('../../src/operations/read'),{createExporter}=require('../../src/operations/export');
 const auth=createService(createStore(pool),'synthetic-operation-test-secret-000000');const password='synthetic-password-123';await auth.bootstrap({name:'Admin',username:'admin',password});
 const allModules=['TIAL','REQ','LOGIC_PSB','LOGIC_MO'];const people=[];
 for(const [i,role] of ['HD','HD','HD','ADMIN','SHOW_ONLY'].entries()){const id=await auth.manage(1,null,{name:'HD '+i,username:'person'+i,password,role,is_active:true,modules:allModules});const login=await auth.login('person'+i,password);people.push({id,token:login.token,user:await auth.me(login.token)});}
 const adminLogin=await auth.login('admin',password);const admin={id:1,token:adminLogin.token,user:await auth.me(adminLogin.token)};
 let update=100;const store=new MysqlStore({pool,botId:'new-bot'});const workflow=createB2CProcessor({store,config:{enabled:true,botId:'new-bot',identityKey:'synthetic-operation-identity-key-00000',dedupeBy:'both',groups:['-10011','-10012'].map((chatId,i)=>({module:'TIAL',chatId,threadId:null,threadMode:'non_topic',commandProfile:i?'TIAL2':'TIAL1'})),actors:[{id:'9',name:'Telegram Synthetic'}]}});
 const raw=code=>`/order\nSC/IN:PREFIX-AOi${code}\nNO INET:000123\nSN ONT:TEST\nSTO:ABC\nNIK:SYNTHETIC\nKETERANGAN:=SUM(1,2)`;
 async function submit(text,day=0,chat='-10011'){const message=String(++update);await store.accept({version:1,bot_id:'new-bot',update_id:message,event:{kind:'message',chat_id:chat,message_id:message,telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1762315200+86400*day,text,attachments:[]}});await workflow.processNext();const [[row]]=await pool.execute('SELECT id FROM hd2_orders WHERE message_id=?',[message]);return row.id;}
 const read=reader(pool);async function detail(id,p=people[0]){return (await read.detail(id,p.user)).data;}
 async function action(id,who,action,note,extra={}){const o=await detail(id,who);return act(pool,who.token,who.id,id,{requestId:randomUUID(),version:o.version,action,...(note!==undefined?{note}:{}),...extra});}
 const first=await submit(raw('1'));const initial=await detail(first);
 const pickBody={requestId:randomUUID(),version:initial.version,action:'PICK'};
 const otherPickBody={...pickBody,requestId:randomUUID()};
 const race=await Promise.allSettled([act(pool,people[0].token,people[0].id,first,pickBody),act(pool,people[1].token,people[1].id,first,otherPickBody)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const picked=await detail(first);const owner=people.find(p=>String(p.id)===String(picked.ownerId));
 const [[beforeReplay]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox');await act(pool,owner.token,owner.id,first,owner.id===people[0].id?pickBody:otherPickBody);const [[afterReplay]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox');assert.equal(Number(afterReplay.n),Number(beforeReplay.n));
 let version=(await detail(first)).version;const challengers=people.slice(0,3).filter(p=>p.id!==owner.id);
 const take=await Promise.allSettled(challengers.map(p=>act(pool,p.token,p.id,first,{requestId:randomUUID(),version,action:'TAKEOVER'})));assert.equal(take.filter(r=>r.status==='fulfilled').length,1);
 const latest=await detail(first);const newest=people.find(p=>String(p.id)===String(latest.ownerId));await assert.rejects(action(first,owner,'DONE'),{statusCode:409});
 await assert.rejects(action(first,newest,'FAILED','   '),{statusCode:400});await action(first,newest,'DONE','checked');
 const [[doneOut]]=await pool.execute('SELECT payload FROM hd2_courier_outbox ORDER BY created_at DESC,id DESC LIMIT 1');
 const [doneMessages]=await pool.execute('SELECT payload FROM hd2_courier_outbox');assert.ok(doneMessages.some(m=>JSON.parse(typeof m.payload==='string'?m.payload:JSON.stringify(m.payload)).text===`✅ Done (ACTCOMP)\nchecked\nJgn lupa VALINS after PS. Salam, ${newest.user.name}!`));
 const beforeReopen=doneMessages.length;await action(first,owner,'REOPEN',undefined,{confirm:true});const [[n]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox');assert.equal(Number(n.n),beforeReopen);
 await action(first,owner,'FAILED','Reason');
 const dup=await submit(raw('1'),2,'-10012');assert.equal((await detail(dup)).duplicateOf,first);await action(dup,people[0],'CONTINUE_DUPLICATE');await action(dup,people[0],'REJECT_DUPLICATE');await action(dup,people[1],'REOPEN',undefined,{confirm:true});await action(dup,people[2],'REJECT_DUPLICATE');assert.equal((await detail(first)).status,'FAILED');
 for(const command of ['/config_psb\nOrder ID:NEW-AOi2\nSTO:ABC','/MO\nSC/IN:NEW-MOk3\nSTO:ABC','/req free request']){const id=await submit(command,1);await action(id,people[0],'PICK');await action(id,people[0],'DONE');}
 const [reqRows]=await pool.query("SELECT id FROM hd2_orders WHERE command='req'");const reqView=await read.detail(reqRows[0].id,admin.user);assert.equal(reqView.requestText,' free request');
 const fieldView=await read.detail(first,admin.user);assert.equal(fieldView.fields.NIK,'Disamarkan');assert.ok(!JSON.stringify(fieldView).includes('SYNTHETIC'));
 const duplicateUnpicked=await submit(raw('1'),3);await action(duplicateUnpicked,people[0],'REJECT_DUPLICATE');
 const pending=await submit(raw('2'),0);await action(pending,people[0],'PICK');
 const summary=await read.recap({area:'ALL'},admin.user);assert.deepEqual(summary.data,{total:7,waiting:0,process:1,done:3,failed:3});
 const personal=await read.recap({area:'ALL',hd:String(people[2].id)},admin.user);assert.equal(personal.data.total,7);assert.equal(personal.data.waiting,0);assert.equal(personal.data.failed,2);
 const dated=(await detail(first)).receivedAt;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(dated));const day=['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
 assert.equal((await read.recap({from:day,to:day},admin.user)).data.total,2);
 await action(first,people[0],'REOPEN',undefined,{confirm:true});assert.equal((await read.recap({},admin.user)).data.failed,2);
 for(const person of [admin,people[3],people[4]])await assert.rejects(action(pending,person,'TAKEOVER'),{statusCode:403});
 const forbidden={...people[0].user,modules:['REQ']};await assert.rejects(read.detail(first,forbidden),{statusCode:404});
 await auth.manage(1,people[0].id,{name:people[0].user.name,role:'HD',modules:['REQ'],is_active:true});await assert.rejects(action(pending,people[0],'DONE'));
 const oldOwnerState=await detail(pending,people[1]);assert.equal(String(oldOwnerState.ownerId),String(people[0].id));await action(pending,people[1],'TAKEOVER');await action(pending,people[1],'DONE');
 await auth.manage(1,people[0].id,{name:'Inactive HD',role:'HD',modules:['REQ'],is_active:false});
 assert.equal(String((await detail(first,people[1])).ownerId),String(people[0].id));
 await assert.rejects(action(first,people[0],'DONE'),{statusCode:403});await action(first,people[1],'TAKEOVER');
 const rollbackTarget=await submit(raw('rollback'));const rollbackBody={requestId:randomUUID(),version:0,action:'PICK'};
 const faultPool={async getConnection(){const c=await pool.getConnection();return new Proxy(c,{get(t,k){if(k==='execute')return async(sql,p)=>{if(sql.startsWith('INSERT INTO hd2_courier_outbox'))throw Error('Synthetic outbox fault');return t.execute(sql,p);};const v=t[k];return typeof v==='function'?v.bind(t):v;}});}};
 await assert.rejects(act(faultPool,people[1].token,people[1].id,rollbackTarget,rollbackBody));assert.equal((await detail(rollbackTarget,people[1])).status,'WAITING');assert.equal((await detail(rollbackTarget,people[1])).version,0);
 await act(pool,people[1].token,people[1].id,rollbackTarget,rollbackBody);await action(rollbackTarget,people[1],'DONE');
 const courier=new MysqlStore({pool,botId:'new-bot'});for(let batch=0;batch<10;batch++){const deliveries=await courier.claim(10);if(!deliveries.length)break;for(const d of deliveries)await courier.settle(d.delivery_id,{lease_token:d.lease_token,result:'failed',error_code:'FORBIDDEN'});}
 assert.equal((await detail(rollbackTarget,people[1])).status,'DONE');
 // Export all matching finished data, rollover, cells, slots, cancel, resource cleanup.
 const exporter=createExporter({pool,authenticate:t=>auth.me(t),maxRows:3});
 await assert.rejects(async()=>exporter.ticket({},people[4].user,people[4].token),{statusCode:403});
 const ticket=exporter.ticket({area:'ALL'},admin.user,admin.token);const ticket2=exporter.ticket({area:'ALL'},admin.user,admin.token);assert.throws(()=>exporter.ticket({},admin.user,admin.token),{statusCode:429});exporter.cancel(ticket2.id,admin.user,admin.token);assert.equal(exporter.slots.count,1);
 const output=new PassThrough(),chunks=[];output.set=()=>{};output.on('data',chunk=>chunks.push(chunk));await exporter.download(ticket.id,admin.user,admin.token,output);assert.equal(exporter.slots.count,0);
 const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.load(Buffer.concat(chunks));assert.ok(book.getWorksheet('TIAL'));assert.ok(book.getWorksheet('LOGIC PSB'));assert.ok(book.getWorksheet('LOGIC MO'));assert.ok(book.getWorksheet('REQ'));assert.ok(book.getWorksheet('TIAL 2'));
 let dangerous=false;book.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>{if(String(cell.value).includes('=SUM(')){assert.ok(String(cell.value).startsWith("'"));dangerous=true;}assert.notEqual(cell.type,Excel.ValueType.Formula);})));assert.equal(dangerous,true);
 const filteredTicket=exporter.ticket({area:'TIAL',status:'DUPLICATE',hd:String(people[2].id)},admin.user,admin.token);const filteredStream=new PassThrough(),filteredChunks=[];filteredStream.set=()=>{};filteredStream.on('data',d=>filteredChunks.push(d));await exporter.download(filteredTicket.id,admin.user,admin.token,filteredStream);const filteredBook=new Excel.Workbook();await filteredBook.xlsx.load(Buffer.concat(filteredChunks));assert.equal(filteredBook.getWorksheet('TIAL').rowCount,2);assert.equal(filteredBook.getWorksheet('TIAL').getRow(2).getCell(2).value,dup);assert.equal(filteredBook.getWorksheet('LOGIC PSB'),undefined);
 // More than one DB batch and one visible web page; no row truncation on export.
 const benchTimestamp=1762315200+4*86400,benchDay=new Date((benchTimestamp+7*3600)*1000).toISOString().slice(0,10);
 for(let start=0;start<550;start+=100){const values=[];const tuples=[];for(let i=start;i<Math.min(start+100,550);i++){tuples.push('(?,?,?,?,?,?,?,?,?,?,?,?,?)');values.push(randomUUID(),'benchmark','TIAL',benchDay,'-10011',String(5000+i),'BENCH-AOi'+i,'DONE','order',JSON.stringify({KETERANGAN:'=SUM(1,2)'}),benchTimestamp,people[1].id,people[1].id);}await pool.query('INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,sc_in,status,command,command_fields,telegram_timestamp,owner_user_id,final_user_id) VALUES '+tuples.join(','),values);}
 const bench=createExporter({pool,authenticate:t=>auth.me(t),maxRows:200});const bt=bench.ticket({area:'TIAL',from:benchDay,to:benchDay},admin.user,admin.token),bs=new PassThrough(),bc=[];bs.set=()=>{};bs.on('data',d=>bc.push(d));const started=performance.now();await bench.download(bt.id,admin.user,admin.token,bs);const exportMs=Math.round(performance.now()-started);const largeBook=new Excel.Workbook();await largeBook.xlsx.load(Buffer.concat(bc));let exported=0;largeBook.eachSheet(sheet=>{exported+=sheet.rowCount-1;});assert.equal(exported,550);assert.equal(bench.slots.count,0);
 await pool.query('ANALYZE TABLE hd2_orders');
 const [plans]=await pool.query("EXPLAIN SELECT COUNT(*),SUM(status='DONE'),SUM(status='IN_PROGRESS' AND owner_user_id=1),SUM(status='FAILED' AND final_user_id=1 OR status='DUPLICATE' AND duplicate_decision='REJECT_DUPLICATE') FROM hd2_orders WHERE access_module='TIAL' AND business_day BETWEEN '2020-01-01' AND '2030-01-01' AND command IN ('order','req','config_psb','mo') AND telegram_timestamp IS NOT NULL");
 const plan=plans.map(p=>({access:p.type,key:p.key,extra:p.Extra,estimatedRows:p.rows}));
 const cancel=exporter.ticket({},admin.user,admin.token);exporter.cancel(cancel.id,admin.user,admin.token);assert.equal(exporter.slots.count,0);
 let runningTicket;let cancelling;
 cancelling=createExporter({pool,authenticate:async t=>{cancelling.cancel(runningTicket.id,admin.user,admin.token);return auth.me(t);}});
 runningTicket=cancelling.ticket({},admin.user,admin.token);const cancelledStream=new PassThrough();cancelledStream.set=()=>{};await assert.rejects(cancelling.download(runningTicket.id,admin.user,admin.token,cancelledStream));assert.equal(cancelling.slots.count,0);
 const ioCancel=exporter.ticket({},admin.user,admin.token),ioStream=new PassThrough();ioStream.set=()=>{};ioStream.once('data',()=>exporter.cancel(ioCancel.id,admin.user,admin.token));await assert.rejects(exporter.download(ioCancel.id,admin.user,admin.token,ioStream));assert.equal(exporter.slots.count,0);
 const leftovers=require('node:fs').readdirSync(require('node:os').tmpdir()).filter(n=>n.startsWith('hdwork-export-'));assert.equal(leftovers.length,0);
 const timeline=await read.detail(first,admin.user);assert.ok(timeline.history.some(e=>e.action==='TAKEOVER'));assert.ok(timeline.history.some(e=>e.note==='Reason'));
 return {ok:true,exportRows:550,exportMs,plan,checks:['ddl008','concurrent-pick','concurrent-takeover','old-owner-denied','done-contracts','required-failure','reopen-no-outbox','duplicate-decisions','recap-date-hd-latest','rbac-module-revocation','ownership-retained','stream-xlsx-rollover-formula','two-slots-cancel','timeline']};
 }finally{if(oldFlag===undefined)delete process.env.HDWORK2_OPERATIONS_ENABLED;else process.env.HDWORK2_OPERATIONS_ENABLED=oldFlag;await pool.end();}
}
if(require.main===module){if(process.argv.length===2)console.log('Operations disposable rehearsal disabled.');else run().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Operations disposable rehearsal failed/rejected.');process.exitCode=1;});}
module.exports={run};
