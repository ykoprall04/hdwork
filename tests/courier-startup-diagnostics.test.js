const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {run}=require('../scripts/diagnose-production-courier');
const groups=[{chatId:'-100111',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req']},{chatId:'-100222',threadId:null,threadMode:'non_topic',profile:'TIAL2',commands:['order','req']},{chatId:'-100333',threadId:null,threadMode:'non_topic',profile:'SOLVER1',commands:['config_psb','mo']}];
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'courier-diagnostic-'));try{const bytes=JSON.stringify({botId:'synthetic',botUsername:'SyntheticBot',groups});const file=path.join(dir,'plan.json');fs.writeFileSync(file,bytes);return await fn({snapshot:path.resolve(__dirname,'..'),planFile:file,planSha256:createHash('sha256').update(bytes).digest('hex')});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('diagnostic exposes exact read-only Python phase and clears secret references without queue access',()=>fixture(async opts=>{
 const queries=[],secrets=[];let closed=false;
 const result=await run({...opts,report:()=>{},load:async()=>{const env={COURIER_DB_USER:'hdwork_courier',COURIER_SERVICE_KEY:'SYNTHETIC_DO_NOT_PRINT',COURIER_DB_PASSWORD:'SYNTHETIC_DO_NOT_PRINT',COURIER_TELEGRAM_BOT_TOKEN:'SYNTHETIC_DO_NOT_PRINT'};secrets.push(env);return env;},connect:async()=>({async query({sql}){
  queries.push(sql);assert.match(sql,/^(SELECT|SHOW) /);assert.doesNotMatch(sql,/hd2_courier_outbox|hd2_orders|\bpayload\b/);
  if(sql.startsWith('SELECT DATABASE'))return [[{db:'hdwork2',account:'hdwork_courier@localhost'}]];
  if(sql.startsWith('SHOW'))return [Object.entries(require('../src/config/operational-grants').policies.courierSendChat).map(([table,ps])=>({g:`GRANT ${ps.join(', ')} ON hdwork2.${table} TO synthetic`}))];
  return [groups.map(g=>({...g,category:g.profile==='SOLVER1'?'LOGIC':'TIAL'}))];
 },async end(){closed=true;}}),probe:async()=>({status:'SOURCE_TOKEN_FINGERPRINT_MISMATCH',phase:'JOURNAL_METADATA',untrustedExtra:'SYNTHETIC_DO_NOT_PRINT'})});
 assert.equal(result.status,'SOURCE_TOKEN_FINGERPRINT_MISMATCH');assert.equal(result.pollingPerformed,false);assert.equal(result.messagesSent,0);assert.equal(closed,true);assert.equal(queries.length,4);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_DO_NOT_PRINT/);assert.ok(secrets.every(s=>!s.COURIER_SERVICE_KEY&&!s.COURIER_TELEGRAM_BOT_TOKEN&&!s.COURIER_DB_PASSWORD));
}));
test('plan drift blocks before decryption, while raw decrypt exceptions remain private',()=>fixture(async opts=>{
 let loads=0;
 const bad=await run({...opts,planSha256:'0'.repeat(64),report:()=>{},load:async()=>{loads++;}});assert.equal(loads,0);assert.equal(bad.code,'APPROVED_PLAN_HASH_MISMATCH');
 const result=await run({...opts,report:()=>{},load:async()=>{throw Error('SYNTHETIC_SECRET_IN_ERROR');}});assert.equal(result.phase,'BACKEND_SECRETS');assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET_IN_ERROR/);
}));
