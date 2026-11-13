const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createTelegramMetadata,metadataDiagnostics}=require('../scripts/lib/telegram-metadata.cjs');
const token='123456789:'+'x'.repeat(35),secret='SYNTHETIC_TOKEN_RESPONSE_MUST_NOT_LEAK';
function fixture(action){
 const req=new EventEmitter(),socket=new EventEmitter(),res=new EventEmitter();res.statusCode=200;let callback,timer,cleared=0,destroyed=0,calls=0;
 req.destroy=()=>{destroyed++;};res.destroy=()=>{};
 req.end=bytes=>{assert.equal(bytes.toString(),'{}');queueMicrotask(()=>{req.emit('socket',socket);action({req,socket,res,respond:()=>callback(res),deadline:()=>timer()});});};
 const telegram=createTelegramMetadata({request(options,cb){calls++;assert.equal(options.hostname,'api.telegram.org');assert.equal(options.path,'/bot'+token+'/getMe');assert.equal(options.method,'POST');assert.equal(options.rejectUnauthorized,true);assert.equal(options.timeout,10000);callback=cb;return req;},setTimer(fn){timer=fn;return 1;},clearTimer(){cleared++;}});
 return {telegram,req,socket,res,stats:()=>({cleared,destroyed,calls})};
}
function connected(socket){socket.emit('lookup',null,'149.154.166.110',4);socket.emit('connect');socket.emit('secureConnect');}
async function rejects(action,code,diagnostics){
 const f=fixture(action);await assert.rejects(f.telegram(token,'getMe'),e=>{
  assert.equal(e.code,code);assert.equal(e.message,code);assert.deepEqual(e.diagnostics,diagnostics);assert.equal(e.cause,undefined);
  for(const text of [JSON.stringify(e),String(e),e.stack]){assert.ok(!text.includes(secret));assert.ok(!text.includes(token));}
  return true;
 });assert.ok(f.stats().cleared);assert.ok(f.stats().destroyed);assert.equal(f.socket.listenerCount('lookup'),0);return f;
}
test('metadata-only method allowlist rejects polling, sends and webhook changes before request',async()=>{
 const f=fixture(()=>assert.fail());for(const method of ['getUpdates','sendMessage','deleteWebhook','setWebhook'])await assert.rejects(f.telegram(token,method),/TELEGRAM_READ_ONLY_METHOD_REQUIRED/);assert.equal(f.stats().calls,0);
});
test('valid getMe returns identity and does not mutate response buffers',async()=>{
 const bytes=Buffer.from(JSON.stringify({ok:true,result:{id:123456789,is_bot:true,username:'SyntheticBot'}}));
 const f=fixture(({socket,res,respond})=>{connected(socket);respond();res.emit('data',bytes);res.emit('end');});
 assert.deepEqual(await f.telegram(token,'getMe'),{id:123456789,is_bot:true,username:'SyntheticBot'});assert.ok(bytes.toString().includes('SyntheticBot'));assert.ok(f.stats().cleared);assert.equal(f.socket.listenerCount('connect'),0);
});
test('DNS failure retains only finite safe code',async()=>{
 await rejects(({req,socket})=>socket.emit('lookup',Object.assign(Error(secret),{code:'ENOTFOUND'})),'TELEGRAM_DNS_FAILED',{method:'getMe',phase:'DNS',transportCode:'ENOTFOUND'});
});
test('TCP refusal is distinguished from TLS reset before any HTTP response',async()=>{
 await rejects(({req,socket})=>{socket.emit('lookup',null,'149.154.166.110',4);req.emit('error',Object.assign(Error(secret),{code:'ECONNREFUSED'}));},'TELEGRAM_CONNECT_FAILED',{method:'getMe',phase:'CONNECT',transportCode:'ECONNREFUSED'});
 await rejects(({req,socket})=>{socket.emit('lookup',null,'149.154.166.110',4);socket.emit('connect');req.emit('error',Object.assign(Error(secret),{code:'ECONNRESET'}));},'TELEGRAM_TLS_FAILED',{method:'getMe',phase:'TLS',transportCode:'ECONNRESET'});
});
test('certificate errors remain TLS errors; no insecure fallback or retry',async()=>{
 const f=await rejects(({req,socket})=>{socket.emit('connect');req.emit('error',Object.assign(Error(secret),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}));},'TELEGRAM_TLS_FAILED',{method:'getMe',phase:'TLS',transportCode:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'});assert.equal(f.stats().calls,1);
});
test('total deadline covers pending DNS and inactivity timeout records its phase',async()=>{
 await rejects(({deadline})=>deadline(),'TELEGRAM_METADATA_TIMEOUT',{method:'getMe',phase:'DNS',transportCode:'ETIMEDOUT',timeoutKind:'TOTAL'});
 await rejects(({req,socket})=>{socket.emit('connect');req.emit('timeout');},'TELEGRAM_METADATA_TIMEOUT',{method:'getMe',phase:'TLS',transportCode:'ETIMEDOUT',timeoutKind:'INACTIVITY'});
});
test('Telegram credential rejection is distinct from connectivity and drops the raw description',async()=>{
 await rejects(({socket,res,respond})=>{connected(socket);res.statusCode=401;respond();res.emit('data',Buffer.from(JSON.stringify({ok:false,error_code:401,description:secret})));res.emit('end');},'TELEGRAM_API_401',{method:'getMe',phase:'API',httpStatus:401});
});
test('malformed JSON and invalid successful envelopes fail closed without echoing raw data',async()=>{
 await rejects(({socket,res,respond})=>{connected(socket);respond();res.emit('data',Buffer.from(secret));res.emit('end');},'TELEGRAM_RESPONSE_INVALID_JSON',{method:'getMe',phase:'PARSE',httpStatus:200});
 for(const value of [null,[],{ok:true},{ok:false,error_code:401},{ok:true,result:null}])await rejects(({socket,res,respond})=>{connected(socket);respond();res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');},'TELEGRAM_RESPONSE_INVALID',{method:'getMe',phase:'API',httpStatus:200});
});
test('upstream server errors and redirects preserve status without following another host',async()=>{
 await rejects(({socket,res,respond})=>{connected(socket);res.statusCode=503;respond();res.emit('data',Buffer.from(JSON.stringify({ok:false,error_code:503,description:secret})));res.emit('end');},'TELEGRAM_HTTP_ERROR',{method:'getMe',phase:'API',httpStatus:503});
 const f=await rejects(({socket,res,respond})=>{connected(socket);res.statusCode=302;res.headers={location:'https://'+secret};respond();},'TELEGRAM_REDIRECT_REJECTED',{method:'getMe',phase:'BODY',httpStatus:302});assert.equal(f.stats().calls,1);
});
test('truncated and oversized responses are distinguished and sanitized',async()=>{
 await rejects(({socket,res,respond})=>{connected(socket);respond();res.emit('aborted');},'TELEGRAM_RESPONSE_TRUNCATED',{method:'getMe',phase:'BODY',httpStatus:200});
 await rejects(({socket,res,respond})=>{connected(socket);respond();res.emit('data',Buffer.alloc(131073));},'TELEGRAM_METADATA_TOO_LARGE',{method:'getMe',phase:'BODY',httpStatus:200});
});
test('unknown error code/message cannot smuggle secrets into diagnostics',async()=>{
 await rejects(({req,socket})=>{socket.emit('connect');req.emit('error',Object.assign(Error(secret),{code:secret,cause:{token}}));},'TELEGRAM_TLS_FAILED',{method:'getMe',phase:'TLS'});
});
test('deadline cannot be silently extended beyond the existing ten-second budget',()=>{for(const deadlineMs of [0,10001,'10000'])assert.throws(()=>createTelegramMetadata({deadlineMs}),/TELEGRAM_DEADLINE_REJECTED/);});
test('caller diagnostics filter arbitrary fields and secret-bearing codes before logging',()=>{
 assert.equal(metadataDiagnostics({diagnostics:{method:secret,phase:'TLS'}}),undefined);
 assert.deepEqual(metadataDiagnostics({diagnostics:{method:'getMe',phase:'TLS',transportCode:secret,httpStatus:secret,timeoutKind:secret,url:token,message:secret}}),{method:'getMe',phase:'TLS'});
 assert.deepEqual(metadataDiagnostics({diagnostics:{method:'getMe',phase:'TLS',transportCode:'ECONNRESET',httpStatus:503,timeoutKind:'TOTAL',raw:secret}}),{method:'getMe',phase:'TLS',transportCode:'ECONNRESET',httpStatus:503,timeoutKind:'TOTAL'});
});
