const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test('actual runner flags-off imports no transport, decrypts no fixture secrets and accepts STOP',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'courier-off-'));for(const d of ['scripts','service'])fs.mkdirSync(path.join(root,d));
 const moduleFile=path.join(root,'scripts/run-production-live-chat-courier.js');fs.writeFileSync(moduleFile,"throw Error('TRANSPORT_MUST_NOT_LOAD');");
 const plan=path.join(root,'plan.json');fs.writeFileSync(plan,'{}');fs.writeFileSync(path.join(root,'service/environment.json'),'{}');fs.writeFileSync(path.join(root,'service/secrets.dpapi'),'SYNTHETIC_NEVER_DECRYPT');
 const file=path.join(root,'task.json'),cfg={version:1,kind:'HDWORK2_COURIER_AUTOSTART',runtimeMode:'flags-off',snapshot:root,productionPlan:plan,productionPlanSha256:sha(plan),nodeExecutable:process.execPath,pythonExecutable:process.execPath,ownerSid:'S-1-5-21-1',sourceHashes:{'scripts/run-production-live-chat-courier.js':sha(moduleFile)},environmentSha256:sha(path.join(root,'service/environment.json')),encryptedBundleSha256:sha(path.join(root,'service/secrets.dpapi')),botId:'fixture',telegramBotId:'fixture'};fs.writeFileSync(file,JSON.stringify(cfg));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/courier-task-runner.js'),'--config',file,'--config-sha256',sha(file)],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP,HDWORK2_NATIVE_GRACEFUL_ONLY:'true'}});child.stdout.resume();child.stderr.resume();
 const exited=new Promise(resolve=>child.once('exit',resolve));
 let state;for(let i=0;i<200;i++){try{state=JSON.parse(fs.readFileSync(path.join(root,'state.json')));if(state.code==='FLAGS_OFF_NO_TRANSPORT')break;}catch{}await new Promise(r=>setTimeout(r,50));}
 try{assert.equal(state?.code,'FLAGS_OFF_NO_TRANSPORT');assert.equal(state.pythonPid,null);await new Promise(r=>setTimeout(r,5500));assert.equal(JSON.parse(fs.readFileSync(path.join(root,'state.json'))).code,'FLAGS_OFF_NO_TRANSPORT');}finally{child.stdin.end('STOP\n');}
 assert.equal(await exited,0);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'state.json'))).code,'FLAGS_OFF_STOPPED');
});
