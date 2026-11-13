// No socket destruction or force-close fallback. Timeout retains pool/transaction ownership.
function create({transactions=require('../operations/transaction-gate')}={}){
 let draining=false,pending,active=0;const responses=new Set(),servers=new Set(),sse=new WeakSet();
 function wrap(handler){return (req,res)=>{
  if(draining){res.writeHead(503,{'Connection':'close','Retry-After':'5'});res.end();return;}
  active++;responses.add(res);let done=false;const finish=()=>{if(!done){done=true;active--;responses.delete(res);}};res.once('finish',finish);res.once('close',finish);
  const head=res.writeHead;res.writeHead=function(...args){
   const headers=args.find(x=>x&&typeof x==='object');
   const values=Array.isArray(headers)?headers:Object.entries(headers||{}).flat();
   if(values.some(v=>String(v).includes('text/event-stream')))sse.add(res);
   return head.apply(this,args);
  };
  handler(req,res);
 };}
 function attach(server){servers.add(server);return server;}
 function snapshot(){return {protocol:'HDWORK2_WEB_DRAIN_V1',draining,activeRequests:active,activeTransactions:transactions.snapshot().active};}
 async function close({timeoutMs=30000,closePools=async()=>{}}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('WEB_DRAIN_DEADLINE_REJECTED');
  if(!pending){
   draining=true;transactions.begin();
   // Only SSE responses are ended, gracefully; business responses stay intact.
   for(const res of responses)if(sse.has(res)||String(res.getHeader('content-type')||'').includes('text/event-stream'))res.end();
   const closed=[...servers].map(server=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections?.();}));
   pending=(async()=>{
    while(active||transactions.snapshot().active){await new Promise(r=>setTimeout(r,10));for(const res of responses)if(sse.has(res)||String(res.getHeader('content-type')||'').includes('text/event-stream'))res.end();}
    await Promise.all(closed);await closePools();return {...snapshot(),status:'DRAINED',forced:false,poolsClosed:true};
   })();
  }
  let timer;try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('WEB_DRAIN_TIMEOUT'),{code:'WEB_DRAIN_TIMEOUT',...snapshot(),forced:false})),timeoutMs);})]);}finally{clearTimeout(timer);}
 }
 return {wrap,attach,close,snapshot};
}
module.exports={create};
