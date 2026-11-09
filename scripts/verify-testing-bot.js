// Metadata only. Bounded getUpdates mode never logs/stores message payloads.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const root=path.resolve(__dirname,'..');
const reject=code=>Object.assign(Error('Testing bot verification blocked'),{code});
async function run(){
 const mode=process.argv.slice(2).join(' ');if(!['--get-me','--discover-testing-chat'].includes(mode))throw reject('EXPLICIT_METADATA_MODE_REQUIRED');
 let plan;if(mode==='--discover-testing-chat'){
  plan=JSON.parse(fs.readFileSync(path.join(root,'.local/courier.receive-only.plan.json'),'utf8'));
  if(plan.enabled||plan.botUsername!=='HDWorkOpsBot'||plan.telegramBotId!=='9133904377'||plan.testingGroupTitle!=='HD Work 2.0 Testing')throw reject('TEST_IDENTITY_REQUIRED');
 }
 let token=await require('../src/config/private-database-env').readPrivateDpapi('.local/courier-secrets/courier-token.dpapi');
 try{
  if(!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token))throw reject('TOKEN_FORMAT_REJECTED');
  if(plan&&token.split(':')[0]!==plan.telegramBotId)throw reject('BOT_IDENTITY_MISMATCH');
  const method=mode==='--get-me'?'getMe':'getUpdates';
  // No offset: do not confirm/discard the pending backlog during identification.
  const body=mode==='--get-me'?'{}':JSON.stringify({timeout:0,limit:100,allowed_updates:['message','my_chat_member']});
  const result=await new Promise((resolve,fail)=>{
   const req=https.request({hostname:'api.telegram.org',port:443,path:'/bot'+token+'/'+method,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:10000},res=>{
    const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>1048576){res.destroy();fail(reject('METADATA_TOO_LARGE'));}else chunks.push(b);});
    res.on('error',()=>fail(reject('METADATA_NETWORK_FAILED')));res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||value.ok!==true)throw Error();resolve(value.result);}catch{fail(reject('BOT_API_REJECTED'));}finally{for(const b of chunks)b.fill(0);}});
   });req.on('timeout',()=>req.destroy());req.on('error',()=>fail(reject('METADATA_NETWORK_FAILED')));req.end(body);
  });
  if(mode==='--discover-testing-chat'){
   if(!Array.isArray(result))throw reject('UPDATES_FORMAT_REJECTED');
   const matches=new Map();for(const item of result){const chat=(item?.message||item?.my_chat_member)?.chat;
    if(chat?.title!=='HD Work 2.0 Testing'||!['group','supergroup'].includes(chat.type)||!Number.isSafeInteger(chat.id)||chat.id>=0)continue;
    if(chat.is_forum===true)throw reject('TOPICS_CONFIGURATION_MISMATCH');
    matches.set(String(chat.id),{chatId:String(chat.id),title:chat.title,type:chat.type,threadId:null,threadMode:'non_topic'});
   }
   if(matches.size!==1)throw reject(matches.size?'AMBIGUOUS_TESTING_GROUP':'TESTING_GROUP_UPDATE_NOT_FOUND');
   const group=[...matches.values()][0];const report={verifiedIdentity:'HDWorkOpsBot',group,verifiedAt:new Date().toISOString(),payloadsStored:false,offsetAdvanced:false,ingestionStarted:false,messagesSent:0};
   const dir=fs.mkdtempSync(path.join(root,'.local/testing-chat-'));fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));return;
  }
  if(result?.is_bot!==true||String(result.username).toLowerCase()!=='hdworkopsbot'||String(result.id)!==token.split(':')[0])throw reject('BOT_IDENTITY_MISMATCH');
  const verified={verified:true,username:'HDWorkOpsBot',telegramBotId:String(result.id),verifiedAt:new Date().toISOString(),groupVerified:false,ingestionStarted:false,messagesSent:0};
  const dir=fs.mkdtempSync(path.join(root,'.local/testing-bot-'));fs.writeFileSync(path.join(dir,'identity.json'),JSON.stringify(verified,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({...verified,report:path.relative(root,path.join(dir,'identity.json'))}));
 }finally{token='';}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({verified:false,code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'PRIVATE_METADATA_FAILED',ingestionStarted:false,messagesSent:0}));process.exitCode=1;});
module.exports={run};
