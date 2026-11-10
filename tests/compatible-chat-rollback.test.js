const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {prepare,release}=require('../scripts/prepare-compatible-chat-rollback');
const {execute,hash}=require('../scripts/apply-live-chat-web-overlay');
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'compatible-chat-rollback-')),repo=path.join(root,'repo'),snapshot=path.join(root,'runtime'),prepared=path.join(root,'prepared');
 const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 const git=args=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
 try{
  const oldPool=cp.execFileSync('git',['show','f875aedd061ef3e07ca5db91102b21294327d559:src/config/operational-pools.js']);
  const policy=fs.readFileSync('src/config/operational-grants.js');write(path.join(repo,'src/config/operational-pools.js'),oldPool);write(path.join(repo,'src/config/operational-grants.js'),policy);
  write(path.join(repo,'scripts/check-live-chat-readiness.ps1'),fs.readFileSync('scripts/check-live-chat-readiness.ps1'));
  git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','.']);git(['commit','-qm','prior runtime']);const ancestor=git(['rev-parse','HEAD']).toString().trim();
  const env={...require('../src/config/office-web').officeEnvironment({local:true}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',OP_WRITE_DB_PASSWORD_DPAPI_FILE:'synthetic-writer.dpapi',B2C_COMMAND_SCHEMA_READY:'true'};
  const rawEnv=Buffer.from(JSON.stringify(env)),cipher=Buffer.from('synthetic encrypted bundle'),entries=[];
  for(const [file,before,after]of [['src/config/operational-pools.js',oldPool,fs.readFileSync('src/config/operational-pools.js')],['scripts/protected-web-service.js',Buffer.from('prior launcher'),Buffer.from('retained launcher')],['src/config/protected-service-bundle.js',null,Buffer.from('retained validator')]]){
   entries.push({file,before:before?hash(before):null,after:hash(after),classification:before?'KNOWN_ANCESTOR':'NEW_FILE',ancestor:before?ancestor:null});
   if(before){write(path.join(snapshot,file),before);write(path.join(prepared,'backup',file),before);}write(path.join(prepared,'payload',file),after);
  }
  for(const [file,bytes]of [['service/environment.json',rawEnv],['service/secrets.dpapi',cipher]]){write(path.join(snapshot,file),bytes);write(path.join(prepared,'backup',file),bytes);}
  const original={version:1,status:'STAGED_NOT_ACTIVATED',commit:release,backupComplete:true,snapshot,entries,environmentSha256:hash(rawEnv),encryptedBundleSha256:hash(cipher),patch:{HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'false'},rollback:{grantProfileAlignmentRequired:true}};
  const planBytes=Buffer.from(JSON.stringify(original));write(path.join(prepared,'production-plan.review.json'),planBytes);
  return run({repo,snapshot,prepared,write,rawEnv,planBytes,options:{prepared,repo}});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('compatible rollback preserves original backups, pinned release, expanded grants and retained dormant validator',()=>fixture(f=>{
 const result=prepare(f.options);assert.equal(result.releaseCommit,release);assert.equal(result.runtimeChanged,false);assert.equal(result.realPoolProbe,'PENDING');
 assert.deepEqual(fs.readFileSync(path.join(f.prepared,'production-plan.review.json')),f.planBytes);assert.deepEqual(fs.readFileSync(path.join(f.prepared,'backup/service/environment.json')),f.rawEnv);
 execute({prepared:f.prepared,planSha256:hash(f.planBytes),mode:'apply',approved:true,webStopped:true});
 execute({prepared:result.output,planSha256:result.rollbackPlanSha256,mode:'rollback',approved:true,webStopped:true});
 const env=JSON.parse(fs.readFileSync(path.join(f.snapshot,'service/environment.json')));
 assert.equal(env.HDWORK2_LIVE_CHAT_ENABLED,'true');assert.equal(env.HDWORK2_TESTING_SOLVER_ENABLED,'false');assert.equal(env.OP_WRITE_ENABLED,'true');
 assert.equal(fs.readFileSync(path.join(f.snapshot,'scripts/protected-web-service.js'),'utf8'),'retained launcher');assert.equal(fs.readFileSync(path.join(f.snapshot,'src/config/protected-service-bundle.js'),'utf8'),'retained validator');
 assert.equal(hash(fs.readFileSync(path.join(f.snapshot,'src/config/operational-pools.js'))),JSON.parse(f.planBytes).entries[0].before);
}));
test('changed grant policy or original backup fails before preparing fallback',()=>fixture(f=>{
 f.write(path.join(f.repo,'src/config/operational-grants.js'),'unreviewed policy');assert.throws(()=>prepare(f.options),/GRANT_POLICY_DIFFERS/);
 assert.deepEqual(fs.readFileSync(path.join(f.snapshot,'service/environment.json')),f.rawEnv);
}));
test('historical pool preflight selects exact chat profiles and performs only SELECT/SHOW with disposable adapters',async()=>{
 // Async work must finish before fixture cleanup.
 let pending;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'probe-fixture-'));
 try{
  fixture(f=>{const result=prepare(f.options);fs.cpSync(result.output,root,{recursive:true});pending=result.rollbackPlanSha256;});
  const sql=[];let closed=0;
  const result=await require('../scripts/check-compatible-chat-rollback').run({prepared:root,planSha256:pending,bootstrap:async()=>({readPassword:'synthetic-read',writePassword:'synthetic-write'}),report:()=>{},connectPool:opts=>{
   const query=async({sql:statement})=>{sql.push(statement);assert.match(statement,/^(SELECT|SHOW) /);if(statement.startsWith('SELECT DATABASE'))return [[{db:'hdwork2',account:opts.user+'@localhost'}]];
    if(statement.startsWith('SHOW')){const role=opts.user==='hdwork_ops_read'?'chatRead':'chatWrite';return [Object.entries(require('../src/config/operational-grants').policies[role]).map(([t,ps])=>({g:`GRANT ${ps.join(', ')} ON hdwork2.${t} TO synthetic`}))];}return [[]];};
   return {query,execute:query,async end(){closed++;}};
  }});
  assert.equal(result.status,'ROLLBACK_POOLS_SCHEMA_GRANTS_PASS');assert.equal(result.fullWebBootVerified,false);assert.equal(result.writesPerformed,false);assert.equal(result.orderRowsRead,false);assert.equal(result.telegramAccessed,false);assert.equal(closed,2);assert.ok(sql.some(s=>s.includes('hd2_chat_messages')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
