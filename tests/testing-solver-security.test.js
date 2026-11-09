const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const policy=require('../src/operations/testing-solver-scope');
test('trial scope remains mandatory alongside the approved general writer',()=>{
 const env={...require('../src/config/office-web').officeEnvironment({dist:'.local/online-candidate-security/dist',publicOrigin:'https://hdwork2.yoloo.space'}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',HDWORK2_TESTING_SOLVER_ENABLED:'true',HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify(scope())};
 const s=policy.configuration(env);assert.equal(s.username,'trial_yanto');
 assert.throws(()=>policy.action(s,user(),{...order(),chat_id:'-999'},{action:'PICK'}));
 assert.throws(()=>policy.configuration({...env,HDWORK2_OPERATIONAL_WRITE_APPROVED:'false'}));
 const expired={...scope(),expiresAt:new Date(1).toISOString()};
 assert.equal(policy.configuration({...env,HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify(expired)}),null);
 assert.throws(()=>policy.action(s,user(),order(),{action:'PICK'},Date.now()+172800000));
 assert.throws(()=>policy.configuration({...env,HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify({...expired,chatId:'-999'})}));
});
const scope=()=>({username:'trial_yanto',userId:37,chatId:'-5436357946',botId:'hdworkopsbot-testing',botUsername:'HDWorkOpsBot',threadId:null,chatVerified:true,expiresAt:new Date(Date.now()+86400000).toISOString()});
const user=()=>({id:37,username:'trial_yanto',name:'Trial',role:'HD',is_active:1,modules:['TIAL']});
const order=()=>({id:randomUUID(),bot_id:'hdworkopsbot-testing',chat_id:'-5436357946',thread_id:null,message_id:'91',command:'order',telegram_timestamp:123,status:'WAITING',version:0,owner_user_id:null,duplicate_of:null});
test('scope denies missing/wrong group, bot, topic, username, account ID, expiry and unrelated actions',()=>{
 const s=scope(),u=user(),o=order();for(const action of ['PICK','DONE','FAILED'])assert.doesNotThrow(()=>policy.action(s,u,o,{action}));
 for(const patch of [{chat_id:'-999'},{chat_id:null},{bot_id:'production'},{thread_id:2},{thread_id:undefined},{message_id:null}])for(const action of ['PICK','DONE','FAILED'])assert.throws(()=>policy.action(s,u,{...o,...patch},{action}),/scope rejected/);
 for(const patch of [{username:'another'},{id:38},{role:'SUPER_ADMIN'},{is_active:0}])assert.throws(()=>policy.action(s,{...u,...patch},o,{action:'PICK'}));
 assert.throws(()=>policy.action({...s,expiresAt:new Date(0).toISOString()},u,o,{action:'PICK'}));
 for(const action of ['REOPEN','TAKEOVER','CONTINUE_DUPLICATE','REJECT_DUPLICATE',undefined])assert.throws(()=>policy.action(s,u,o,{action}));
 for(const path of ['/api/operations/orders','/api/operations/exports','/api/admin/users',`/api/operations/orders/${o.id}/actions/`])assert.equal(policy.mutationPath('POST',path),false);
});
function mockMutation(target){
 const writes=[];let committed=false,rolledBack=false;
 const c={async beginTransaction(){},async commit(){committed=true},async rollback(){rolledBack=true},release(){},async execute(sql,p=[]){
  if(sql.startsWith('SELECT id,name,role'))return [[user()]];
  if(sql.startsWith('SELECT module'))return [[{module:'TIAL'}]];
  if(sql.startsWith('SELECT token_hash'))return [[{token_hash:'synthetic'}]];
  if(sql.startsWith('SELECT * FROM hd2_orders'))return [[target]];
  if(sql.startsWith('SELECT payload_hash,result'))return [[{payload_hash:require('../src/operations/policy').hash({id:target.id,...input}),result:null}]];
  if(sql.startsWith('SELECT id,payload_hash'))return [[{id:'outbox',payload_hash:require('../src/courier/contract').digest(JSON.parse(writes.find(w=>w.sql.startsWith('INSERT INTO hd2_courier_outbox')).p[4]))}]];
  if(/^(INSERT|UPDATE|DELETE)/.test(sql)){writes.push({sql,p});return [{affectedRows:1}]}
  throw Error('Unexpected query');
 }};
 const input={requestId:randomUUID(),version:0,action:'PICK'};
 return {pool:{async getConnection(){return c}},writes,input,get committed(){return committed},get rolledBack(){return rolledBack}};
}
test('official mutation rejects production before any write, including idempotency/audit/outbox writes',async()=>{
 for(const patch of [{chat_id:'-999'},{bot_id:'production'},{thread_id:1},{chat_id:null}]){
  const o={...order(),...patch},m=mockMutation(o);
  await assert.rejects(require('../src/operations/mutate').act(m.pool,'synthetic',37,o.id,m.input,{testingScope:scope()}));
  assert.equal(m.writes.length,0);assert.equal(m.rolledBack,true);assert.equal(m.committed,false);
 }
});
test('official PICK writes username and request identity in history and replies to the original testing message',async()=>{
 const o=order(),m=mockMutation(o);
 const result=await require('../src/operations/mutate').act(m.pool,'synthetic',37,o.id,m.input,{testingScope:scope()});
 assert.equal(result.status,'IN_PROGRESS');assert.equal(m.committed,true);
 const audit=m.writes.find(w=>w.sql.startsWith('INSERT INTO hd2_audit'));const detail=JSON.parse(audit.p.at(-1));assert.equal(detail.actorUsername,'trial_yanto');assert.equal(detail.requestId,m.input.requestId);
 const outbox=m.writes.find(w=>w.sql.startsWith('INSERT INTO hd2_courier_outbox'));const payload=JSON.parse(outbox.p[4]);assert.equal(payload.chat_id,scope().chatId);assert.equal(payload.reply_to_message_id,'91');assert.equal(payload.telegram_thread_id,null);
});
test('outgoing authorization denies missing/wrong reply anchor and group even for a testing order',()=>{
 const o=order(),payload={method:'sendMessage',chat_id:o.chat_id,reply_to_message_id:o.message_id,telegram_thread_id:null,thread_mode:'non_topic',text:'DONE'};
 assert.equal(policy.outgoing(scope(),o,payload),true);
 for(const patch of [{chat_id:'-999'},{reply_to_message_id:null},{reply_to_message_id:'92'},{telegram_thread_id:2},{thread_mode:'thread'}])assert.throws(()=>policy.outgoing(scope(),o,{...payload,...patch}));
 const sql=require('../src/courier/testing-solver-outbox').selection;assert.ok(sql.includes('r.user_id=?'));assert.ok(sql.includes('o.chat_id=?'));assert.ok(sql.includes("b.attempts=0"));assert.ok(sql.includes('o.thread_id IS NULL'));
});
test('read-only policy opens only the narrowly scoped action route, never create/export/admin mutations',()=>{
 const env={...require('../src/config/office-web').officeEnvironment({dist:'.local/online-candidate-security/dist',publicOrigin:'https://hdwork2.yoloo.space'}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'true',HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify(scope())};
 const middleware=require('../src/config/auth-write-policy').authWritePolicy(env);
 function run(path){let passed=false,status;middleware({method:'POST',path},{status(n){status=n;return this},json(){}},()=>passed=true);return {passed,status};}
 assert.equal(run('/api/operations/orders/'+randomUUID()+'/actions').passed,true);
 for(const path of ['/api/operations/orders','/api/operations/exports','/api/admin/users'])assert.equal(run(path).status,503);
});
