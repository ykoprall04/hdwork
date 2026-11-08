const test=require('node:test'),assert=require('node:assert/strict');
const {createManager,options}=require('../src/config/operational-pools');
const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
const {applyPrivatePoolPlan}=require('../src/config/private-pool-plan');
const {checkRuntimeDatabases}=require('../src/config/local-database-check');
function grants(role){return Object.entries(policies[role]).map(([table,ps])=>({grant:`GRANT ${ps.join(', ')} ON \`hdwork2\`.\`${table}\` TO 'synthetic'@'localhost'`}));}
function env(){return {HDWORK2_LOCAL_READ_ONLY:'true',OP_READ_ENABLED:'true',OP_READ_DB_HOST:'127.0.0.1',OP_READ_DB_PORT:'3306',OP_READ_DB_NAME:'hdwork2',OP_READ_DB_USER:'hdwork_ops_read',OP_READ_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-read-password.dpapi'};}
function fixture(config=env(),wrong={}){const calls=[],instances=[];const manager=createManager({env:config,readSecret:async file=>{calls.push('decrypt:'+file);return 'synthetic-memory-only';},createPool:opts=>{
 const role=opts.user==='hdwork_ops_read'?'read':'write';assert.equal(opts.password,'synthetic-memory-only');assert.equal(opts.database,'hdwork2');
 const raw={async query(sql){calls.push([role,sql]);if(sql.startsWith('SELECT')&&sql.includes('CURRENT_USER'))return [[{db:wrong.db||'hdwork2',account:wrong.account||opts.user+'@localhost'}]];if(sql.startsWith('SHOW GRANTS'))return [wrong.grants||grants(role)];return [[]];},async execute(sql){calls.push([role,sql]);return [[]];},async getConnection(){return {...raw,async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy(){}};},async end(){calls.push(role+':closed');}};instances.push(raw);return raw;
 }});return {manager,calls,instances};}
test('read pool has its own credential/account and refuses SQL writes before driver calls',async()=>{
 const {manager,calls}=fixture();await manager.initialize();assert.deepEqual(manager.status(),{read:true,write:false});
 const read=manager.get('read');await read.execute('SELECT id FROM hd2_orders');const before=calls.length;
 for(const sql of ['INSERT INTO hd2_orders VALUES (?)','SELECT * FROM hd2_orders FOR UPDATE','SELECT 1; DELETE FROM users'])assert.throws(()=>read.execute(sql));
 assert.equal(calls.length,before);assert.throws(()=>manager.get('write'));await manager.close();assert.ok(calls.includes('read:closed'));
});
test('pool startup rejects wrong account/schema and overbroad grants then closes created pools',async()=>{
 for(const wrong of [{db:'unexpected'},{account:'root@localhost'},{grants:[...grants('read'),{grant:'GRANT SELECT ON *.* TO x'}]}]){
  const {manager,calls}=fixture(env(),wrong);await assert.rejects(manager.initialize(),{code:'OPERATIONAL_POOL_REJECTED'});assert.deepEqual(manager.status(),{read:false,write:false});assert.ok(calls.includes('read:closed'));
 }
 for(const patch of [{OP_READ_DB_USER:'root'},{OP_READ_DB_NAME:'unexpected'},{OP_READ_DB_HOST:'external'},{OP_READ_DB_PASSWORD:'plaintext'}])assert.throws(()=>options('read',{...env(),...patch}));
});
test('write pool requires separate approval and is blocked immediately when read-only returns',async()=>{
 const config={...env(),OP_WRITE_ENABLED:'true',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-write-password.dpapi'};
 const blocked=fixture(config);await assert.rejects(blocked.manager.initialize());assert.equal(blocked.calls.filter(c=>typeof c==='string'&&c.includes('ops-write')).length,0);
 config.HDWORK2_LOCAL_READ_ONLY='false';config.HDWORK2_OPERATIONAL_WRITE_APPROVED='true';const {manager}=fixture(config);await manager.initialize();const c=await manager.get('write').getConnection();await c.execute('UPDATE hd2_orders SET status=?',['DONE']);config.HDWORK2_LOCAL_READ_ONLY='true';assert.throws(()=>c.execute('UPDATE hd2_orders SET status=?',['FAILED']));assert.throws(()=>manager.get('write'));await c.rollback();c.release();await manager.close();
});
test('private pool plan adds only nonsecret settings and rejects conflicting credentials',()=>{
 const config={};const plan={read:{enabled:true,user:'hdwork_ops_read',host:'127.0.0.1',port:3306,database:'hdwork2',passwordDpapiFile:'.local/database-secrets/ops-read-password.dpapi'},write:{enabled:false}};
 applyPrivatePoolPlan(config,plan);assert.equal(config.OP_READ_DB_USER,'hdwork_ops_read');assert.equal(config.OP_WRITE_ENABLED,undefined);assert.equal(config.OP_READ_DB_PASSWORD,undefined);
 assert.throws(()=>applyPrivatePoolPlan({...config,OP_READ_DB_USER:'root'},plan));assert.throws(()=>applyPrivatePoolPlan({}, {read:{...plan.read,password:'plaintext'}}));
});
test('readiness verifies auth and operational schema using different pools without operational password_hash access',async()=>{
 const authGrants=[...Object.entries({users:'SELECT',hd2_sessions:'SELECT, INSERT, UPDATE',hd2_security_audit:'INSERT',hd2_user_modules:'SELECT'}).map(([t,p])=>({grant:`GRANT ${p} ON hdwork2.${t} TO x`}))];
 const columns={users:['id','name','role','is_active','password_hash'],hd2_sessions:['token_hash','expires_at','revoked'],hd2_user_modules:['module'],hd2_security_audit:['action'],hd2_orders:['access_module','version','command_fields','raw_text','telegram_timestamp'],hd2_audit:['detail','user_id'],hd2_live_events:['module','kind']};
 function pool(role){return {async query(sql){if(sql.startsWith('SELECT')&&sql.includes('CURRENT_USER'))return [[{db:'hdwork2',account:'hdwork_auth@localhost'}]];if(sql.startsWith('SHOW GRANTS'))return [authGrants];if(sql==='SELECT DATABASE() AS name')return [[{name:'hdwork2'}]];return [Object.entries(columns).filter(([t])=>role==='auth'?['users','hd2_sessions','hd2_user_modules','hd2_security_audit'].includes(t):['users','hd2_user_modules','hd2_orders','hd2_audit','hd2_live_events'].includes(t)).flatMap(([TABLE_NAME,cs])=>cs.filter(c=>role==='auth'||c!=='password_hash').map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))];}};}
 assert.equal((await checkRuntimeDatabases({authPool:pool('auth'),readPool:pool('read'),operations:true})).scope,'operations');
});
module.exports={grants};
