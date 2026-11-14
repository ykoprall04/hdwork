const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
function rows(role){return Object.entries(policies[role]).map(([t,ps])=>({grant:`GRANT ${ps.join(', ')} ON hdwork2.${t} TO synthetic`}));}
test('least-privilege grant profiles reject global, schema, role, account-management and cross-role grants',()=>{
 for(const role of ['read','write','courier']){
  const valid=rows(role);assert.equal(reviewOperationalGrants(valid,role).ok,true);assert.equal(reviewOperationalGrants(valid.slice(1),role).ok,false);
  for(const extra of ['GRANT SELECT ON *.* TO x','GRANT SELECT ON hdwork2.* TO x','GRANT SELECT ON unexpected.orders TO x','GRANT SELECT ON hdwork2.users TO x','GRANT UPDATE ON hdwork2.users TO x','GRANT USAGE ON *.* TO x WITH GRANT OPTION','GRANT `an_inherited_role`@`localhost` TO x'])assert.equal(reviewOperationalGrants([...valid,{grant:extra}],role).ok,false);
 }
 assert.equal(require('../src/access/database-audit').reviewGrants([{grant:'GRANT USAGE ON *.* TO x WITH GRANT OPTION'}]).unsafeScopeOrPrivilege,true);
 assert.equal(policies.courier.hd2_courier_outbox,undefined);assert.equal(reviewOperationalGrants(rows('courierSend'),'courier').ok,false);
});
test('review SQL exactly covers the three pool policies and grants no password-hash access to operations',()=>{
 const sql=fs.readFileSync('ops/examples/hdwork2-operational-grants.review.sql','utf8').replace(/^--.*$/mg,'');
 for(const [role,user] of Object.entries({read:'hdwork_ops_read',write:'hdwork_ops_write',courier:'hdwork_courier'})){
  const grants=sql.split(';').map(s=>s.trim()).filter(s=>s.includes("TO '"+user+"'" )).map(grant=>({grant}));assert.equal(reviewOperationalGrants(grants,role).ok,true,role);
 }
 assert.doesNotMatch(sql,/password_hash|CREATE USER|DROP |ALTER |FLUSH PRIVILEGES|WITH GRANT OPTION|hd_b2c/i);
 const create=fs.readFileSync('src/operations/create.js','utf8');assert.match(create,/FROM users WHERE id=\? FOR SHARE/);assert.doesNotMatch(create,/UPDATE users/);
});

test('feedback read grants expose delivery metadata without payloads or settlement tokens',()=>{
 const valid=rows('read');for(const table of ['hd2_courier_outbox','hd2_web_requests'])assert.equal(reviewOperationalGrants([...valid,{grant:`GRANT SELECT ON hdwork2.${table} TO synthetic`}],'read').ok,false);
 const columns=policies.read.hd2_courier_outbox.join(' ');assert.ok(!columns.includes('payload'));assert.ok(!columns.includes('lease_token'));assert.ok(columns.includes('state'));
});
