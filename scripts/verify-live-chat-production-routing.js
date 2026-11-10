// Read-only Telegram metadata verification. No send/poll/webhook change/DB/service operation.
const fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https'),{createHash}=require('node:crypto');
const methods=new Set(['getMe','getChat','getChatMember','getWebhookInfo']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(code){throw Error(code);}
function candidate(input){
 if(!input||Object.keys(input).some(k=>!['telegramBotId','botUsername','groups','source','operator','newBotConfirmed'].includes(k)))fail('CANDIDATE_FIELDS_REJECTED');
 if(typeof input.telegramBotId!=='string'||! /^[1-9]\d{5,15}$/.test(input.telegramBotId)||!Number.isSafeInteger(Number(input.telegramBotId)))fail('EXPECTED_TELEGRAM_BOT_ID_REQUIRED');
 const username=typeof input.botUsername==='string'?input.botUsername.replace(/^@/,''):'';if(! /^[A-Za-z0-9_]{5,32}$/.test(username))fail('EXPECTED_BOT_USERNAME_REQUIRED');
 if(!input.source||typeof input.source!=='string'||!input.operator||typeof input.operator!=='string'||input.newBotConfirmed!==true)fail('SOURCE_OPERATOR_AND_NEW_BOT_CONFIRMATION_REQUIRED');
 if(!Array.isArray(input.groups)||input.groups.length!==3)fail('THREE_CANDIDATE_GROUPS_REQUIRED');
 const profiles=new Set();for(const g of input.groups){if(!g||Object.keys(g).some(k=>!['profile','chatId','threadId'].includes(k))||!['TIAL1','TIAL2','SOLVER1'].includes(g.profile)||profiles.has(g.profile)||typeof g.chatId!=='string'||! /^-[1-9]\d{0,18}$/.test(g.chatId)||g.threadId!==null)fail('EXACT_NON_TOPIC_CANDIDATES_REQUIRED');profiles.add(g.profile);}
 if(new Set(input.groups.map(g=>g.chatId)).size!==3)fail('DUPLICATE_CANDIDATE_GROUP');
 if(/\d{6,12}:[A-Za-z0-9_-]{30,}|-----BEGIN.*PRIVATE KEY|https?:\/\/[^\s/]+:[^\s@]+@/.test(JSON.stringify(input)))fail('CANDIDATE_MUST_NOT_CONTAIN_CREDENTIALS');
 return {...input,botUsername:username};
}
async function regular(file){const resolved=path.resolve(file),actual=await fs.realpath(resolved);if((process.platform==='win32'?actual.toLowerCase():actual)!==(process.platform==='win32'?resolved.toLowerCase():resolved))fail('SOURCE_LINK_REJECTED');const stat=await fs.lstat(resolved);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>1024*1024)fail('SOURCE_FILE_REJECTED');return fs.readFile(resolved);}
function json(bytes){let text=bytes[0]===0xff&&bytes[1]===0xfe?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8').replace(/^\uFEFF/,'');try{return JSON.parse(text);}catch{fail('CANDIDATE_OR_COURIER_PLAN_JSON_INVALID');}}
async function resolveIdentity(repo,expected,sourceFile){
 const names=sourceFile?[path.resolve(sourceFile)]:['.local/courier.receive-only.plan.json','.local/courier.modules.plan.json'].map(p=>path.join(repo,p)),found=[],inventory=[];
 for(const file of names){let bytes;try{bytes=await regular(file);}catch(e){if(e.code==='ENOENT'&&!sourceFile)continue;throw e;}
  const p=json(bytes);if(!p||typeof p!=='object'||Array.isArray(p))fail('COURIER_PLAN_INVALID');
  if(Object.keys(p).some(k=>/^(token|password|serviceKey|identityKey|telegramToken)$/i.test(k))||Object.hasOwn(p.database||{},'password'))fail('PLAINTEXT_COURIER_CREDENTIAL_REJECTED');
  const username=typeof p.botUsername==='string'?p.botUsername.replace(/^@/,''):'';
  const matches=username.toLowerCase()===expected.botUsername.toLowerCase(),idValid=typeof p.botId==='string'&&/^[a-z][a-z0-9_-]{1,63}$/.test(p.botId),hasRef=typeof p.tokenDpapiFile==='string'&&p.tokenDpapiFile.endsWith('.dpapi');
  inventory.push({source:path.basename(file),usernameMatches:matches,internalIdPresent:idValid,protectedTokenReferencePresent:hasRef});
  if(matches&&idValid&&hasRef){if(p.telegramBotId!==undefined&&String(p.telegramBotId)!==expected.telegramBotId)fail('COURIER_PLAN_TELEGRAM_ID_MISMATCH');const tokenFile=path.resolve(repo,p.tokenDpapiFile),folder=path.resolve(repo,'.local/courier-secrets');if(!tokenFile.startsWith(folder+path.sep))fail('TOKEN_REFERENCE_OUTSIDE_EXISTING_COURIER_SECRET_FOLDER');found.push({botId:p.botId,botUsername:username,tokenFile,file,sourceHash:sha(bytes),sourceEnabled:p.enabled===true,database:p.database,dbPasswordDpapiFile:p.dbPasswordDpapiFile,port:p.port});}
 }
 const identities=new Map(found.map(v=>[[v.botId,v.tokenFile].join('|'),v]));
 if(identities.size!==1){const e=Error(identities.size?'AMBIGUOUS_EXISTING_INTERNAL_COURIER_ID':'EXISTING_INTERNAL_COURIER_ID_NOT_FOUND');e.inventory=inventory;throw e;}
 return [...identities.values()][0];
}
async function telegram(token,method,body={}){
 if(!methods.has(method))fail('TELEGRAM_READ_ONLY_METHOD_REQUIRED');const bytes=Buffer.from(JSON.stringify(body));
 return new Promise((resolve,reject)=>{const request=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/'+method,method:'POST',headers:{'Content-Type':'application/json','Content-Length':bytes.length},timeout:10000},res=>{
  let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>131072){for(const c of chunks)c.fill(0);res.destroy();reject(Error('TELEGRAM_METADATA_TOO_LARGE'));}else chunks.push(b);});res.once('error',()=>reject(Error('TELEGRAM_METADATA_UNAVAILABLE')));res.once('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||data.ok!==true){const c=Number(data.error_code||res.statusCode);throw Error([400,401,403,409,429].includes(c)?'TELEGRAM_API_'+c:'TELEGRAM_METADATA_UNAVAILABLE');}resolve(data.result);}catch(e){reject(Error(/^TELEGRAM_API_\d{3}$/.test(e.message)?e.message:'TELEGRAM_METADATA_UNAVAILABLE'));}finally{for(const c of chunks)c.fill(0);}});
 });request.once('error',()=>reject(Error('TELEGRAM_METADATA_UNAVAILABLE')));request.once('timeout',()=>request.destroy());request.end(bytes);});
}
function canSend(chat,member){
 if(['administrator','creator'].includes(member.status))return true;
 if(member.status==='member')return chat.permissions?.can_send_messages===true;
 return member.status==='restricted'&&member.is_member===true&&member.can_send_messages===true;
}
async function verify({input,identity,readToken,call=telegram,now=Date.now}){
 const expected=candidate(input);let token='';
 try{
  token=await readToken(identity.tokenFile);if(typeof token!=='string'||!new RegExp('^'+expected.telegramBotId+':[A-Za-z0-9_-]{30,}$').test(token))fail('PROTECTED_TOKEN_BOT_ID_MISMATCH');
  const me=await call(token,'getMe',{});if(me?.is_bot!==true||String(me.id)!==expected.telegramBotId||String(me.username).toLowerCase()!==expected.botUsername.toLowerCase()||String(identity.botUsername).toLowerCase()!==expected.botUsername.toLowerCase())fail('GETME_BOT_IDENTITY_MISMATCH');
  const results=[];for(const g of expected.groups){let phase='getChat';
   try{const chat=await call(token,'getChat',{chat_id:g.chatId});if(String(chat?.id)!==g.chatId||!['group','supergroup'].includes(chat.type)||chat.is_forum===true)fail('GROUP_ID_TYPE_OR_NON_TOPIC_MISMATCH');
    phase='getChatMember';const member=await call(token,'getChatMember',{chat_id:g.chatId,user_id:Number(expected.telegramBotId)});if(String(member?.user?.id)!==expected.telegramBotId||member.user.is_bot!==true)fail('GROUP_MEMBERSHIP_IDENTITY_MISMATCH');
    results.push({...g,status:canSend(chat,member)?'PASS':'BLOCKED_BOT_CANNOT_SEND_TEXT',memberStatus:member.status});
   }catch(e){results.push({...g,phase,status:/^[A-Z0-9_]+$/.test(e.message)?e.message:'TELEGRAM_GROUP_CHECK_FAILED'});}
  }
  const webhook=await call(token,'getWebhookInfo',{}),routingPass=results.every(g=>g.status==='PASS');
  return {status:routingPass?'ROUTING_VERIFIED_NO_MESSAGES':'BLOCKED_GROUP_ACCESS',checkedAt:new Date(now()).toISOString(),telegramBotId:expected.telegramBotId,botUsername:me.username,internalBotId:identity.botId,internalIdSourceHash:identity.sourceHash,sourcePlanEnabled:identity.sourceEnabled===true,configuredCourierPort:Number.isSafeInteger(identity.port)?identity.port:null,source:expected.source,operator:expected.operator,groups:results,webhookConfigured:Boolean(webhook?.url),pendingTelegramUpdates:Number.isSafeInteger(webhook?.pending_update_count)?webhook.pending_update_count:null,courierRuntimeVerified:false,pollerOwnershipVerified:false,activationReady:false,blockingReasons:['COURIER_OWNER_LEASE_AND_ACTIVATION_BOUNDARY_NOT_VERIFIED',...(webhook?.url?['EXISTING_WEBHOOK_REQUIRES_OWNER_REVIEW']:[])],messagesSent:0,updatesConsumed:false,productionConfigurationChanged:false};
 }finally{token='';}
}
async function courierMetadata({identity,readSecret,connect,now=Date.now}){
 const result={status:'UNKNOWN',requiredGrantProfile:'courierSendChat',writesPerformed:false,leaseActive:false,backlogReviewed:false};let connection,password='';
 try{
  const db=identity.database;if(!db||db.host!=='127.0.0.1'||db.port!==3306||db.name!=='hdwork2'||db.user!=='hdwork_courier'||typeof identity.dbPasswordDpapiFile!=='string'||!identity.dbPasswordDpapiFile.endsWith('.dpapi'))fail('EXISTING_COURIER_DB_REFERENCE_REQUIRED');
  password=await readSecret(identity.dbPasswordDpapiFile);if(typeof password!=='string'||!password)fail('PROTECTED_COURIER_DB_CREDENTIAL_UNAVAILABLE');
  connection=await (connect||require('mysql2/promise').createConnection)({host:db.host,port:db.port,database:db.name,user:db.user,password,connectTimeout:5000,multipleStatements:false});
  const query=(sql,params)=>connection.query({sql,timeout:5000},params);
  const [[dbIdentity]]=await query('SELECT CURRENT_USER() AS account,DATABASE() AS db');if(dbIdentity.account!=='hdwork_courier@localhost'||dbIdentity.db!=='hdwork2')fail('COURIER_DB_IDENTITY_REJECTED');
  const [grants]=await query('SHOW GRANTS FOR CURRENT_USER'),review=require('../src/config/operational-grants').reviewOperationalGrants;
  const expected=review(grants,'courierSendChat');result.grants={ok:expected.ok,unsafe:expected.unsafe,missing:expected.missing};result.recognizedProfiles=['courier','courierSend','courierSystem','courierSendSystem','courierChat','courierSendChat'].filter(role=>review(grants,role).ok);
  const [workers]=await query('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=?',[identity.botId]);result.leaseActive=workers.some(w=>Number(w.expires_ms)>now());result.leaseExpiresAt=workers.length?new Date(Math.max(...workers.map(w=>Number(w.expires_ms)))).toISOString():null;
  const [inbox]=await query('SELECT state,COUNT(*) AS total FROM hd2_courier_inbox WHERE bot_id=? GROUP BY state',[identity.botId]);result.inbox=inbox.map(r=>({state:r.state,total:Number(r.total)}));
  try{const [outbox]=await query('SELECT state,COUNT(*) AS total FROM hd2_courier_outbox WHERE bot_id=? GROUP BY state',[identity.botId]);result.outbox=outbox.map(r=>({state:r.state,total:Number(r.total)}));}catch{result.outboxStatus='NOT_VISIBLE';}
  result.status=expected.ok?'GRANTS_PASS_TRANSPORT_STILL_UNVERIFIED':'BLOCKED_COURIER_GRANTS';return result;
 }catch(e){result.code=/^[A-Z0-9_]+$/.test(e.message)?e.message:['ER_ACCESS_DENIED_ERROR','ER_DBACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR','ECONNREFUSED','ETIMEDOUT'].includes(e.code)?e.code:'COURIER_METADATA_UNAVAILABLE';return result;}
 finally{password='';if(connection)try{await connection.end();}catch{}}
}
async function run({argv=process.argv.slice(2),repo=path.resolve(__dirname,'..'),readToken,readSecret,connect,call,report=value=>console.log(JSON.stringify(value,null,2))}={}){
 if(argv.length<5||argv[0]!=='--approved-telegram-read-only')fail('EXPLICIT_TELEGRAM_READ_ONLY_APPROVAL_REQUIRED');const args={};for(let i=1;i<argv.length;i+=2){if(!['--candidate','--output','--courier-plan','--courier-db-read-only'].includes(argv[i])||args[argv[i]]||!argv[i+1])fail('INVALID_VERIFICATION_ARGUMENTS');args[argv[i]]=argv[i+1];}if(!args['--candidate']||!args['--output'])fail('CANDIDATE_OUTPUT_REQUIRED');if(args['--courier-db-read-only']!==undefined&&args['--courier-db-read-only']!=='yes')fail('EXPLICIT_COURIER_DB_READ_ONLY_REQUIRED');
 const output=path.resolve(args['--output']);if(process.platform==='win32'&&path.resolve(process.env.HDWORK2_PRIVATE_PREPARATION_PARENT||'.').toLowerCase()!==path.dirname(output).toLowerCase())fail('USE_PRIVATE_VERIFICATION_POWERSHELL_WRAPPER');
 const expected=candidate(json(await regular(args['--candidate']))),identity=await resolveIdentity(repo,expected,args['--courier-plan']);
 const result=await verify({input:expected,identity,readToken:readToken||require('../src/config/private-database-env').readPrivateDpapi,call});if(args['--courier-db-read-only']==='yes')result.courier=await courierMetadata({identity,readSecret:readSecret||require('../src/config/private-database-env').readPrivateDpapi,connect});if(sha(await regular(identity.file))!==identity.sourceHash)fail('COURIER_IDENTITY_PLAN_CHANGED_DURING_VERIFICATION');
 await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});report(result);return result;
}
if(require.main===module)run().catch(e=>{const protectedCodes=['PRIVATE_DB_CONFIG_REJECTED','DPAPI_FILE_READ_FAILED','DPAPI_UNPROTECT_FAILED','DPAPI_MEMORY_READ_FAILED','DPAPI_PIPE_FAILED','DPAPI_DECRYPT_FAILED','DPAPI_TIMEOUT'];const safe=/^[A-Z0-9_]+$/.test(e.message)?e.message:protectedCodes.includes(e.code)?e.code:['EACCES','EPERM'].includes(e.code)?'PROTECTED_SOURCE_ACCESS_DENIED':'PRODUCTION_ROUTING_CHECK_FAILED';console.error(JSON.stringify({status:'BLOCKED',code:safe,inventory:e.inventory,messagesSent:0,productionConfigurationChanged:false}));process.exitCode=1;});
module.exports={candidate,resolveIdentity,verify,canSend,telegram,courierMetadata,run};
