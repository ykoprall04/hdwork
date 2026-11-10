const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {prepare}=require('../scripts/prepare-live-chat-incoming-fix');
const {execute,hash}=require('../scripts/apply-live-chat-web-overlay');
const base='4ef886e9bb2176b15f86cb3c2462a601fb8d14d6',files=['src/chat/service.js','courier_bot/courier/groups.py'];
function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'incoming-fix-')),repo=path.join(dir,'repo'),snapshot=path.join(dir,'runtime'),prepared=path.join(dir,'prepared');
 const git=args=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
 const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 try{
  cp.execFileSync('git',['clone','--shared','--no-checkout','-q',path.resolve(__dirname,'..'),repo],{stdio:'pipe'});git(['checkout','-q',base]);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
  for(const file of files){write(path.join(snapshot,file),fs.readFileSync(path.join(repo,file)));write(path.join(repo,file),fs.readFileSync(path.resolve(__dirname,'..',file)));}
  git(['add','--',...files]);git(['commit','-qm','incoming fix']);const patchCommit=git(['rev-parse','HEAD']).toString().trim();
  const env=Buffer.from(JSON.stringify({HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'false',OP_WRITE_ENABLED:'true',OTHER_MODULE:'preserve'},null,2)+'\n'),cipher=Buffer.from('synthetic-encrypted-bundle');
  write(path.join(snapshot,'service/environment.json'),env);write(path.join(snapshot,'service/secrets.dpapi'),cipher);
  write(path.join(prepared,'production-plan.review.json'),JSON.stringify({commit:base,backupComplete:true,snapshot,encryptedBundleSha256:hash(cipher)}));
  run({repo,snapshot,prepared,env,options:{prepared,repo,patchCommit},write});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('two-file incoming fix stages valid backups, applies and rolls back with only Courier stopped and no config rewrite',()=>fixture(f=>{
 const before=files.map(file=>hash(fs.readFileSync(path.join(f.snapshot,file))));
 const result=prepare(f.options);assert.equal(result.backupVerified,true);assert.equal(result.runtimeChanged,false);
 assert.throws(()=>execute({prepared:result.output,planSha256:result.planSha256,mode:'apply',approved:true,webStopped:true}),/COURIER_ONLY_SCOPE_REQUIRED/);
 assert.deepEqual(files.map(file=>hash(fs.readFileSync(path.join(f.snapshot,file)))),before);
 const envFile=path.join(f.snapshot,'service/environment.json');fs.utimesSync(envFile,new Date(0),new Date(0));
 const options={prepared:result.output,planSha256:result.planSha256,approved:true,courierStopped:true};
 const applied=execute({...options,mode:'apply'});assert.equal(applied.restartScope,'COURIER_ONLY');assert.equal(applied.configurationChanged,false);assert.equal(fs.statSync(envFile).mtimeMs,0);assert.deepEqual(fs.readFileSync(envFile),f.env);
 execute({...options,mode:'rollback'});assert.deepEqual(files.map(file=>hash(fs.readFileSync(path.join(f.snapshot,file)))),before);assert.equal(fs.statSync(envFile).mtimeMs,0);
}));
test('Courier-only approval cannot apply a general web overlay; runtime drift blocks preparation',()=>fixture(f=>{
 const result=prepare(f.options),file=path.join(result.output,'production-plan.review.json'),plan=JSON.parse(fs.readFileSync(file));delete plan.kind;const bytes=JSON.stringify(plan);fs.writeFileSync(file,bytes);
 assert.throws(()=>execute({prepared:result.output,planSha256:hash(bytes),mode:'apply',approved:true,courierStopped:true}),/COURIER_ONLY_SCOPE_REQUIRED/);
 f.write(path.join(f.snapshot,files[0]),'independent runtime edits');assert.throws(()=>prepare(f.options),/RUNTIME_SOURCE_DRIFT/);assert.deepEqual(fs.readFileSync(path.join(f.snapshot,'service/environment.json')),f.env);
}));
