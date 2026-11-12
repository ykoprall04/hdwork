// Default DRY RUN. No runtime/DPAPI/env/credential discovery and no Telegram imports.
const path=require('node:path');
const {reviewRelease}=require('../src/courier/fifo-reconcile');
function options(argv){
 const out={dryRun:true,late:false};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--apply'){out.dryRun=false;continue;}if(k==='--late'){out.late=true;continue;}
  const key={'--id':'id','--bot':'botId','--operator':'operator','--reason':'reason','--expected':'expected','--session':'session'}[k];
  if(!key||!argv[i+1]||argv[i+1].startsWith('--')||out[key]!==undefined)throw Error('INVALID_ARGUMENT');out[key]=argv[++i];
 }
 if(!out.session||!path.isAbsolute(out.session))throw Error('EXISTING_SESSION_ADAPTER_REQUIRED');
 return out;
}
async function main(argv){
 const args=options(argv);
 // Owner-managed adapter must expose an already-authorized mysql2-compatible pool.
 // No connection-string/password arguments are accepted by this command.
 const session=require(args.session),pool=await session.pool();
 try{return await reviewRelease(pool,args);}finally{await session.close?.();}
}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.log(JSON.stringify({status:'REVIEW_REJECTED',code:e.statusCode===409?'CONFLICT':'INVALID_OR_UNAVAILABLE_SESSION'}));process.exitCode=1;});
module.exports={main,options};
