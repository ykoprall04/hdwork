// Inert private plan only. No env loading, token, network, DB, or runtime import.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../.local/courier.modules.plan.json');
fs.mkdirSync(path.dirname(file),{recursive:true});
if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({
 enabled:false,integrationEnabled:false,receiveEnabled:false,workerEnabled:false,outboxEnabled:false,pollEnabled:false,sendEnabled:false,globalReadOnly:true,
 source:'Telegram Bot API new dedicated bot only',botId:null,botUsername:null,tokenDpapiFile:null,serviceKeyDpapiFile:null,identityKeyDpapiFile:null,dbPasswordDpapiFile:null,
 database:{host:'127.0.0.1',port:3306,name:'hdwork2',user:'hdwork_courier'},journalDirectory:null,lockDirectory:null,
 groups:[{workspace:'B2C',profile:'TIAL1',chatId:null,threadId:null,threadMode:'non_topic',commands:['order','req','config_psb','mo']},...['ASSUREN','B2B','REPLACEMENT'].map(profile=>({workspace:profile,profile,chatId:null,threadId:null,threadMode:'thread',commands:[profile.toLowerCase()]}))],
 warning:'Review only; null IDs deliberately invalid. No real token/session. Runtime secret loader and grants require approval.'
},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:'PRIVATE_PLAN_PRESERVED_OR_CREATED',networkUsed:false,databaseUsed:false}));
