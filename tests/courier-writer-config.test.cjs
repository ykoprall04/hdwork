const test=require('node:test'),assert=require('node:assert/strict');
const {bots}=require('../src/config/courier-writer');
const {profiles}=require('../src/config/live-chat-activation');
const cli=require('../scripts/control-courier-writer');
test('writer scope validates strictly; absent scope leaves legacy profile unchanged',()=>{
 assert.deepEqual(bots({}),[]);assert.equal(profiles({}).write,'write');
 for(const raw of ['null','{}','["bot-a","bot-a"]','["BOT-A"]','[1]','invalid'])assert.throws(()=>bots({HDWORK2_COURIER_WRITER_V2_BOTS_JSON:raw}));
 const env={HDWORK2_COURIER_WRITER_V2_BOTS_JSON:'["bot-a"]'};assert.throws(()=>profiles(env));
 assert.equal(profiles({...env,HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_SYSTEM_MONITORING_ENABLED:'true'}).write,'chatWriteFifo');
});
test('fence mutation CLI defaults PLAN without loading session, credentials or services',async()=>{
 const result=await cli.main(['--action','close','--bot','bot-a','--epoch','3','--session','must-never-load.cjs']);assert.equal(result.status,'PLAN_ONLY');assert.equal(result.productionChanged,false);
 assert.throws(()=>cli.options(['--bot','bot-a','--bot','bot-b']));
});
test('operator approval binds bot, action, epoch, account, session hash, reason and expiry',()=>{
 const o={botId:'bot-a',action:'close',expectedEpoch:'3',operator:'Fixture',reason:'rehearsal',expectedAccount:'hdwork_ops_write@localhost',sessionSha256:'a'.repeat(64),runtimeConfigFile:require('node:path').resolve('fixture-runtime.json'),runtimeConfigSha256:'c'.repeat(64)};
 const a={...o,kind:'HDWORK2_WRITER_FENCE_APPROVAL',approved:true,expiresAtUtc:new Date(Date.now()+60000).toISOString()};assert.doesNotThrow(()=>cli.approve(o,a));
 for(const [key,value] of Object.entries({botId:'bot-b',action:'open',expectedEpoch:'5',operator:'Other',reason:'different',expectedAccount:'root@localhost',sessionSha256:'b'.repeat(64),runtimeConfigFile:'changed.json',runtimeConfigSha256:'d'.repeat(64),expiresAtUtc:'2000-01-01T00:00:00Z'}))assert.throws(()=>cli.approve(o,{...a,[key]:value}));
});
test('production session rejects unpinned input before loading DB driver or decrypting anything',async()=>{
 await assert.rejects(require('../scripts/lib/production-courier-writer-session.cjs').create({runtimeConfigFile:'relative.json',runtimeConfigSha256:'0'.repeat(64)}),/PINNED_WINDOWS_RUNTIME_REQUIRED/);
});
