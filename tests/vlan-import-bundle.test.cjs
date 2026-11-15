const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const {adapter}=require('../scripts/lib/vlan-import-session.cjs');
const env={HDWORK2_SERVICE_AUTH_POLICY:'operational-write',OP_WRITE_ENABLED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',OP_WRITE_DB_PASSWORD_DPAPI_FILE:'writer-reference',OP_READ_DB_PASSWORD_DPAPI_FILE:'reader-reference',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',VLAN_IMPORT_SERVER_UUID:'fixture-server'};
const bundle=()=>({authPassword:'fixture-auth',readPassword:'fixture-read',writePassword:'fixture-write',signingSecret:'s'.repeat(32)});
function fixture({settings=env,value=bundle(),identity={db:'hdwork2',account:'hdwork_ops_write@localhost',server_uuid:'fixture-server'}}={}){
 const stream=new PassThrough(),state={queries:0,releases:0,closed:0,pools:0};
 const session=adapter({env:settings,stream,createPool:opts=>{state.pools++;assert.equal(opts.user,'hdwork_ops_write');assert.equal(opts.password,'fixture-write');assert.equal(opts.multipleStatements,false);return {async getConnection(){return {async query(sql){assert.match(sql,/^SELECT DATABASE/);state.queries++;return [[identity]];},release(){state.releases++;}};},async end(){state.closed++;}};}});
 return {state,identity,async create(){const pending=session.create();stream.end(JSON.stringify(value)+'\n');return pending;}};
}
test('bundle mock: existing protected bootstrap supplies writer only; repeated acquisition rechecks identity',async()=>{
 const f=fixture(),s=await f.create();assert.equal(f.state.queries,1);
 const c=await s.pool.getConnection();c.release();assert.equal(f.state.queries,2);
 f.identity.account='hdwork_courier@localhost';await assert.rejects(s.pool.getConnection(),/VLAN_IMPORT_CONNECTION_REJECTED/);
 await s.close();assert.equal(f.state.closed,1);assert.equal(f.state.releases,3);
});
test('bundle mock: wrong database, account and UUID reject and close initial pool',async()=>{
 for(const change of [{db:'other'},{account:'hdwork_courier@localhost'},{server_uuid:'other'}]){
  const f=fixture({identity:{db:'hdwork2',account:'hdwork_ops_write@localhost',server_uuid:'fixture-server',...change}});
  await assert.rejects(f.create(),/VLAN_IMPORT_CONNECTION_REJECTED/);assert.equal(f.state.closed,1);
 }
});
test('bundle mock: missing/unauthorized writer, duplicate references, missing UUID and extra secrets fail closed',async()=>{
 const noWriter=bundle();delete noWriter.writePassword;
 for(const opts of [{value:noWriter},{value:{...bundle(),unexpectedSecret:'SENSITIVE_FIXTURE_MARKER'}},{settings:{...env,HDWORK2_SERVICE_AUTH_POLICY:'readonly'}},{settings:{...env,OP_READ_DB_PASSWORD_DPAPI_FILE:'writer-reference'}},{settings:{...env,VLAN_IMPORT_SERVER_UUID:''}}]){
  const f=fixture(opts);await assert.rejects(f.create(),e=>e.message==='VLAN_IMPORT_CONNECTION_REJECTED');assert.equal(f.state.pools,0);
 }
});
test('bundle mock: dormant trial bundle remains accepted by existing validator',async()=>{
 const f=fixture({value:{...bundle(),testingWritePassword:'fixture-trial',testingTelegramToken:'123456:'+ 'a'.repeat(35)}}),s=await f.create();await s.close();assert.equal(f.state.pools,1);
});
test('callback mock: existing scoped writer callback still works without consuming stdin',async()=>{
 let requested;const stream=new PassThrough();const s=await adapter({env,stream,readSecret:async ref=>{requested=ref;return 'fixture-write';},createPool:()=>({async getConnection(){return {async query(){return [[{db:'hdwork2',account:'hdwork_ops_write@localhost',server_uuid:'fixture-server'}]];},release(){}};},async end(){}})}).create();assert.equal(requested,'writer-reference');assert.equal(stream.listenerCount('data'),0);await s.close();stream.destroy();
});
