// File-only preparation. Reuses verified identity/secret references, never decrypts them.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {operatorJson}=require('../src/config/operator-json');
const {validate}=require('../src/config/production-courier');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function build({sourcePlan,routingReview,verification,activationNotBefore,journalDirectory,repo=path.resolve(__dirname,'..')}={}){
 if(!sourcePlan||['token','password','serviceKey','identityKey','telegramToken'].some(k=>Object.hasOwn(sourcePlan,k))||Object.hasOwn(sourcePlan.database||{},'password'))throw Error('PLAINTEXT_COURIER_SECRET_REJECTED');
 const routes=require('../src/config/live-chat-production').routing(routingReview);
 if(verification.status!=='ROUTING_VERIFIED_NO_MESSAGES'||verification.webhookConfigured!==false||
   verification.internalBotId!==sourcePlan.botId||sourcePlan.botUsername.replace(/^@/,'')!==verification.botUsername||
   routes.botIdentities.length!==1||routes.botIdentities[0].botId!==sourcePlan.botId||
   !verification.groups||verification.groups.length!==3||verification.groups.some(g=>g.status!=='PASS')||
   routes.targets.length!==3||routes.targets.some(t=>t.botId!==verification.internalBotId||t.botUsername!==verification.botUsername||!verification.groups.some(g=>g.profile===t.profile&&g.chatId===t.chatId&&g.threadId===t.threadId)))throw Error('MATCHING_VERIFIED_PRODUCTION_ROUTING_REQUIRED');
 return validate({version:1,environment:'production',secretRoot:path.resolve(repo),telegramBotId:String(verification.telegramBotId),botId:sourcePlan.botId,botUsername:verification.botUsername,port:sourcePlan.port,
  groups:routes.targets.map(t=>({chatId:t.chatId,threadId:t.threadId,threadMode:t.threadId===null?'non_topic':'thread',profile:t.profile,commands:t.commands})),
  tokenDpapiFile:sourcePlan.tokenDpapiFile,serviceKeyDpapiFile:sourcePlan.serviceKeyDpapiFile,identityKeyDpapiFile:sourcePlan.identityKeyDpapiFile,dbPasswordDpapiFile:sourcePlan.dbPasswordDpapiFile,
  sourceJournalDirectory:sourcePlan.journalDirectory,lockDirectory:sourcePlan.lockDirectory,journalDirectory,activationNotBefore},{repo});
}
function read(file){const absolute=path.resolve(file),stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024*1024||fs.realpathSync(absolute)!==absolute)throw Error('REGULAR_PREPARATION_INPUT_REQUIRED');return fs.readFileSync(absolute);}
function main(argv=process.argv.slice(2)){
 const args={};for(let i=0;i<argv.length;i+=2){if(!['--source-plan','--routing','--verification','--activation-not-before','--new-journal','--output'].includes(argv[i])||args[argv[i]]||!argv[i+1])throw Error('EXPLICIT_PREPARATION_ARGUMENTS_REQUIRED');args[argv[i]]=argv[i+1];}
 if(Object.keys(args).length!==6)throw Error('ALL_PRODUCTION_PLAN_INPUTS_REQUIRED');
 const source=read(args['--source-plan']),report=read(args['--verification']),routes=read(args['--routing']);
 const verification=operatorJson(report);if(sha(source)!==verification.internalIdSourceHash)throw Error('VERIFIED_SOURCE_PLAN_CHANGED');
 const plan=build({sourcePlan:operatorJson(source),routingReview:operatorJson(routes),verification,activationNotBefore:args['--activation-not-before'],journalDirectory:args['--new-journal']});
 const bytes=JSON.stringify(plan,null,2)+'\n';
 fs.writeFileSync(path.resolve(args['--output']),bytes,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'PRODUCTION_COURIER_PLAN_PREPARED_NOT_STARTED',planSha256:sha(bytes),sourceSha256:sha(source),verificationSha256:sha(report),databaseAccessed:false,telegramAccessed:false}));
}
if(require.main===module){try{main();}catch{console.error('PRODUCTION_COURIER_PLAN_PREPARATION_FAILED');process.exitCode=1;}}
module.exports={build,main};
