const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {reader}=require('../src/operations/read');
const {reviewGrants}=require('../src/access/database-audit');

test('integrated detail keeps imported IDs, Buffer JSON, actual actors and correlated delivery metadata',async()=>{
 const id='01234567-89ab-1def-8123-456789abcdef';
 const queries=[];
 const c={async query(){},async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,p){
  queries.push({sql,p});
  if(sql.includes('JOIN hd2_courier_outbox')){
   assert.deepEqual(p,[id]);
   return [[{order_id:id,id:'delivery',state:'SENT',telegram_message_id:'123'}]];
  }
  if(sql.includes('FROM hd2_audit'))return [[{id:'event',action:'DONE',to_status:'DONE',name:'Current display name',detail:Buffer.from(JSON.stringify({actorName:'Original finisher',note:'Checked'})),at:'2026-11-09T01:00:00Z'}]];
  assert.ok(p.includes('TIAL'));
  return [[{id,command:'order',module:'TIAL',status:'DONE',sc_in:'SC123',telegram_timestamp:1794186000,owner_name:'Actual owner',final_name:'Actual finisher',command_fields:Buffer.from(JSON.stringify({'SC/IN':'SC123','NO INET':'123456789'})),version:2}]];
 }};
 const result=await reader({async getConnection(){return c;}}).detail(id,{id:1,modules:['TIAL']});
 assert.equal(result.data.id,id);
 assert.equal(result.data.ownerName,'Actual owner');
 assert.equal(result.data.finalName,'Actual finisher');
 assert.equal(result.fields['SC/IN'],'SC123');
 assert.ok(!result.fields['NO INET'].includes('123456789'));
 assert.equal(result.history[0].actor,'Original finisher');
 assert.equal(result.history[0].note,'Checked');
 assert.deepEqual(result.data.feedback,{status:'TERKIRIM',deliveryId:'delivery',errorCode:null});
 assert.equal(queries.length,3);
});

test('manual account grants satisfy writable approval policy and are rejected by session-only policy',()=>{
 const sql=fs.readFileSync('ops/examples/hdwork2-account-management-grants.review.sql','utf8').replace(/^--.*$/mg,'');
 const rows=sql.split(';').map(s=>s.trim()).filter(Boolean).map(grant=>({grant}));
 assert.equal(reviewGrants(rows,{accountManagement:true}).ok,true);
 assert.equal(reviewGrants(rows).ok,false);
 assert.equal(reviewGrants(rows.slice(0,-1),{accountManagement:true}).ok,false);
 assert.doesNotMatch(sql,/\*|WITH GRANT OPTION|CREATE USER|ALTER|DROP/i);
});
