'use strict';
// Real MySQL workflow verification. A single outer transaction is always rolled
// back: no status, audit, idempotency key or Telegram message is committed.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const origin='https://hdwork2.yoloo.space';
async function run(){
 let raw='';for await(const b of process.stdin)raw+=b;const input=JSON.parse(raw);raw='';
 let pool,c,cookie,csrf,report;const results={};
 const headers=()=>({origin,cookie,'content-type':'application/json','x-csrf-token':csrf});
 const call=(p,opts={})=>fetch(origin+p,{...opts,headers:{...headers(),...opts.headers},signal:AbortSignal.timeout(15000)});
 try{
  if(input.username!=='trial_yanto')throw Error('TRIAL_REQUIRED');
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:input.username,password:input.password}),signal:AbortSignal.timeout(15000)});
  input.password='';const body=await login.json();if(login.status!==200||body.data.user.role!=='HD')throw Error('PUBLIC_LOGIN_FAILED');
  cookie=login.headers.get('set-cookie').split(';')[0];csrf=body.data.csrf;results.publicLogin=true;
  const token=cookie.slice(cookie.indexOf('=')+1);
  for(const p of ['/api/auth/me','/api/operations/overview','/api/operations/orders?area=TIAL&tab=incoming']){const r=await call(p);if(r.status!==200)throw Error('PUBLIC_READ_FAILED');}results.dashboardAndOrders=true;
  pool=require('mysql2/promise').createPool({host:'127.0.0.1',port:3306,user:'hdwork_ops_write',password:input.writePassword,database:'hdwork2',connectionLimit:1,connectTimeout:5000,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});input.writePassword='';
  const [[target]]=await pool.query("SELECT * FROM hd2_orders WHERE bot_id='hdworkopsbot-testing' AND chat_id='-5436357946' AND sc_in='TRIAL-AO20261109YANTO1'");
  if(!target||!['WAITING','DONE','FAILED'].includes(target.status)||target.duplicate_of!==null)throw Error('TEST_ORDER_STATE_REQUIRES_REVIEW');
  const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');const before=digest(target);
  const noCsrf=await call('/api/operations/orders/'+target.id+'/actions',{method:'POST',headers:{'x-csrf-token':''},body:JSON.stringify({requestId:randomUUID(),version:0,action:'PICK'})});if(noCsrf.status!==403)throw Error('CSRF_CHECK_FAILED');results.csrfEnforced=true;
  const stale=await call('/api/operations/orders/'+target.id+'/actions',{method:'POST',body:JSON.stringify({requestId:randomUUID(),version:999999,action:'PICK'})});if(stale.status!==409)throw Error('VERSION_CHECK_FAILED');results.publicVersionConflict=true;
  const [engines]=await pool.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('hd2_orders','hd2_audit','hd2_web_requests','hd2_live_events','hd2_courier_outbox')");if(engines.length!==5||engines.some(x=>x.ENGINE!=='InnoDB'))throw Error('TRANSACTIONAL_TABLES_REQUIRED');
  c=await pool.getConnection();await c.beginTransaction();
  const wrapper={execute:(...args)=>c.execute(...args),query:(...args)=>c.query(...args),async beginTransaction(){},async commit(){},async rollback(){await c.rollback();},release(){}};
  const transactionPool={async getConnection(){return wrapper;}};
  const requests=[randomUUID(),randomUUID()];
  const act=require('../src/operations/mutate').act;
  const initialAction=target.status==='WAITING'?'PICK':'REOPEN';
  const picked=await act(transactionPool,token,Number(body.data.user.id),target.id,{requestId:requests[0],version:Number(target.version),action:initialAction,...(initialAction==='REOPEN'?{confirm:true}:{})});
  const done=await act(transactionPool,token,Number(body.data.user.id),target.id,{requestId:requests[1],version:Number(target.version)+1,action:'DONE',note:'Verifikasi transaksi deployment; selalu rollback'});
  if(picked.status!=='IN_PROGRESS'||done.status!=='DONE')throw Error('STATUS_FLOW_FAILED');
  const [outbox]=await c.query('SELECT payload FROM hd2_courier_outbox WHERE idem_key IN (?,?)',requests.map(id=>'web:'+body.data.user.id+':'+id));
  if(outbox.length!==(initialAction==='PICK'?2:1)||outbox.some(row=>{const p=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;return p.chat_id!==target.chat_id||p.reply_to_message_id!==target.message_id;}))throw Error('REPLY_ANCHOR_FAILED');
  results.writerStatusFlowAndReplyEnqueue=true;results.initialAction=initialAction;
  await c.rollback();c.release();c=null;
  const [[after]]=await pool.query('SELECT * FROM hd2_orders WHERE id=?',[target.id]);
  const [[requestCount]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_web_requests WHERE request_id IN (?,?)',requests);
  const [[outboxCount]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox WHERE idem_key IN (?,?)',requests.map(id=>'web:'+body.data.user.id+':'+id));
  if(digest(after)!==before||Number(requestCount.n)!==0||Number(outboxCount.n)!==0)throw Error('ROLLBACK_VERIFICATION_FAILED');results.rollbackVerified=true;
  const deployment=JSON.parse(fs.readFileSync('.local/protected-web-deployment.json','utf8'));
  const baseline=JSON.parse(fs.readFileSync(path.join(deployment.snapshot,'service/state/preflight.json'),'utf8'));
  const [allOrders]=await pool.query('SELECT * FROM hd2_orders ORDER BY id');
  if(digest(allOrders)!==baseline.orderHash||allOrders.length!==baseline.orderCount)throw Error('ORDER_BASELINE_CHANGED');results.allOrdersPreserved=true;results.orderCount=allOrders.length;
  const [delivery]=await pool.query('SELECT state,attempts,last_error_code,COUNT(*) AS total FROM hd2_courier_outbox GROUP BY state,attempts,last_error_code');
  report={status:'PASS',results,delivery,orderDataPreserved:true,telegramMessagesSent:0,workflowTransactionCommitted:false,checkedAt:new Date().toISOString()};
 }finally{
  if(c){await c.rollback();c.release();}if(pool)await pool.end();
  if(cookie){const logout=await call('/api/auth/logout',{method:'POST',body:'{}'});if(logout.status!==200)throw Error('LOGOUT_FAILED');const me=await call('/api/auth/me');if(me.status!==401)throw Error('SESSION_REVOCATION_FAILED');results.logoutAndRevocation=true;}
  for(const k of ['password','writePassword'])input[k]='';
 }
 fs.writeFileSync(path.resolve('.local/operational-flow-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(require.main===module)run().catch(e=>{console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'FLOW_CHECK_FAILED'}));process.exitCode=1;});
module.exports={run};
