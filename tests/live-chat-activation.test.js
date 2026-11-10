const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {prepare,profiles,preflight}=require('../src/config/live-chat-activation');
function environment(){return {...require('../src/config/office-web').officeEnvironment({local:true}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',OP_WRITE_DB_PASSWORD_DPAPI_FILE:'fixture-writer.dpapi',B2C_COMMAND_SCHEMA_READY:'true'};}
function pool(role,{missing=false,extra=false,schema=true,wrongIdentity=false}={}){
 const queries=[],policy=require('../src/config/operational-grants').policies[role];
 return {queries,async query(sql){queries.push(sql);assert.match(sql,/^(SELECT|SHOW) /);if(sql.startsWith('SELECT CURRENT_USER'))return [[{account:wrongIdentity?'root@localhost':(role.endsWith('Read')||role==='read'?'hdwork_ops_read':'hdwork_ops_write')+'@localhost',db:'hdwork2'}]];
 const grants=Object.entries(policy).map(([table,p])=>({g:`GRANT ${p.join(', ')} ON hdwork2.${table} TO 'fixture'@'localhost'`}));if(missing)grants.pop();if(extra)grants.push({g:"GRANT ALL PRIVILEGES ON hdwork2.* TO 'fixture'@'localhost'"});return [grants];},async execute(sql){queries.push(sql);assert.match(sql,/^SELECT .* LIMIT 0$/);if(!schema)throw Error('FIXTURE_MISSING_SCHEMA');return [[]];}};
}
test('activation proposal changes exactly the two feature flags, preserving existing privileges and Courier settings',()=>{
 const env=environment(),before=structuredClone(env),result=prepare(env);assert.deepEqual(env,before);assert.deepEqual(Object.keys(result.patch),['HDWORK2_SYSTEM_MONITORING_ENABLED','HDWORK2_LIVE_CHAT_ENABLED']);for(const key of Object.keys(env))if(!Object.hasOwn(result.patch,key))assert.equal(result.candidate[key],env[key]);assert.equal(result.candidate.COURIER_ALLOW_NETWORK,'false');assert.equal(result.candidate.COURIER_ENABLED,'false');
 for(const patch of [{OP_WRITE_ENABLED:'false'},{HDWORK2_OPERATIONAL_WRITE_APPROVED:'false'},{HDWORK2_LOCAL_READ_ONLY:'true'},{HDWORK2_SERVICE_AUTH_POLICY:'session-audit-only'},{HDWORK2_TESTING_SOLVER_ENABLED:'true'}])assert.throws(()=>prepare({...env,...patch}));
});
test('release preflight accepts exact chat profiles and checks schema using SELECT LIMIT 0 only',async()=>{
 const env=prepare(environment()).candidate,reader=pool('chatRead'),writer=pool('chatWrite');const result=await preflight({reader,writer,env});assert.equal(result.status,'PASS');assert.equal(result.writesPerformed,false);assert.equal(result.telegramVerified,false);assert.ok(reader.queries.some(s=>s.includes('hd2_chat_messages')));assert.ok(writer.queries.some(s=>s.includes('hd2_chat_messages')));
});
test('preflight still accepts base/system profiles and rejects wrong, missing, excessive grants or schema',async()=>{
 for(const [env,read,write]of [[{},'read','write'],[{HDWORK2_SYSTEM_MONITORING_ENABLED:'true'},'systemRead','systemWrite']])assert.equal((await preflight({env,reader:pool(read),writer:pool(write)})).status,'PASS');
 const env=prepare(environment()).candidate;for(const fixture of [{missing:true},{extra:true},{schema:false},{wrongIdentity:true}])await assert.rejects(preflight({env,reader:pool('chatRead'),writer:pool('chatWrite',fixture)}));await assert.rejects(preflight({env,reader:pool('read'),writer:pool('write')}));
});
test('invalid flags and chat without system monitoring fail before any database call',async()=>{
 for(const env of [{HDWORK2_LIVE_CHAT_ENABLED:'true'},{HDWORK2_LIVE_CHAT_ENABLED:'yes'}]){assert.throws(()=>profiles(env));await assert.rejects(preflight({env,reader:{query(){assert.fail();}},writer:{query(){assert.fail();}}}));}
});
test('offline CLI writes only a review patch; never changes active config, reads bundle, starts service or contacts DB',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hdwork-chat-plan-'));try{const service=path.join(root,'service');await fs.mkdir(service);const input=path.join(service,'environment.json'),output=path.join(root,'activation.review.json');const bytes=JSON.stringify(environment());await fs.writeFile(input,bytes);const result=await require('../scripts/prepare-live-chat-activation').run(['--prepare','--environment',input,'--output',output]);assert.equal(result.status,'REVIEW_ONLY_NOT_ACTIVATED');assert.equal(result.databaseAccessed,false);assert.equal(await fs.readFile(input,'utf8'),bytes);assert.equal((await fs.readdir(service)).length,1);assert.ok(!JSON.stringify(result).includes('DB_USER'));await assert.rejects(require('../scripts/prepare-live-chat-activation').run(['--prepare','--environment',input,'--output',output]),{code:'EEXIST'});await fs.writeFile(input,JSON.stringify({...environment(),DB_PASSWORD:'synthetic-rejected'}));await assert.rejects(require('../scripts/prepare-live-chat-activation').run(['--prepare','--environment',input,'--output',path.join(root,'other.json')]),/PLAINTEXT_SECRET/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('approved writer can enable chat while preserving valid active or expired trial overlay and trial chat denial',async()=>{
 const scope={username:'trial_yanto',userId:123,botId:'hdworkopsbot-testing',chatId:'-5436357946',threadId:null,botUsername:'HDWorkOpsBot',chatVerified:true};
 for(const expiresAt of [new Date(Date.now()+3600000).toISOString(),new Date(Date.now()-3600000).toISOString()]){
  const env={...environment(),HDWORK2_PUBLIC_ORIGIN:'https://hdwork2.yoloo.space',FRONTEND_ORIGINS:'https://hdwork2.yoloo.space',HDWORK2_TESTING_SOLVER_ENABLED:'true',HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify({...scope,expiresAt})};
  const result=prepare(env);assert.equal(result.candidate.HDWORK2_TESTING_SOLVER_ENABLED,'true');assert.equal(result.candidate.HDWORK2_TESTING_SOLVER_SCOPE,env.HDWORK2_TESTING_SOLVER_SCOPE);assert.deepEqual(Object.keys(result.patch),['HDWORK2_SYSTEM_MONITORING_ENABLED','HDWORK2_LIVE_CHAT_ENABLED']);assert.equal(result.candidate.OP_WRITE_ENABLED,'true');
  await assert.rejects(require('../src/chat/service').createChat({readPool:{execute(){assert.fail('trial cannot read chat');}}}).conversations({}, {username:'trial_yanto',modules:['TIAL']}),{statusCode:403});
  await assert.rejects(require('../src/chat/service').createChat({readPool:{execute(){assert.fail('trial cannot read messages');}}}).messages('00000000-0000-4000-8000-000000000001',{}, {username:'trial_yanto',modules:['TIAL']}),{statusCode:403});
  assert.throws(()=>prepare({...env,HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify({...scope,expiresAt,chatVerified:false})}));
 }
});
