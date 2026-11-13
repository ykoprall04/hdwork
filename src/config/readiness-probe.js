// Single-flight only, never a cached PASS. Timed-out work stays accounted until settled.
function create({check,timeoutMs=2000,transactions=require('../operations/transaction-gate'),now=Date.now}){
 if(typeof check!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('READINESS_PROBE_CONFIG_REJECTED');
 let pending,lastDurationMs=null,lastOutcome='NOT_CHECKED',startedAt=null,timedOut=false;
 async function probe(){
  if(!pending){startedAt=now();timedOut=false;pending=transactions.run(check).then(result=>{lastOutcome=timedOut?'LATE_COMPLETION':'PASS';return result;},error=>{lastOutcome='FAIL';throw error;}).finally(()=>{lastDurationMs=now()-startedAt;pending=null;});}
  let timer;try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;lastOutcome='TIMEOUT';reject(Object.assign(Error('READINESS_TIMEOUT'),{code:'READINESS_TIMEOUT',statusCode:503}));},timeoutMs);})]);}finally{clearTimeout(timer);}
 }
 return {probe,snapshot:()=>({inFlight:!!pending,lastDurationMs,lastOutcome,pendingMs:pending?now()-startedAt:0})};
}
module.exports={create};
