const test=require('node:test'),assert=require('node:assert/strict');
const {dryRun}=require('../src/courier/dry-run');const fixture=require('../ops/examples/courier-dry-run.fixture.json');
test('dry-run parses supported transaction formats with no network/DB and no sensitive projection',()=>{
 const result=dryRun(fixture);assert.equal(result.accepted,4);assert.equal(result.sentMessages,0);assert.equal(result.networkUsed,false);assert.equal(result.databaseUsed,false);assert.deepEqual(Object.keys(result.commands),['order','req','config_psb','mo']);
 const serialized=JSON.stringify(result);for(const value of ['QA-AOi123','000123','SYNTHETIC','-1009001'])assert.ok(!serialized.includes(value));
});
test('dry-run detects replay and rejects unsupported manual-workspace commands without a sender',()=>{
 const base=fixture.events[0],result=dryRun({...fixture,events:[base,base,{...base,update_id:'50',event:{...base.event,text:'/ASSUREN fixture'}}]});assert.equal(result.accepted,1);assert.equal(result.replayedUpdates,1);assert.equal(result.rejected,1);assert.equal(result.sentMessages,0);
});
test('invalid routed orders are rejected without fields, crash, accepted counts or field coverage',()=>{
 const events=fixture.events.filter(body=>!body.event.text.startsWith('/req')).map((body,i)=>({...body,update_id:String(100+i),event:{...body.event,text:body.event.text.replace(/STO:[^\n]+/,'STO:-')}}));
 const result=dryRun({...fixture,events:[...events,events[0],fixture.events[1]]});
 assert.equal(result.rejected,3);assert.equal(result.replayedUpdates,1);assert.equal(result.accepted,1);assert.deepEqual(result.commands,{req:1});
 assert.deepEqual(result.fieldCoverage,{scIn:0,inet:0,sto:0,transaction:0});
 assert.equal(result.sentMessages,0);assert.equal(result.networkUsed,false);assert.equal(result.databaseUsed,false);
});
test('dry-run counts parsed transaction fields for order and MO',()=>{
 assert.equal(dryRun(fixture).fieldCoverage.transaction,2);
});
