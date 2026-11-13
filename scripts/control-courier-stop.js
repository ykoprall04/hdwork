// Lifecycle ONLY. No database, DPAPI secrets, Telegram, restart, install or unfence.
const path=require('node:path');
const {createCourierLifecycle}=require('./lib/windows-courier-adapter.cjs');
const {regular,verifyApproval}=require('./lib/courier-cutover.cjs');
async function main(argv){
 const o={mode:'plan',execute:false};for(let i=0;i<argv.length;i++){if(argv[i]==='--execute'){if(o.execute)throw Error('DUPLICATE_ARGUMENT');o.execute=true;continue;}const k={'--mode':'mode','--config':'config','--config-sha256':'configSha256','--expected-head':'head','--plan-sha256':'planSha256','--decision':'decisionId','--approval':'approvalFile','--barrier':'barrierId'}[argv[i]];if(!k||!argv[i+1]||o[k]&&k!=='mode')throw Error('ARGUMENT_REJECTED');o[k]=argv[++i];}
 if(!['inspect','plan','stop','assert'].includes(o.mode)||!path.isAbsolute(o.config||'')||! /^[a-f0-9]{40}$/.test(o.head||''))throw Error('EXACT_SCOPE_REQUIRED');
 const plan={source:path.resolve(__dirname,'..'),targetCommit:o.head,decisionId:o.decisionId,infrastructure:{native:{file:o.config,sha256:o.configSha256}}};
 const client=createCourierLifecycle(plan,{approvalFile:o.approvalFile,planSha256:o.planSha256});
 if(o.execute&&o.mode!=='stop')throw Error('EXECUTE_ONLY_FOR_STOP');
 if(o.mode==='inspect')return client.inspect();
 if(o.mode==='assert'){if(!o.barrierId)throw Error('BARRIER_REQUIRED');return client.assertFence(o.barrierId);}
 if(o.mode!=='stop'||!o.execute)return client.planStop();
 if(!path.isAbsolute(o.approvalFile||'')||!/^DEC-\d{8}-\d{2}$/.test(o.decisionId||'')||! /^[a-f0-9]{64}$/.test(o.planSha256||'')||! /^[a-f0-9-]{36}$/.test(o.barrierId||''))throw Error('EXPLICIT_SCOPED_APPROVAL_REQUIRED');
 verifyApproval(JSON.parse(regular(o.approvalFile)),plan,o.planSha256);
 return client.stopFence(o.barrierId);
}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.log(JSON.stringify({status:'STOP',code:/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):'LIFECYCLE_REJECTED'}));process.exitCode=1;});
module.exports={main};
