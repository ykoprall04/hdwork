// Synthetic disk and enqueue benchmark only; no application startup or network.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {createLogger}=require('../src/observability/raw-log');
async function run(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-log-bench-')),log=createLogger({directory,limit:20000});const times=[],start=performance.now();try{
 for(let i=0;i<10000;i++){const begin=performance.now();log.emit('SYNTHETIC_STAGE',{correlationId:'12345678-1234-1234-1234-123456789abc',durationMs:12.3,status:'OK'});times.push(performance.now()-begin);}
 await log.flush();times.sort((a,b)=>a-b);console.log(JSON.stringify({environment:'Linux synthetic; not production',samples:times.length,emitMs:{p50:times[4999],p95:times[9499],max:times[9999]},emitAndFlushMs:performance.now()-start,dropped:log.dropped}));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}}
if(require.main===module)run().catch(()=>{console.error('SYNTHETIC_LOG_BENCHMARK_FAILED');process.exitCode=1;});
module.exports={run};
