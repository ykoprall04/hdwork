// Native lifecycle integration. Never discovers credentials or substitutes a task kill.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {regular,sha}=require('./courier-cutover.cjs');
const fail=code=>Object.assign(Error(code),{code});
const env=()=>Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function nativeClient({source,configFile,configSha256,approvalFile,planSha256},{invoke}={}){
 if(process.platform!=='win32')throw fail('WINDOWS_REQUIRED');
 if(sha(regular(configFile))!==configSha256)throw fail('NATIVE_CONFIG_PIN_MISMATCH');
 const config=JSON.parse(regular(configFile));
 if(config.kind!=='HDWORK2_NATIVE_SUPERVISOR'||!/^HDWork2-(?:LiveChat-Courier|CourierFixture-[a-f0-9]{32})$/.test(config.taskName||''))throw fail('NATIVE_SCOPE_REJECTED');
 const script=path.join(source,'ops/windows/courier-native-control.ps1');
 invoke??=(args=>{let output;try{output=cp.execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',script,...args],{env:env(),encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:90000});}catch(e){output=e.stdout?.toString();if(!output)throw fail('NATIVE_CONTROL_FAILED');}let r;try{r=JSON.parse(output);}catch{throw fail('NATIVE_RECEIPT_INVALID');}if(r.status==='STOP')throw fail(/^[A-Z0-9_]+$/.test(r.code||'')?r.code:'NATIVE_STOP');return r;});
 const call=(mode,more=[])=>invoke(['-Mode',mode,'-ControlConfig',configFile,'-ConfigSha256',configSha256,...more]);
 return {config,inspect:()=>call('Inspect'),planStop:()=>call('StopFence'),stopFence:barrierId=>call('StopFence',['-ApprovalFile',approvalFile,'-PlanSha256',planSha256,'-BarrierId',barrierId,'-Execute']),assertFence:barrierId=>call('AssertFence',['-BarrierId',barrierId])};
}
async function createWindowsHost(plan,context,{bindings}={}){
 const infra=plan.infrastructure;
 if(!infra?.native||!infra.bindings)throw fail('NATIVE_AND_DATABASE_BINDINGS_REQUIRED');
 if(sha(regular(infra.bindings.file))!==infra.bindings.sha256)throw fail('HOST_BINDINGS_PIN_MISMATCH');
 const native=nativeClient({source:plan.source,configFile:infra.native.file,configSha256:infra.native.sha256,approvalFile:context.approvalFile,planSha256:context.planSha256});
 if(native.config.targetCommit!==plan.targetCommit)throw fail('NATIVE_TARGET_MISMATCH');
 bindings??=await require(infra.bindings.file).create(plan,context);
 for(const method of ['inspect','quiesceWriters','assertWritersQuiescent','backupConfiguration','schema','grants','databasePool','installFlagsOff','health','rollbackRuntime'])if(typeof bindings[method]!=='function')throw fail('HOST_CAPABILITY_MISSING');
 let currentBarrier;
 return {
  async inspect(input){const lifecycle=native.inspect(),db=await bindings.inspect(input);return {...db,duplicateInstances:!!db.duplicateInstances||lifecycle.pythonChildren?.length>1,native:lifecycle};},
  async stopClean(input){
   const barrierId=require('node:crypto').randomUUID(),stopped=native.stopFence(barrierId);
   if(!stopped.graceful||stopped.forced||!stopped.fenceHeld)throw fail('NATIVE_STOP_NOT_PROVEN');
   const writers=await bindings.quiesceWriters({...input,barrierId});
   if(writers.writersQuiesced!==true||writers.allWriterPidsGone!==true)throw fail('WRITER_FENCE_NOT_PROVEN');
   currentBarrier={...stopped,decisionId:input.decisionId,allowlistSha256:input.allowlistSha256,writersQuiesced:true};return currentBarrier;
  },
  async assertQuiescent({barrier}){const check=native.assertFence(barrier.barrierId);const writers=await bindings.assertWritersQuiescent?.(barrier);if(!writers||writers.writersQuiesced!==true)throw fail('WRITER_FENCE_LOST');return {...check,writersQuiesced:true};},
  async backupPair(input){
   const assertQuiescent=async()=>{native.assertFence(input.barrier.barrierId);const w=await bindings.assertWritersQuiescent(input.barrier);if(w?.writersQuiesced!==true)throw fail('WRITER_FENCE_LOST');};
   await assertQuiescent();const configuration=await bindings.backupConfiguration(input);
   return require('./courier-paired-backup.cjs').pairedBackup({...configuration,barrier:input.barrier,decisionId:input.allowlist.decisionId,allowlistSha256:require('../../src/courier/administrative-closure').validateAllowlist(input.allowlist),assertQuiescent});
  },
  schema:input=>bindings.schema(input),grants:input=>bindings.grants(input),databasePool:()=>bindings.databasePool(),
  async installFlagsOff(input){native.assertFence(input.barrier.barrierId);return bindings.installFlagsOff(input);},
  async health(input){native.assertFence(input.barrier.barrierId);return bindings.health(input);},
  async rollbackRuntime(input){const r=await bindings.rollbackRuntime({...input,restoreDatabase:false,keepCourierStopped:true});if(currentBarrier)native.assertFence(currentBarrier.barrierId);return r;},
  async close(){await bindings.close?.();} // Closing DB handles never removes the fence/re-enables a task.
 };
}
module.exports={nativeClient,createWindowsHost};
