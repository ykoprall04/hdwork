const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),vm=require('node:vm');
const jwt=require('jsonwebtoken');
const {createOrderReader,filters,actions}=require('../src/b2c-read/orders');
const id='00000000-0000-4000-8000-000000000001';
const sample=()=>({id,module:'TIAL',date:'2026-11-08',status:'WAITING',sc_in:'SC-SYNTHETIC',inet:'000000000001',received_at:'2026-11-08T00:00:00Z',started_at:null,finished_at:null,telegram_chat_id:'private',payload:'private',password:'private'});
function poolFixture(rows=[sample()]) {
 const calls=[],events=[]; let fail=false;
 return {calls,events,set fail(v){fail=v;},async getConnection(){events.push('connection');return {
   async query(sql){calls.push([sql,[]]);}, async beginTransaction(){events.push('begin');},async commit(){events.push('commit');},async rollback(){events.push('rollback');},release(){events.push('release');},
   async execute(sql,values){calls.push([sql,values]);if(fail)throw Error('SYNTHETIC_PRIVATE_DATABASE_ERROR');
    if(sql.includes('FROM hd2_audit'))return [rows];
    if(sql.includes('WHERE id=?'))return [rows.filter(r=>r.id===values[0])];
    return [rows.slice(values.at(-1),values.at(-1)+values.at(-2))];
   }
 }; } };
}
test('strict bounded query validation includes real calendar dates and rejects unsupported STO',()=>{
 for(const query of [{page:'0'},{page:'1001'},{limit:'51'},{page:['1']},{date:'2026-02-30'},{status:'CUSTOM'},{module:'OTHER'},{sto:'ABC'},{q:'x\n'},{unknown:'x'}]) assert.throws(()=>filters(query));
 assert.equal(filters({}).limit,25);assert.equal(filters({page:'1000',limit:'50'}).page,1000);
});
test('list uses bound literal search, business date, stable ordering and bounded lookahead, not staging',async()=>{
 const pool=poolFixture(Array.from({length:3},(_,i)=>({...sample(),id:`${id.slice(0,-1)}${i+1}`})));
 const reader=createOrderReader(pool);
 const first=await reader.list({module:'TIAL',date:'2026-11-08',status:'FINISHED',q:'SC%_=',limit:'2'});
 assert.equal(first.data.length,2);assert.equal(first.hasMore,true);assert.equal(first.source,'HDWORK2');assert.equal(first.dateBasis,'telegram_business_day_jakarta');
 const [sql,params]=pool.calls.find(([sql])=>sql.includes('FROM hd2_orders'));
 assert.match(sql,/business_day=\?/);assert.match(sql,/status IN \('DONE','FAILED'\)/);assert.match(sql,/ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?/);
 assert.deepEqual(params,['TIAL','2026-11-08','%SC=%=_==%','%SC=%=_==%',3,0]);
 assert.doesNotMatch(sql,/staging|hd_b2c|SELECT \*/i); assert.equal(pool.calls[0][0],'SET TRANSACTION READ ONLY');
 const second=await reader.list({page:'2',limit:'2'});assert.equal(second.data.length,1);assert.equal(second.hasMore,false);
 assert.deepEqual(first.actions,actions);assert.equal(first.data[0].inetMasked,'••••0001');
 for(const field of ['inet','payload','password','telegram_chat_id','chat_id','message_id','last_actor_id'])assert.equal(Object.hasOwn(first.data[0],field),false);
});
test('empty, detail not found, validation and sanitized history projection',async()=>{
 const empty=createOrderReader(poolFixture([]));assert.deepEqual((await empty.list({})).data,[]);await assert.rejects(empty.detail(id),{statusCode:404});await assert.rejects(empty.detail('not-an-id'),{statusCode:400});
 const pool=poolFixture([{...sample(),action:'STATUS_CHANGED',from_status:'WAITING',to_status:'IN_PROGRESS',at:'2026-11-08T00:00:00Z',actor_id:'private',detail:'sensitive-reason'}]);
 const reader=createOrderReader(pool);assert.equal((await reader.detail(id)).data.id,id);
 const result=await reader.history(id,{});assert.equal(result.data[0].toStatus,'IN_PROGRESS');
 assert.deepEqual(Object.keys(result.data[0]),['id','action','fromStatus','toStatus','at']);
 assert.equal(pool.calls.some(([sql])=>sql.includes('detail')||sql.includes('actor_id')),false);
 pool.fail=true;await assert.rejects(reader.list({}));assert.equal(pool.events.at(-2),'rollback');assert.equal(pool.events.at(-1),'release');
});
function routeFixture() {
 let current={id:1,role:'SUPER_ADMIN',is_active:1},checks=0;
 const pool=poolFixture(),env={DB_NAME:'hdwork2',B2C_WORKFLOW_READ_ENABLED:'true',JWT_SECRET:'synthetic-unit-key-only'};
 const router={stack:[],use(...args){this.stack.push(['use',...args]);},get(...args){this.stack.push(['get',...args]);}};
 const authModule={exports:{}};
 vm.runInNewContext(fs.readFileSync('src/middlewares/auth.middleware.js','utf8'),{module:authModule,require:name=>{assert.equal(name,'jsonwebtoken');return jwt;},process:{env},console:{log(){}}});
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync('src/b2c-read/routes.js','utf8'),{module,process:{env},require:name=>{
  if(name==='express')return {Router:()=>router};
  if(name==='../middlewares/auth.middleware')return authModule.exports;
  if(name==='../repositories/auth.repository')return {async findAccessById(){checks++;return current;}};
  if(name==='../config/database')return pool;
  if(name==='./orders')return require('../src/b2c-read/orders');
  if(name==='../middlewares/api-rate-limit')return require('../src/middlewares/api-rate-limit');
  throw Error('Unexpected dependency '+name);
 }});
 async function request({claims={id:1,role:'SUPER_ADMIN'},token,route='/',query={},params={}}={}) {
  let status=200,body,done=false;const headers={};
  const req={headers:{authorization:token===null?undefined:`Bearer ${token||jwt.sign(claims,env.JWT_SECRET,{expiresIn:'5m'})}`},query,params};
  const res={set(k,v){headers[k]=v;},status(code){status=code;return this;},json(value){body=value;done=true;}};
  for(const entry of router.stack){if(done)break;if(entry[0]==='get' && entry[1]!==route)continue;const handler=entry[0]==='use'?entry[1]:entry[2];let next=false;await handler(req,res,()=>{next=true;});if(!next&&!done)throw Error('Unexpected handler completion');}
  return {status,body,headers};
 }
 return {request,pool,env,router,set account(value){current=value;},get checks(){return checks;}};
}
test('JWT required; role/current active account checked before any order read',async()=>{
 const f=routeFixture();assert.equal((await f.request({token:null})).status,401);assert.equal((await f.request({token:'invalid'})).status,401);
 assert.equal((await f.request({claims:{id:1,role:'HD'}})).status,403);assert.equal(f.pool.events.length,0);
 f.account={id:1,role:'SUPER_ADMIN',is_active:0};assert.equal((await f.request()).status,403);
 f.account={id:1,role:'HD',is_active:1};assert.equal((await f.request()).status,403);
 f.account=null;assert.equal((await f.request()).status,403);assert.equal(f.pool.events.length,0);
 f.account={id:1,role:'SUPER_ADMIN',is_active:1};const result=await f.request();assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(f.checks,4);
});
test('disabled or wrong database fails closed, errors never disclose dependency details, no mutation routes',async()=>{
 const f=routeFixture();f.env.B2C_WORKFLOW_READ_ENABLED='false';assert.equal((await f.request()).status,503);assert.equal(f.checks,0);
 f.env.B2C_WORKFLOW_READ_ENABLED='true';f.env.DB_NAME='legacy';assert.equal((await f.request()).status,503);assert.equal(f.checks,0);
 f.env.DB_NAME='hdwork2';assert.equal((await f.request({query:{limit:'999'}})).status,400);assert.equal(f.pool.events.length,0);
 assert.equal((await f.request({route:'/:id',params:{id}})).status,200);
 assert.equal((await f.request({route:'/:id/history',params:{id}})).status,200);
 f.pool.fail=true;const result=await f.request();assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.body),/SYNTHETIC|DATABASE_ERROR|SELECT|mysql/i);
 assert.deepEqual(f.router.stack.filter(r=>r[0]!=='use').map(r=>r[0]),['get','get','get']);
});
test('authenticated account quota applies without trusting caller IP headers',async()=>{
 const f=routeFixture();for(let i=0;i<60;i++)assert.equal((await f.request()).status,200);
 assert.equal((await f.request()).status,429);assert.equal(f.checks,61);
});
