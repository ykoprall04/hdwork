// Technical events only: arbitrary strings, payloads, SQL and exception messages never enter disk.
const fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {AsyncLocalStorage}=require('node:async_hooks'),{randomUUID}=require('node:crypto');
const context=new AsyncLocalStorage();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODE=/^(?:ER_[A-Z_]+|E[A-Z0-9_]{2,40}|[A-Z][A-Z0-9_]{2,60})$/;
function errorInfo(error){
 const stack=String(error?.stack||''),heading=`${error?.name}: ${error?.message}`;
 // Strip the entire message, including injected newlines that could imitate stack frames.
 const frames=(stack.startsWith(heading)?stack.slice(heading.length):'').split('\n').filter(s=>/^\s+at /.test(s)&&!/[\r\n]/.test(s)).map(s=>{
  // Keep location/line/column, never source lines, URL, directory or dynamic function names.
  const m=s.match(/([A-Za-z0-9_.-]+\.(?:js|cjs|mjs)):(\d+):(\d+)\)?$/);return m?`${m[1]}:${m[2]}:${m[3]}`:'[frame redacted]';
 });
 return {type:['Error','TypeError','RangeError','SyntaxError'].includes(error?.name)?error.name:'Error',code:CODE.test(error?.code||'')?error.code:undefined,status:Number.isInteger(error?.statusCode)?error.statusCode:Number.isInteger(error?.status)?error.status:undefined,errno:Number.isInteger(error?.errno)?error.errno:undefined,sqlState:/^[0-9A-Z]{5}$/.test(error?.sqlState||'')?error.sqlState:undefined,fatal:typeof error?.fatal==='boolean'?error.fatal:undefined,syscall:['connect','read','write','open'].includes(error?.syscall)?error.syscall:undefined,traceback:frames,cause:error?.cause&&error.cause!==error?errorInfoShallow(error.cause):undefined,message:'[redacted]'};
}
function errorInfoShallow(e){return {code:CODE.test(e?.code||'')?e.code:undefined,message:'[redacted]'};}
function fields(input={}){const out={};for(const [k,v]of Object.entries(input)){
 if(['traceId','correlationId','outboxId','orderId','requestId'].includes(k)&&typeof v==='string'&&UUID.test(v))out[k]=v;
 if(['durationMs','queueAgeMs','retryAfterMs','waitMs','count','attempt','dropped','statusCode'].includes(k)&&typeof v==='number'&&Number.isFinite(v))out[k]=Math.max(0,v);
 if(['status','reason'].includes(k)&&typeof v==='string'&&/^[A-Z_]{2,64}$/.test(v))out[k]=v;
 }return out;}
const day=now=>new Date(now+7*3600000).toISOString().slice(0,10);
function createLogger({directory,source='node',now=Date.now,enabled=true,limit=2048}={}){
 let queue=[],running=false,dropped=0,lastDay,closed=false;const waiters=[];
 const valid=/^[a-z-]{1,32}$/.test(source);if(!valid)throw Error('LOG_SOURCE_INVALID');
 async function drain(){if(running)return;running=true;
  while(queue.length){const batch=queue.splice(0,128),date=day(now());let carried=0;try{
   await fs.promises.mkdir(directory,{recursive:true,mode:0o700});
   if(lastDay!==date){lastDay=date;const files=await fs.promises.readdir(directory);for(const file of files){const m=/^hdwork2-(\d{4}-\d{2}-\d{2})-[a-z-]+-\d+\.jsonl$/.exec(file);if(m&&m[1]<day(now()-6*86400000))await fs.promises.unlink(path.join(directory,file)).catch(()=>{});}}
   const target=path.join(directory,`hdwork2-${date}-${source}-${process.pid}.jsonl`);
   const existing=await fs.promises.lstat(target).catch(e=>{if(e.code!=='ENOENT')throw e;});if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1))throw Error('LOG_LINK_REJECTED');
   carried=dropped;const records=dropped?[{timestamp:new Date(now()).toISOString(),source,pid:process.pid,event:'LOG_DROPPED',dropped},...batch]:batch;dropped=0;
   await fs.promises.appendFile(target,records.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
  }catch{dropped+=batch.length+carried;/* logging must never fail delivery */}
  }running=false;for(const done of waiters.splice(0))done();
 }
 function emit(event,data={},error){if(!enabled||closed||!directory)return;if(!/^[A-Z_]{2,64}$/.test(event))return;
  if(queue.length>=limit){dropped++;return;}
  queue.push({timestamp:new Date(now()).toISOString(),source,pid:process.pid,event,...fields(context.getStore()),...fields(data),...(error?{error:errorInfo(error)}:{})});void drain();
 }
 return {emit,async flush(){if(running||queue.length)await new Promise(resolve=>waiters.push(resolve));},async close(){closed=true;await this.flush();},get dropped(){return dropped;}};
}
let singleton;
function logger(){return singleton??=createLogger({directory:process.env.HDWORK2_LOG_DIRECTORY||(process.platform==='win32'?path.join(process.env.ProgramData||'C:\\ProgramData','HDWork2','Logs'):undefined),source:'node',enabled:process.env.HDWORK2_RAW_LOG_ENABLED==='true'});}
async function observe(event,data,run){
 const parent=context.getStore(),scope={...(parent||{traceId:randomUUID()}),...fields(data)};
 return context.run(scope,async()=>{const start=performance.now();try{const result=await run();logger().emit(event,{...data,status:'OK',durationMs:performance.now()-start});return result;}catch(error){logger().emit(event,{...data,status:'ERROR',durationMs:performance.now()-start},error);throw error;}});
}
function captureOutput(log=logger()){
 const restore=[];
 for(const [name,stream]of [['STDOUT',process.stdout],['STDERR',process.stderr]]){
  const original=stream.write;
  stream.write=function(chunk,...args){
   // Observe byte count only: split chunks can contain any portion of a credential/body.
   log.emit('NODE_'+name,{count:Buffer.isBuffer(chunk)?chunk.length:Buffer.byteLength(String(chunk))});
   return original.call(this,chunk,...args);
  };restore.push(()=>{stream.write=original;});
 }
 return ()=>restore.forEach(fn=>fn());
}
function withTrace(traceId,run){return context.run({traceId:typeof traceId==='string'&&UUID.test(traceId)?traceId:randomUUID()},run);}
module.exports={createLogger,logger,observe,errorInfo,fields,day,captureOutput,withTrace};
