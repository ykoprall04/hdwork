const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execute,hash}=require('../scripts/apply-live-chat-web-overlay');
function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-chat-overlay-')),snapshot=path.join(dir,'runtime'),prepared=path.join(dir,'prepared');
 const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 try{
  const env=JSON.stringify({OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',HDWORK2_LOCAL_READ_ONLY:'false',OTHER_MODULE:'preserve'}),cipher='synthetic-encrypted-bytes';
  const entries=[{file:'src/existing.js',classification:'KNOWN_ANCESTOR',before:hash('old code'),after:hash('new code')},{file:'src/new.js',classification:'NEW_FILE',before:null,after:hash('new dependency')}];
  write(path.join(snapshot,'src/existing.js'),'old code');write(path.join(snapshot,'service/environment.json'),env);write(path.join(snapshot,'service/secrets.dpapi'),cipher);
  write(path.join(prepared,'backup/src/existing.js'),'old code');write(path.join(prepared,'backup/service/environment.json'),env);write(path.join(prepared,'backup/service/secrets.dpapi'),cipher);
  write(path.join(prepared,'payload/src/existing.js'),'new code');write(path.join(prepared,'payload/src/new.js'),'new dependency');
  const plan={version:1,status:'STAGED_NOT_ACTIVATED',backupComplete:true,snapshot,entries,environmentSha256:hash(env),encryptedBundleSha256:hash(cipher),patch:{HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'false'}};
  const raw=JSON.stringify(plan);write(path.join(prepared,'production-plan.review.json'),raw);
  run({snapshot,prepared,write,env,cipher,options:{prepared,planSha256:hash(raw),approved:true,webStopped:true,mode:'apply'}});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('approved offline apply and rollback preserve writer flags, encrypted secrets and unrelated files',()=>fixture(f=>{
 assert.equal(execute(f.options).status,'FILES_APPLIED_WEB_RESTART_REQUIRED');
 const applied=JSON.parse(fs.readFileSync(path.join(f.snapshot,'service/environment.json')));
 assert.equal(applied.OP_WRITE_ENABLED,'true');assert.equal(applied.HDWORK2_LOCAL_READ_ONLY,'false');assert.equal(applied.OTHER_MODULE,'preserve');assert.equal(applied.HDWORK2_TESTING_SOLVER_ENABLED,'false');
 assert.equal(fs.readFileSync(path.join(f.snapshot,'service/secrets.dpapi'),'utf8'),f.cipher);
 assert.equal(execute({...f.options,mode:'rollback'}).status,'FILES_RESTORED_WEB_REMAINS_STOPPED');
 assert.equal(fs.readFileSync(path.join(f.snapshot,'service/environment.json'),'utf8'),f.env);
 assert.equal(fs.readFileSync(path.join(f.snapshot,'src/existing.js'),'utf8'),'old code');assert.equal(fs.existsSync(path.join(f.snapshot,'src/new.js')),false);
}));
test('missing approval, wrong plan digest, runtime edits and corrupt backups stop before writing',()=>fixture(f=>{
 for(const change of [{approved:false},{webStopped:false},{planSha256:'0'.repeat(64)}])assert.throws(()=>execute({...f.options,...change}));
 f.write(path.join(f.snapshot,'src/existing.js'),'independent change');assert.throws(()=>execute(f.options),/SOURCE_DRIFT/);assert.equal(fs.existsSync(path.join(f.snapshot,'src/new.js')),false);
 f.write(path.join(f.snapshot,'src/existing.js'),'old code');f.write(path.join(f.prepared,'backup/src/existing.js'),'corrupt backup');assert.throws(()=>execute(f.options),/BACKUP_CHANGED/);
 assert.equal(fs.readFileSync(path.join(f.snapshot,'service/environment.json'),'utf8'),f.env);
}));
test('rollback does not overwrite independently changed files after deployment',()=>fixture(f=>{
 execute(f.options);f.write(path.join(f.snapshot,'src/new.js'),'independent post-deploy edit');
 assert.throws(()=>execute({...f.options,mode:'rollback'}),/SOURCE_DRIFT/);
 assert.equal(fs.readFileSync(path.join(f.snapshot,'src/existing.js'),'utf8'),'new code');
}));
