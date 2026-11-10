const test=require('node:test'),assert=require('node:assert/strict'),{inspect,run,schema,statements}=require('../scripts/check-live-chat-readiness');
const policies=require('../src/config/operational-grants').policies;
function pool(role,{base=false,identity=true,missingSchema=false,mapping=true,lease=true,denied=false}={}){
 const queries=[],profile=base?(role==='chatRead'?'read':'write'):role;return {queries,async query(sql,args){queries.push(sql);assert.ok(Object.values(statements).includes(sql),'Only exact SELECT/SHOW metadata statements allowed');assert.doesNotMatch(sql,/FROM (?:users|hd2_orders|hd2_chat_messages)\b|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|GRANT|REVOKE|DROP)\b(?!\s+OPTION)/);
 if(sql===statements.identity)return [[{db:'hdwork2',account:identity?(role==='chatRead'?'hdwork_ops_read':'hdwork_ops_write')+'@localhost':'root@localhost'}]];
 if(sql===statements.grants)return [Object.entries(policies[profile]).map(([table,p])=>({g:`GRANT ${p.join(', ')} ON hdwork2.${table} TO 'fixture'@'localhost'`}))];
 if(sql===statements.columns){assert.deepEqual(args,Object.keys(schema));return [missingSchema?[]:Object.entries(schema).flatMap(([TABLE_NAME,cols])=>cols.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))];}
 if(denied)throw Object.assign(Error('raw-secret-must-not-appear'),{code:'ER_TABLEACCESS_DENIED_ERROR'});
 if(sql===statements.mappings)return [mapping?[{bot_id:'fixture',category:'TIAL',profile:'TIAL1'},{bot_id:'fixture',category:'LOGIC',profile:'SOLVER1'}]:[]];
 if(sql===statements.workers)return [[{bot_id:'fixture',expires_ms:lease?Date.now()+60000:0}]];
 throw Error('Unexpected fixture query');}};
}
test('metadata readiness reports exact grant/schema results without order rows, secrets, Telegram or false transport success',async()=>{
 const result=await inspect({reader:pool('chatRead'),writer:pool('chatWrite')});assert.equal(result.status,'WEB_SCHEMA_GRANTS_PASS');assert.equal(result.schema.status,'PASS');assert.equal(result.routing.status,'LEASE_EVIDENCE_ONLY');assert.equal(result.orderRowsRead,false);assert.equal(result.writesPerformed,false);assert.equal(result.courierTransportVerified,false);assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('base grants produce actionable missing profiles and hidden columns are not asserted nonexistent',async()=>{
 const result=await inspect({reader:pool('chatRead',{base:true,missingSchema:true}),writer:pool('chatWrite',{base:true,missingSchema:true})});assert.equal(result.status,'BLOCKED');assert.equal(result.accounts.chatRead.ok,false);assert.ok(result.accounts.chatWrite.missing.some(s=>s.startsWith('hd2_chat_messages:')));assert.equal(result.schema.status,'MISSING_OR_NOT_VISIBLE');assert.ok(result.schema.missingOrNotVisible.includes('hd2_chat_messages.body'));assert.equal(result.routing.status,'UNKNOWN');
});
test('wrong account blocks metadata reads and errors disclose safe codes only',async()=>{
 const reader=pool('chatRead',{identity:false});const result=await inspect({reader,writer:pool('chatWrite')});assert.equal(result.status,'BLOCKED');assert.deepEqual(reader.queries,[statements.identity]);const denied=await inspect({reader:pool('chatRead',{denied:true}),writer:pool('chatWrite')});assert.equal(denied.routing.code,'ER_TABLEACCESS_DENIED_ERROR');assert.ok(!JSON.stringify(denied).includes('raw-secret'));
});
test('missing mapping or expired lease never claims Courier operational readiness',async()=>{
 for(const opts of [{mapping:false},{lease:false}]){const result=await inspect({reader:pool('chatRead',opts),writer:pool('chatWrite')});assert.equal(result.routing.status,'INCOMPLETE');assert.equal(result.courierTransportVerified,false);}
});
test('probe refuses to consume private stdin or open a DB without explicit mode and reviewed target',async()=>{
 let reads=0,connects=0;await assert.rejects(run({argv:[],bootstrap(){reads++;},connect(){connects++;}}),/EXPLICIT_READ_ONLY/);assert.equal(reads,0);assert.equal(connects,0);
});
test('PowerShell wrapper does not control services, mutate environment or forward Telegram/signing credentials',()=>{
 const text=require('node:fs').readFileSync('scripts/check-live-chat-readiness.ps1','utf8');assert.doesNotMatch(text,/Restart-Service|Start-ScheduledTask|Stop-ScheduledTask|Set-ScheduledTask|Set-Acl|Set-Content|WriteAllBytes|testingTelegramToken|signingSecret/);assert.match(text,/param\(.*ApprovedReadOnly/);assert.match(text,/StandardInput\.WriteLine\(\$transfer\)/);assert.match(text,/StandardInput\.Close\(\)/);assert.doesNotMatch(text,/Get-FileHash/);assert.ok(text.indexOf('ADMINISTRATOR_REQUIRED_OPEN_ELEVATED_POWERSHELL')<text.indexOf('$deployment='));assert.ok(text.indexOf('ENVIRONMENT_ACCESS_DENIED_USE_AUTHORIZED_ADMIN_CONTEXT')<text.indexOf('ProtectedData]::Unprotect'));assert.match(text,/GetBaseException\(\)/);
});
test('host probe uses fixed loopback identities, private two-secret bootstrap and closes every owned connection',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');const root=await fs.mkdtemp(path.join(os.tmpdir(),'hdwork-chat-readonly-'));
 try{
  await fs.mkdir(path.join(root,'service'));const env={...require('../src/config/office-web').officeEnvironment({local:true}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',B2C_COMMAND_SCHEMA_READY:'true'};
  const raw=JSON.stringify(env),file=path.join(root,'service/environment.json'),review=path.join(root,'review.json');await fs.writeFile(file,raw);await fs.writeFile(review,JSON.stringify({status:'REVIEW_ONLY_NOT_ACTIVATED',environmentSha256:createHash('sha256').update(raw).digest('hex'),patch:require('../src/config/live-chat-activation').prepare(env).patch}));
  const secrets={readPassword:'synthetic-read',writePassword:'synthetic-write'},connections=[],reports=[];const result=await run({argv:['--approved-read-only','--snapshot',root,'--review',review],bootstrap:async(_input,opts)=>opts.validate(secrets),connect:async opts=>{assert.equal(opts.host,'127.0.0.1');assert.equal(opts.port,3306);assert.equal(opts.database,'hdwork2');assert.equal(opts.multipleStatements,false);const adapter=pool(opts.user==='hdwork_ops_read'?'chatRead':'chatWrite'),connection={closed:false,query:({sql,timeout},params)=>{assert.equal(timeout,5000);return adapter.query(sql,params);},async end(){this.closed=true;}};connections.push(connection);return connection;},report:r=>reports.push(r)});
  assert.equal(result.environmentUnchanged,true);assert.equal(result.backendSource.matchesRepository,false);assert.equal(result.writerApprovalPreserved,true);assert.equal(await fs.readFile(file,'utf8'),raw);assert.ok(connections.every(c=>c.closed));assert.deepEqual(secrets,{readPassword:'',writePassword:''});assert.equal(reports.length,1);assert.ok(!JSON.stringify(reports).includes('synthetic-'));
  await fs.writeFile(file,raw+' ');let bootstraps=0;await assert.rejects(run({argv:['--approved-read-only','--snapshot',root,'--review',review],bootstrap:async()=>{bootstraps++;},report:()=>{}}),/ENVIRONMENT_CHANGED/);assert.equal(bootstraps,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
