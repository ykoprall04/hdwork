// One-shot ADMIN maintenance, not an application runtime. Requires explicit consent.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),id='7790b19e-f9d4-4c79-ae43-2ad10cdbf405';
const fail=code=>Object.assign(Error('Testing status action blocked'),{code});
async function run(){
 if(process.argv.slice(2).join(' ')!=='--apply --confirmed')throw fail('SPECIFIC_UPDATE_APPROVAL_REQUIRED');
 const active=JSON.parse(fs.readFileSync(path.join(root,'.local/live-order-browser.active.json'),'utf8'));if(!path.resolve(active.folder).startsWith(path.join(root,'.local/live-browser-')))throw fail('BROWSER_PROOF_REJECTED');
 const browser=JSON.parse(fs.readFileSync(path.join(active.folder,'browser-verification.json'),'utf8')),window=JSON.parse(fs.readFileSync(path.join(active.folder,'report.json'),'utf8'));
 if(browser.status!=='PASS'||browser.role!=='SUPER_ADMIN'||browser.orderId!==id||Date.now()>=Date.parse(window.expiresAt)||window.status==='CLOSED')throw fail('ACTIVE_SUPER_ADMIN_BROWSER_REQUIRED');
 const input=await require('./provision-testing-accounts').adminInput();let c,committed=false;
 try{
  c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:input.adminUser,password:input.adminPassword,database:'hdwork2',multipleStatements:false,connectTimeout:5000});input.adminPassword='';
  const q=(sql,p)=>c.query({sql,timeout:5000},p);const [[target]]=await q('SELECT DATABASE() AS db');if(target.db!=='hdwork2')throw fail('DATABASE_TARGET_REJECTED');
  await c.beginTransaction();
  const [[actor]]=await q('SELECT id,name,role,is_active FROM users WHERE id=? FOR SHARE',[browser.actorUserId]);if(actor?.role!=='SUPER_ADMIN'||![1,true].includes(actor.is_active))throw fail('ACTOR_REJECTED');
  const [[order]]=await q('SELECT id,status,version,bot_id,chat_id,message_id,thread_id,sc_in,duplicate_of,owner_user_id FROM hd2_orders WHERE id=? FOR UPDATE',[id]);
  if(!order||order.bot_id!=='hdworkopsbot-testing'||order.chat_id!=='-5436357946'||order.message_id!=='6'||order.thread_id!==null||order.sc_in!=='LIVE-AO20261108142737'||order.duplicate_of)throw fail('ORDER_TARGET_REJECTED');
  const [[audit]]=await q("SELECT COUNT(*) AS total FROM hd2_audit WHERE order_id=? AND action='LIVE_TEST_DONE'",[id]);
  let changed=false;
  if(order.status==='DONE'&&Number(audit.total)===1){}else{
   if(order.status!=='WAITING'||Number(order.version)!==0||order.owner_user_id!==null||Number(audit.total)!==0)throw fail('ORDER_STATE_REJECTED');
   const [updated]=await q("UPDATE hd2_orders SET status='DONE',final_user_id=?,finished_at=UTC_TIMESTAMP(3),completion_note=?,version=version+1 WHERE id=? AND bot_id='hdworkopsbot-testing' AND chat_id='-5436357946' AND message_id='6' AND thread_id IS NULL AND sc_in='LIVE-AO20261108142737' AND status='WAITING' AND version=0 AND duplicate_of IS NULL AND owner_user_id IS NULL AND final_user_id IS NULL",[actor.id,'Live testing DONE melalui tindakan administratif satu order yang disetujui.',id]);if(updated.affectedRows!==1)throw fail('UPDATE_NOT_EXACTLY_ONE');
   await q("INSERT INTO hd2_audit(id,inbox_id,order_id,action,user_id,from_status,to_status,detail) VALUES (?,NULL,?,'LIVE_TEST_DONE',?,'WAITING','DONE',?)",[randomUUID(),id,actor.id,JSON.stringify({actorName:actor.name,note:'Persetujuan khusus finalisasi administratif order dummy testing; tidak mengubah role/grants dan tidak mengirim Telegram.',chatId:'-5436357946',messageId:'6'})]);
   await q("INSERT INTO hd2_live_events(module,kind) VALUES ('TIAL','change')");changed=true;
  }
  await c.commit();committed=true;
  const report={status:'PASS',orderId:id,orderStatus:'DONE',changed,actorUserId:actor.id,actorRole:actor.role,administrativeSingleOrderOverride:true,telegramSent:false,usersRolesGrantsChanged:false,verifiedAt:new Date().toISOString()};
  const folder=fs.mkdtempSync(path.join(root,'.local/testing-done-'));fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
 }finally{input.adminPassword='';if(c){if(!committed)await c.rollback();await c.end();}}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TESTING_DONE_FAILED',telegramSent:false}));process.exitCode=1;});
