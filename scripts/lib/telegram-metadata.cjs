// Metadata only. Never retain a request URL, token, raw response or original error.
const https=require('node:https');
const methods=new Set(['getMe','getChat','getChatMember','getWebhookInfo']);
const networkCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','EACCES','EPERM','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_SSL_WRONG_VERSION_NUMBER','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR']);
function metadataDiagnostics(error){
 const d=error?.diagnostics;if(!methods.has(d?.method)||!['DNS','CONNECT','TLS','RESPONSE','BODY','PARSE','API'].includes(d?.phase))return undefined;
 return {method:d.method,phase:d.phase,...(networkCodes.has(d.transportCode)?{transportCode:d.transportCode}:{}),...(Number.isInteger(d.httpStatus)&&d.httpStatus>=100&&d.httpStatus<=599?{httpStatus:d.httpStatus}:{}),...(['TOTAL','INACTIVITY'].includes(d.timeoutKind)?{timeoutKind:d.timeoutKind}:{})};
}
function createTelegramMetadata({request=(...args)=>https.request(...args),setTimer=setTimeout,clearTimer=clearTimeout,deadlineMs=10000}={}){
 if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>10000)throw Error('TELEGRAM_DEADLINE_REJECTED');
 return async function telegram(token,method,body={}){
  if(!methods.has(method))throw Error('TELEGRAM_READ_ONLY_METHOD_REQUIRED');
  const bytes=Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
   let req,res,socket,timer,done=false,phase='DNS',size=0;const chunks=[],listeners=[];
   const on=(emitter,event,handler)=>{emitter.once(event,handler);listeners.push([emitter,event,handler]);};
   const cleanup=()=>{clearTimer(timer);for(const [emitter,event,handler]of listeners)emitter.removeListener(event,handler);for(const b of chunks)b.fill(0);chunks.length=0;bytes.fill(0);};
   const failure=(code,{transportCode,httpStatus,timeoutKind}={})=>{
    if(done)return;done=true;
    const error=Object.assign(Error(code),{code,diagnostics:{method,phase,...(networkCodes.has(transportCode)?{transportCode}:{}),...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{}),...(['TOTAL','INACTIVITY'].includes(timeoutKind)?{timeoutKind}:{})}});
    cleanup();reject(error);res?.destroy();req?.destroy();
   };
   const transport=error=>failure(phase==='DNS'?'TELEGRAM_DNS_FAILED':phase==='CONNECT'?'TELEGRAM_CONNECT_FAILED':phase==='TLS'?'TELEGRAM_TLS_FAILED':'TELEGRAM_RESPONSE_FAILED',{transportCode:error?.code,httpStatus:res?.statusCode});
   try{
    req=request({hostname:'api.telegram.org',path:'/bot'+token+'/'+method,method:'POST',rejectUnauthorized:true,headers:{'Content-Type':'application/json','Content-Length':bytes.length},timeout:deadlineMs},response=>{
     if(done){response.destroy();return;}
     res=response;phase='BODY';
     if(res.statusCode>=300&&res.statusCode<400){failure('TELEGRAM_REDIRECT_REJECTED',{httpStatus:res.statusCode});return;}
     res.on('data',b=>{if(done)return;size+=b.length;if(size>131072){failure('TELEGRAM_METADATA_TOO_LARGE',{httpStatus:res.statusCode});return;}chunks.push(Buffer.from(b));});
     on(res,'aborted',()=>failure('TELEGRAM_RESPONSE_TRUNCATED',{httpStatus:res.statusCode}));
     // Leave an error listener installed: destroy may emit an asynchronous error.
     res.on('error',transport);
     on(res,'end',()=>{
      if(done)return;phase='PARSE';let data;const joined=Buffer.concat(chunks);
      try{data=JSON.parse(joined.toString('utf8'));}catch{failure('TELEGRAM_RESPONSE_INVALID_JSON',{httpStatus:res.statusCode});return;}finally{joined.fill(0);}
      phase='API';
      if(res.statusCode!==200){const c=res.statusCode;failure([400,401,403,409,429].includes(c)&&data?.ok===false&&data.error_code===c?'TELEGRAM_API_'+c:'TELEGRAM_HTTP_ERROR',{httpStatus:c});return;}
      if(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true||!data.result||typeof data.result!=='object'||Array.isArray(data.result)){failure('TELEGRAM_RESPONSE_INVALID',{httpStatus:res.statusCode});return;}
      done=true;cleanup();resolve(data.result);
     });
    });
    req.on('error',transport);
    on(req,'timeout',()=>failure('TELEGRAM_METADATA_TIMEOUT',{transportCode:'ETIMEDOUT',timeoutKind:'INACTIVITY'}));
    on(req,'socket',value=>{
     socket=value;if(socket.encrypted&&socket.authorized&&!socket.connecting){phase='RESPONSE';return;}
     on(socket,'lookup',error=>{if(error){transport(error);return;}phase='CONNECT';});
     on(socket,'connect',()=>{phase='TLS';});on(socket,'secureConnect',()=>{phase='RESPONSE';});
    });
    timer=setTimer(()=>failure('TELEGRAM_METADATA_TIMEOUT',{transportCode:'ETIMEDOUT',timeoutKind:'TOTAL'}),deadlineMs);
    req.end(bytes);
   }catch(error){transport(error);}
  });
 };
}
const telegram=createTelegramMetadata();
module.exports={telegram,createTelegramMetadata,metadataDiagnostics};
