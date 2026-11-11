const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {transition,filters,where}=require('../src/operations/policy');
const {createSlots,text}=require('../src/operations/export');
const {createLive}=require('../src/operations/live');
const hd={id:1,name:'Ermas Putri',role:'HD',is_active:1,modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO']};
const base={id:'x',command:'order',status:'WAITING',owner_user_id:null,final_user_id:null,duplicate_of:null,duplicate_decision:null};
test('PICK/takeover/done/failure/reopen policy, exact Telegram contracts and role ownership guards',()=>{
 assert.equal(transition(base,hd,{action:'PICK'}).text,'🟡 Data di cek Ermas Putri');
 const active={...base,status:'IN_PROGRESS',owner_user_id:1};
 assert.equal(transition(active,hd,{action:'DONE',confirm:true}).text,'✅ Done (ACTCOMP)\nJgn lupa VALINS after PS. Salam, Ermas Putri!');
 assert.equal(transition(active,hd,{action:'DONE',confirm:true,note:' checked '}).text,'✅ Done (ACTCOMP)\nchecked\nJgn lupa VALINS after PS. Salam, Ermas Putri!');
 for(const command of ['config_psb','mo','req']){assert.equal(transition({...active,command},hd,{action:'DONE',confirm:true}).text,'✅ Done');assert.equal(transition({...active,command},hd,{action:'DONE',confirm:true,note:'note'}).text,'✅ Done\nnote');}
 assert.equal(transition(active,hd,{action:'FAILED',confirm:true,note:' failed reason '}).text,'❌ failed reason');
 for(const note of ['', '   '])assert.throws(()=>transition(active,hd,{action:'FAILED',confirm:true,note}));
 assert.throws(()=>transition(active,{...hd,id:2},{action:'DONE',confirm:true}));
 const takeover=transition(active,{...hd,id:2,name:'New HD'},{action:'TAKEOVER'});assert.equal(takeover.next.owner_user_id,2);assert.equal(takeover.next.status,'IN_PROGRESS');assert.equal(takeover.text,'🟡 Data di cek New HD');assert.equal(takeover.next.resetStart,true);
 for(const role of ['ADMIN','SUPER_ADMIN','SHOW_ONLY'])assert.throws(()=>transition(base,{...hd,role},{action:'PICK'}),{statusCode:403});
 assert.throws(()=>transition(base,{...hd,is_active:0},{action:'PICK'}));assert.throws(()=>transition(base,{...hd,modules:['REQ']},{action:'PICK'}));
 for(const status of ['DONE','FAILED']){assert.throws(()=>transition({...active,status},hd,{action:'REOPEN'}));const reopened=transition({...active,status},hd,{action:'REOPEN',confirm:true});assert.equal(reopened.next.status,'IN_PROGRESS');assert.equal(reopened.text,null);assert.equal(reopened.next.clearFinish,true);}
});
test('duplicate decisions preserve canonical reference and support reject-active/reopen/re-decide',()=>{
 const duplicate={...base,status:'DUPLICATE',duplicate_of:'canonical'};
 const continued=transition(duplicate,hd,{action:'CONTINUE_DUPLICATE'});assert.equal(continued.next.status,'IN_PROGRESS');assert.equal(continued.next.duplicate_decision,'CONTINUE_CHECK');
 for(const order of [duplicate,{...duplicate,status:'IN_PROGRESS',owner_user_id:1,duplicate_decision:'CONTINUE_CHECK'}]){
 const rejected=transition(order,hd,{action:'REJECT_DUPLICATE'});assert.equal(rejected.text,'❌ Duplikat Order');assert.equal(rejected.next.status,'DUPLICATE');assert.equal(rejected.next.duplicate_decision,'REJECT_DUPLICATE');
 const reopened=transition({...order,...rejected.next},hd,{action:'REOPEN',confirm:true});assert.equal(reopened.text,null);assert.equal(reopened.next.duplicate_decision,null);assert.equal(reopened.next.status,'DUPLICATE');assert.equal(reopened.next.owner_user_id,null);
 }
 assert.throws(()=>transition(duplicate,hd,{action:'PICK'}));assert.equal(duplicate.duplicate_of,'canonical');
});
test('filters cover module scope, WIB calendar range, query escaping, own-order default and status dates',()=>{
 const f=filters({area:'TIAL',tab:'process',from:'2026-11-01',to:'2026-11-08'},hd);assert.deepEqual(f.allowed,['TIAL','REQ']);assert.equal(f.mine,true);
 const w=where(f,hd);assert.match(w.sql,/business_day BETWEEN/);assert.match(w.sql,/owner_user_id=\?/);assert.doesNotMatch(w.sql,/finished_at/);
 assert.throws(()=>filters({from:'2026-02-30',to:'2026-03-01'},hd));assert.throws(()=>filters({from:'2026-01-01'},hd));assert.throws(()=>filters({page:'0'},hd));
 const none=where(filters({area:'LOGIC'},{...hd,modules:['TIAL']}),hd);assert.match(none.sql,/IN \(''\)/);
});
test('export slots no queue, idempotent release and dangerous cells cannot become formulas',()=>{
 const slots=createSlots();const a=slots.take(),b=slots.take();assert.throws(()=>slots.take(),{statusCode:429});a();a();assert.equal(slots.count,1);const c=slots.take();b();c();assert.equal(slots.count,0);
 for(const value of ['=SUM(1,2)','+1','-1','@cmd',' \t=1'])assert.ok(text(value).startsWith("'"));assert.equal(text('normal'),'normal');
});
test('SSE filters modules, reconnect reset, stops revoked users and cleans subscriptions',async()=>{
 let rows=[],revoked=false;const pool={async execute(sql){return sql.includes('MAX')?[[{id:0}]]:[rows];}};
 const live=createLive({pool,authenticate:async()=>{if(revoked)throw Error();return {modules:['TIAL']};},interval:100000});
 class Res extends EventEmitter{constructor(){super();this.frames=[];}set(){}flushHeaders(){}write(value){this.frames.push(value);return true;}end(){this.ended=true;}}
 const res=new Res();live.open({},res,{id:1,modules:['TIAL']},'synthetic');await live.tick();
 rows=[{id:1,module:'LOGIC_MO',kind:'arrival'}];await live.tick();assert.equal(res.frames.some(f=>f.includes('LOGIC_MO')),false);
 rows=[{id:2,module:'TIAL',kind:'change'}];await live.tick();assert.ok(res.frames.some(f=>f.includes('"modules":["TIAL"]')));revoked=true;await live.tick();assert.equal(res.ended,true);live.close();
});
test('all HTTP mutation routes require CSRF before reaching storage',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const router={stack:[],use(...args){this.stack.push(['use',...args]);}};for(const method of ['get','post'])router[method]=(...args)=>router.stack.push([method,...args]);
 let checks=0;const module={exports:{}};
 vm.runInNewContext(fs.readFileSync('src/operations/routes.js','utf8'),{module,process:{env:{HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',DB_NAME:'hdwork2'}},require:n=>n==='express'?{Router:()=>router}:n==='../access/http'?{auth(){},csrf(){checks++;throw Object.assign(Error(),{statusCode:403});}}:n==='./policy'?require('../src/operations/policy'):n==='../middlewares/api-rate-limit'?{createRateLimit:()=>()=>{}}:(()=>{throw Error('Storage must not be reached');})()});
 for(const entry of router.stack.filter(r=>r[0]==='post')){let status;await entry[2]({user:{role:'HD'},params:{id:'x'},body:{},sessionToken:'synthetic'},{headersSent:false,status(code){status=code;return this;},json(){}});assert.equal(status,403);}
 assert.deepEqual(router.stack.filter(r=>r[0]==='post').map(r=>r[1]),['/orders','/orders/:id/actions','/exports','/exports/:id/cancel']);
 assert.equal(checks,4);
});
test('export ticket is single-session bound and unauthorized identities cannot inspect/cancel it',()=>{
 const {createExporter}=require('../src/operations/export');const exporter=createExporter({pool:{},authenticate(){}});const u={id:1,role:'HD',modules:['TIAL']};const job=exporter.ticket({},u,'session-one');
 assert.throws(()=>exporter.status(job.id,{...u,id:2},'session-one'),{statusCode:404});assert.throws(()=>exporter.cancel(job.id,u,'session-two'),{statusCode:404});assert.throws(()=>exporter.ticket({}, {...u,role:'SHOW_ONLY'},'session-one'),{statusCode:403});exporter.cancel(job.id,u,'session-one');assert.equal(exporter.slots.count,0);
});
test('workflow startup fails closed without cookie/schema prerequisites or in multi-instance settings',()=>{
 const {validateApiOnlyConfig}=require('../src/config/api-only-startup');const env={DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_USER:'synthetic',DB_PASSWORD:'synthetic',JWT_SECRET:'synthetic-operation-jwt-key-32bytes',FRONTEND_ORIGINS:'https://web.example',HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',B2C_COMMAND_SCHEMA_READY:'true'};
 assert.equal(validateApiOnlyConfig(env).database,'hdwork2');for(const change of [{HDWORK2_AUTH_V2:'false'},{B2C_COMMAND_SCHEMA_READY:'false'},{WEB_CONCURRENCY:'2'},{NODE_APP_INSTANCE:'1'}])assert.throws(()=>validateApiOnlyConfig({...env,...change}));
});
