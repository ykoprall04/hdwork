const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {validatePlan,loadCourierSecrets,clearSecrets}=require('../src/config/private-courier-env');
const now=1700000000000;
function plan(){return {enabled:true,receiveOnly:true,sendEnabled:false,ingestionWritesApproved:true,networkActivationApproved:true,newBotIsolationConfirmed:true,approvalUntil:new Date(now+60000).toISOString(),botId:'synthetic-new',botUsername:'SyntheticNewBot',port:3091,database:{host:'127.0.0.1',port:3306,name:'hdwork2',user:'hdwork_courier'},tokenDpapiFile:'.local/courier-secrets/courier-token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/courier-service-key.dpapi',identityKeyDpapiFile:'.local/courier-secrets/courier-identity-key.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/courier-db-password.dpapi',journalDirectory:path.join(os.tmpdir(),'hdwork-synthetic-new','journal'),lockDirectory:path.join(os.tmpdir(),'hdwork-synthetic-new','lock'),groups:[{chatId:'-1007001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order']} ]};}
function read(file){if(file.includes('courier-token'))return Promise.resolve('123456789:'+ 'S'.repeat(35));return Promise.resolve(file.includes('identity')?'synthetic-identity-only-00000000000000':file.includes('service')?'synthetic-service-only-000000000000000':'synthetic-db-only');}
test('incomplete/non-approved/expired/unsafe plan is refused before any decryption',async()=>{
 for(const patch of [{enabled:false},{sendEnabled:true},{networkActivationApproved:false},{ingestionWritesApproved:false},{newBotIsolationConfirmed:false},{approvalUntil:new Date(now-1).toISOString()},{database:{...plan().database,user:'root'}},{tokenDpapiFile:'.local/old-token.dpapi'},{token:'plaintext'},{lockDirectory:plan().journalDirectory}]){
  let calls=0;await assert.rejects(loadCourierSecrets({...plan(),...patch},{kind:'backend',now,readSecret:async()=>calls++}));assert.equal(calls,0);
 }
});
test('backend loader decrypts only its three secrets and forces receive/worker with outbox disabled',async()=>{
 const calls=[],env=await loadCourierSecrets(plan(),{kind:'backend',now,readSecret:file=>{calls.push(file);return read(file);}});
 assert.equal(calls.length,3);assert.ok(calls.every(f=>!f.includes('courier-token')));assert.equal(env.COURIER_TELEGRAM_BOT_TOKEN,undefined);assert.equal(env.COURIER_OUTBOX_ENABLED,'false');assert.equal(env.COURIER_DB_USER,'hdwork_courier');clearSecrets(env);assert.equal(env.COURIER_DB_PASSWORD,undefined);
});
test('Python loader receives only bot token and HMAC, with no database or business key',async()=>{
 const calls=[],env=await loadCourierSecrets(plan(),{kind:'python',now,readSecret:file=>{calls.push(file);return read(file);}});
 assert.equal(calls.length,2);assert.equal(env.COURIER_DB_PASSWORD,undefined);assert.equal(env.COURIER_IDENTITY_KEY,undefined);assert.equal(env.COURIER_POLL_ENABLED,'true');assert.equal(env.COURIER_SEND_ENABLED,'false');assert.equal(env.COURIER_PRIVATE_CONTROL_STDIN,'true');clearSecrets(env);assert.equal(env.COURIER_TELEGRAM_BOT_TOKEN,undefined);
});
test('invalid secrets fail with sanitized errors and no fallback or generated credential',async()=>{
 await assert.rejects(loadCourierSecrets(plan(),{kind:'backend',now,readSecret:async()=> 'short'}),{code:'PRIVATE_COURIER_REJECTED'});
 await assert.rejects(loadCourierSecrets(plan(),{kind:'python',now,readSecret:async()=>{throw Error('synthetic-sensitive-detail');}}),error=>error.code==='PRIVATE_COURIER_REJECTED'&&!error.message.includes('synthetic-sensitive-detail'));
 assert.equal(validatePlan(plan(),{now}),now+60000);
});
