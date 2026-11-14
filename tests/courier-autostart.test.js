const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {configuration,hash}=require('../scripts/courier-task-runner');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'courier-task-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'service'));fs.mkdirSync(path.join(dir,'scripts'));
 const put=(name,text)=>{fs.writeFileSync(path.join(dir,name),text);return hash(Buffer.from(text));};
 const source=put('scripts/run-production-live-chat-courier.js',`exports.run=async()=>{console.log(JSON.stringify({status:'COURIER_STARTED_IDENTITY_AND_LEASE_VERIFIED',botId:'existing',telegramBotId:'9133904377'}));await new Promise(r=>process.once('SIGTERM',r));};`);
 const cfg={version:1,kind:'HDWORK2_COURIER_AUTOSTART',snapshot:dir,productionPlan:path.join(dir,'plan.json'),productionPlanSha256:put('plan.json','{"unchanged":true}'),nodeExecutable:process.execPath,pythonExecutable:process.execPath,ownerSid:'S-1-5-21-123',sourceHashes:{'scripts/run-production-live-chat-courier.js':source},environmentSha256:put('service/environment.json','{}'),encryptedBundleSha256:put('service/secrets.dpapi','synthetic ciphertext'),botId:'existing',telegramBotId:'9133904377'};
 function save(){const digest=put('config.json',JSON.stringify(cfg));return {file:path.join(dir,'config.json'),digest};}
 return {dir,cfg,put,save};
}
test('task refuses changed runtime, configuration, ciphertext and production plan before starting',t=>{
 for(const target of ['scripts/run-production-live-chat-courier.js','service/environment.json','service/secrets.dpapi','plan.json']){
  const f=fixture(t),c=f.save();assert.equal(configuration(c.file,c.digest).botId,'existing');f.put(target,'changed');assert.throws(()=>configuration(c.file,c.digest),/TASK_VERSION_DRIFT/);
 }
});
test('task rejects traversal even when config hash matches',t=>{const f=fixture(t);f.cfg.sourceHashes={'../escape':'x'};const c=f.save();assert.throws(()=>configuration(c.file,c.digest),/TASK_CONFIG_REJECTED/);});
test('owner pipe closure stops the supervisor and records redacted state',async t=>{
 const f=fixture(t),c=f.save();const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/courier-task-runner.js'),'--config',c.file,'--config-sha256',c.digest],{stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 let output='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('ready timeout')),5000);child.stdout.on('data',b=>{output+=b;if(output.includes('COURIER_STARTED')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('early exit'));});});
 const exit=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('stop timeout')),5000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});child.stdin.end();assert.equal(await exit,0);
 const state=JSON.parse(fs.readFileSync(path.join(f.dir,'state.json')));assert.equal(state.status,'STOPPED');assert.equal(state.liveChatEndToEndVerified,false);assert.equal(JSON.stringify(state).includes('synthetic ciphertext'),false);
});
test('supervisor stores only sanitized startup diagnostic receipts from its launcher',async t=>{
 const f=fixture(t),c=f.save();const source=`exports.run=async()=>{const e=Error('SYNTHETIC_SECRET_TOKEN');e.code='COURIER_STARTUP_FAILED';e.startupDiagnostic={component:'PYTHON',phase:'JOURNAL_SEED',exceptionType:'PermissionError',osError:13,token:'SYNTHETIC_SECRET_TOKEN'};throw e;}`;
 f.cfg.sourceHashes['scripts/run-production-live-chat-courier.js']=f.put('scripts/run-production-live-chat-courier.js',source);const config=f.save();
 const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/courier-task-runner.js'),'--config',config.file,'--config-sha256',config.digest],{stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('failure timeout')),5000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});child.stdout.resume();child.stderr.resume();});
 assert.equal(exit,1);const state=JSON.parse(fs.readFileSync(path.join(f.dir,'state.json')));assert.equal(state.code,'COURIER_STARTUP_FAILED');assert.deepEqual(state.startupDiagnostic,{component:'PYTHON',phase:'JOURNAL_SEED',exceptionType:'PermissionError',osError:13});assert.equal(JSON.stringify(state).includes('SYNTHETIC_SECRET_TOKEN'),false);
});
test('preparation pins approved releases, preserves source and rejects service-account DPAPI owners',t=>{
 const f=fixture(t),releaseDir=path.join(f.dir,'release'),fixDir=path.join(f.dir,'fix'),out=path.join(f.dir,'output');for(const d of [releaseDir,fixDir,out])fs.mkdirSync(d);
 fs.mkdirSync(path.join(f.dir,'src/config'),{recursive:true});
 const validator='exports.validate=p=>{if(!p.botId)throw Error("BAD_PLAN");return p;}';f.put('src/config/production-courier.js',validator);
 const release={backupComplete:true,commit:'4ef886e9bb2176b15f86cb3c2462a601fb8d14d6',snapshot:f.dir,entries:Object.entries({...f.cfg.sourceHashes,'src/config/production-courier.js':hash(Buffer.from(validator))}).map(([file,digest])=>({file,classification:'MATCH',before:digest,after:digest}))};
 const fix={backupComplete:true,kind:'HDWORK2_INCOMING_CHAT_FIX',commit:'f6ec0be361e7847138a29f9af88b7803516e40d9',baseCommit:release.commit,snapshot:f.dir,entries:[],environmentSha256:f.cfg.environmentSha256,encryptedBundleSha256:f.cfg.encryptedBundleSha256};
 for(const [d,p]of [[releaseDir,release],[fixDir,fix]])fs.writeFileSync(path.join(d,'production-plan.review.json'),JSON.stringify(p));
 const plan=JSON.stringify({botId:'hdworkopsbot-testing',botUsername:'HDWorkOpsBot',telegramBotId:'9133904377',activationNotBefore:'2026-11-10T13:20:35.278Z',port:3091});f.put('plan.json',plan);
 const options={releasePrepared:releaseDir,fixPrepared:fixDir,productionPlan:f.cfg.productionPlan,productionPlanSha256:hash(Buffer.from(plan)),ownerSid:f.cfg.ownerSid,nodeExecutable:process.execPath,pythonExecutable:process.execPath,output:out};
 const {prepare}=require('../scripts/prepare-courier-autostart');
 assert.throws(()=>prepare({...options,ownerSid:'S-1-5-19'}),/APPROVED_BASE_FIX_AND_OWNER_REQUIRED/);
 assert.throws(()=>prepare({...options,productionPlanSha256:'0'.repeat(64)}),/PRODUCTION_PLAN_CHANGED/);
 const result=prepare(options);assert.equal(result.status,'AUTOSTART_PREPARED_NOT_REGISTERED');assert.equal(result.credentialsChanged,false);assert.equal(fs.readFileSync(path.join(f.dir,'plan.json'),'utf8'),plan);
 assert.equal(configuration(path.join(out,'config.json'),result.configSha256).productionPlanSha256,options.productionPlanSha256);
});
