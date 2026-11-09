// Offline review only. Never changes a service environment or starts anything.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function run(argv=process.argv.slice(2)){
 if(argv.length!==5||argv[0]!=='--prepare'||argv[1]!=='--environment'||argv[3]!=='--output')throw Error('EXPECTED_PREPARE_ENVIRONMENT_OUTPUT');
 const input=path.resolve(argv[2]),output=path.resolve(argv[4]);
 if(path.basename(input)!=='environment.json'||path.basename(path.dirname(input))!=='service'||input===output)throw Error('EXPECTED_NON_SECRET_SERVICE_ENVIRONMENT');
 const service=path.dirname(input);if(output===service||output.startsWith(service+path.sep)||output.endsWith('.env')||output.endsWith('.bak'))throw Error('OUTPUT_MUST_BE_OUTSIDE_SERVICE');
 const stat=await fs.lstat(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('ENVIRONMENT_FILE_REJECTED');
 const raw=await fs.readFile(input),env=JSON.parse(raw.toString('utf8'));
 // Existing environment contains names/paths; actual secrets remain in the untouched DPAPI bundle.
 if(Object.keys(env).some(k=>/(PASSWORD|TOKEN|SECRET|SERVICE_KEY|IDENTITY_KEY)$/.test(k)&&!k.endsWith('_DPAPI_FILE')))throw Error('PLAINTEXT_SECRET_FIELDS_REJECTED');
 const result=require('../src/config/live-chat-activation').prepare(env);
 const review={status:'REVIEW_ONLY_NOT_ACTIVATED',environmentSha256:createHash('sha256').update(raw).digest('hex'),patch:result.patch,changes:result.changes,requires:['schema 012/013 and exact chatRead/chatWrite grants verified','current backend source supports chat','dedicated Courier database routing/chat and verified mapping','approved web restart and controlled Telegram verification'],backendRestarted:false,databaseAccessed:false,telegramAccessed:false};
 await fs.writeFile(output,JSON.stringify(review,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:review.status,output,changedFlags:review.changes.map(c=>c.key)}));return review;
}
if(require.main===module)run().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'LIVE_CHAT_PREPARATION_FAILED');process.exitCode=1;});
module.exports={run};
