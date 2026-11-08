const test=require('node:test'),assert=require('node:assert/strict');
const {dryRun}=require('../src/courier/dry-run');const fixture=require('../ops/examples/courier-dry-run.fixture.json');
test('dry-run parses supported transaction formats with no network/DB and no sensitive projection',()=>{
 const result=dryRun(fixture);assert.equal(result.accepted,4);assert.equal(result.sentMessages,0);assert.equal(result.networkUsed,false);assert.equal(result.databaseUsed,false);assert.deepEqual(Object.keys(result.commands),['order','req','config_psb','mo']);
 const serialized=JSON.stringify(result);for(const value of ['QA-AOi123','000123','SYNTHETIC','-1009001'])assert.ok(!serialized.includes(value));
});
test('dry-run detects replay and rejects unsupported manual-workspace commands without a sender',()=>{
 const base=fixture.events[0],result=dryRun({...fixture,events:[base,base,{...base,update_id:'50',event:{...base.event,text:'/ASSUREN fixture'}}]});assert.equal(result.accepted,1);assert.equal(result.replayedUpdates,1);assert.equal(result.rejected,1);assert.equal(result.sentMessages,0);
});
