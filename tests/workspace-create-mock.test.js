const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {create}=require('../src/operations/create');
function pool(role,modules){const calls=[];const c={async beginTransaction(){},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},async execute(sql){calls.push(sql);if(sql.includes('FROM users'))return [[{id:1,name:'Synthetic User',role,is_active:1}]];if(sql.includes('FROM hd2_sessions'))return [[{token_hash:'synthetic'}]];if(sql.includes('FROM hd2_user_modules'))return [modules.map(module=>({module}))];if(sql.includes('FROM hd2_web_requests'))return [[]];return [{}];}};return {calls,async getConnection(){return c;}};}
test('all four workspaces create manual work through the same guarded API storage contract',async()=>{
 for(const module of ['TIAL','ASSUREN','B2B','REPLACEMENT']){
  const p=pool('HD',[module]);const result=await create(p,'synthetic-token',1,{requestId:randomUUID(),module,reference:'Synthetic reference',description:'Synthetic work'});
  assert.equal(result.status,'WAITING');assert.ok(p.calls.some(sql=>sql.includes('INSERT INTO hd2_orders')));assert.ok(p.calls.some(sql=>sql.includes('INSERT INTO hd2_audit')));assert.ok(!p.calls.some(sql=>sql.includes('hd2_courier_outbox')));assert.equal(p.calls.at(-1),'release');
 }
});
test('SHOW_ONLY and unassigned HD cannot create work or cause any mock INSERT',async()=>{
 for(const [role,modules] of [['SHOW_ONLY',['B2B']],['HD',['TIAL']]]){
  const p=pool(role,modules);await assert.rejects(create(p,'synthetic-token',1,{requestId:randomUUID(),module:'B2B',reference:'Synthetic',description:'Synthetic'}),{statusCode:403});assert.ok(!p.calls.some(sql=>sql.startsWith('INSERT')));assert.ok(p.calls.includes('rollback'));
 }
});
