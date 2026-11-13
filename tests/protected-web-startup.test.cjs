const test=require('node:test'),assert=require('node:assert/strict'),{simulate}=require('./helpers/protected-startup-mock.cjs');
const stages=['CONFIG','BOOTSTRAP','API_CONFIG','OPERATIONAL_POOLS','TESTING_RUNTIME','LOCAL_WEB','READY_STATE'];
for(const stage of stages)test('mock startup reports '+stage,async()=>{
 const r=await simulate(stage);assert.deepEqual(r.frames,[{status:'FAILED',code:`WEB_STAGE_${stage}_FAILED`}]);assert.equal(r.exitCode,1);
 if(stages.indexOf(stage)>=2){assert.equal(r.env.DB_PASSWORD,undefined);assert.equal(r.env.JWT_SECRET,undefined);assert.ok(Object.values(r.secrets).every(v=>v===''));}
});
test('cleanup failure preserves the original startup code',async()=>{const r=await simulate('LOCAL_WEB','EADDRINUSE',true);assert.deepEqual(r.frames,[{status:'FAILED',code:'EADDRINUSE'}]);});
test('unknown codes do not expose secrets',async()=>{const r=await simulate('CONFIG','SYNTHETIC_SECRET_DO_NOT_RECORD');assert.deepEqual(r.frames,[{status:'FAILED',code:'WEB_STAGE_CONFIG_FAILED'}]);});
test('arbitrary ER codes cannot smuggle secrets into stderr',async()=>{const r=await simulate('LOCAL_WEB','ER_SYNTHETIC_SECRET_DO_NOT_RECORD');assert.deepEqual(r.frames,[{status:'FAILED',code:'WEB_STAGE_LOCAL_WEB_FAILED'}]);});
test('recognized database errors preserve their code',async()=>{const r=await simulate('OPERATIONAL_POOLS','ER_ACCESS_DENIED_ERROR');assert.deepEqual(r.frames,[{status:'FAILED',code:'ER_ACCESS_DENIED_ERROR'}]);});
test('successful mock startup emits no failure',async()=>{const r=await simulate();assert.deepEqual(r.frames,[]);assert.equal(r.exitCode,undefined);});
