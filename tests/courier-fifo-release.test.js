const test=require('node:test'),assert=require('node:assert/strict');
const {telegramError,automatic}=require('../src/courier/fifo-release');
const {reviewRelease}=require('../src/courier/fifo-reconcile');
const {options}=require('../scripts/reconcile-fifo-release');
const id='10000001-1000-4000-8000-000000000001';
function fixture(){
 const state={row:{id,bot_id:'fixture',created_at:'2026-01-01 00:00:00.000',state:'DEAD',attempts:1,last_error_code:'NETWORK',fifo_order_id:null,fifo_release:null},audit:[]},calls=[];let before;
 const c={async query(sql){calls.push(sql);return [[{account:'fixture@localhost'}]];},async beginTransaction(){before=structuredClone(state);},async commit(){},async rollback(){state.row=before.row;state.audit=before.audit;},release(){},async execute(sql,p){
  calls.push(sql);
  if(sql.startsWith('SELECT'))return [[structuredClone(state.row)]];
  if(sql.startsWith('UPDATE')){state.row.fifo_release=JSON.parse(p[0]);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT')){if(state.failAudit)throw Error('AUDIT_UNAVAILABLE');state.audit.push(JSON.parse(p[1]));return [{affectedRows:1}];}
  throw Error('UNEXPECTED_WRITE');
 }};
 return {state,calls,pool:{async getConnection(){return c;}}};
}
test('manual review defaults read-only; apply changes marker only and is idempotent',async()=>{
 const {state,calls,pool}=fixture(),args={botId:'fixture',id,operator:'reviewer',reason:'MANUAL_UNCERTAIN_RELEASE_ACKNOWLEDGED'};
 const before=structuredClone(state.row),dry=await reviewRelease(pool,args);
 assert.equal(dry.dryRun,true);assert.deepEqual(state.row,before);assert.equal(state.audit.length,0);assert.ok(calls.includes('SET TRANSACTION READ ONLY'));
 const applied=await reviewRelease(pool,{...args,dryRun:false,expected:dry.fingerprint});assert.equal(applied.markerOnly,true);
 assert.deepEqual({...state.row,fifo_release:null},before);assert.equal(state.audit.length,1);assert.equal(state.audit[0].operator,'reviewer');assert.ok(state.audit[0].at);assert.equal(state.audit[0].databaseAccount,'fixture@localhost');
 assert.equal((await reviewRelease(pool,{...args,dryRun:false,expected:dry.fingerprint})).duplicate,true);assert.equal(state.audit.length,1);
 await assert.rejects(reviewRelease(pool,{...args,reason:'DIFFERENT',dryRun:false,expected:dry.fingerprint}),{statusCode:409});
});
test('audit failure rolls marker back; fingerprint and operator are required for apply',async()=>{
 const {state,pool}=fixture(),args={botId:'fixture',id,operator:'reviewer',reason:'MANUAL_HOLD_RELEASED'};
 const dry=await reviewRelease(pool,args);await assert.rejects(reviewRelease(pool,{...args,dryRun:false}),{statusCode:400});
 state.failAudit=true;await assert.rejects(reviewRelease(pool,{...args,dryRun:false,expected:dry.fingerprint}));assert.equal(state.row.fifo_release,null);
 await assert.rejects(reviewRelease(pool,{...args,operator:'unsafe\ntext'}),{statusCode:400});
});
test('manual late delivery is explicitly marked, never relabelled as ordered SENT',async()=>{
 const {state,pool}=fixture(),args={botId:'fixture',id,operator:'reviewer',reason:'MANUAL_LATE_DELIVERY_ATTESTED',late:true};
 const dry=await reviewRelease(pool,args);await reviewRelease(pool,{...args,dryRun:false,expected:dry.fingerprint});
 assert.equal(state.row.fifo_release.late,true);assert.equal(state.row.state,'DEAD');assert.equal(state.audit[0].late,true);
});
test('later manual delivery appends a late attestation without replacing original release',async()=>{
 const {state,pool}=fixture(),args={botId:'fixture',id,operator:'reviewer',reason:'MANUAL_HOLD_RELEASED'};
 const dry=await reviewRelease(pool,args);await reviewRelease(pool,{...args,dryRun:false,expected:dry.fingerprint});
 const original=structuredClone(state.row.fifo_release);
 const late={...args,operator:'second-reviewer',reason:'LATE_EXTERNAL_DELIVERY_ATTESTED',late:true,dryRun:false,expected:dry.fingerprint};
 await reviewRelease(pool,late);assert.equal(state.row.fifo_release.reason,original.reason);assert.equal(state.row.fifo_release.operator,original.operator);assert.equal(state.row.fifo_release.lateReview.operator,'second-reviewer');assert.equal(state.row.state,'DEAD');
 assert.equal((await reviewRelease(pool,late)).duplicate,true);assert.equal(state.audit.length,2);
});
test('only proven Telegram BAD_REQUEST with known identity can release automatically',async()=>{
 const calls=[],c={async execute(sql,p){calls.push({sql,p});return [{affectedRows:1}];}};
 const row={id,bot_id:'fixture',state:'DEAD',last_error_code:'BAD_REQUEST',fifo_order_id:id,conversation_key:'a'.repeat(64),conversation_seq:'1'};
 assert.equal(await automatic(c,row,null,0),false);
 const evidence=telegramError({source:'TELEGRAM_BOT_API',code:400,description:'Bad Request: chat not found',rejected:true});
 assert.equal(await automatic(c,{...row,fifo_order_id:null},evidence,0),false);
 assert.equal(await automatic(c,{...row,last_error_code:'NETWORK'},evidence,0),false);
 assert.equal(await automatic(c,row,evidence,0),true);assert.equal(calls.length,2);assert.ok(calls[1].sql.includes('AUTO_RELEASE_ALERT'));
 assert.equal(telegramError({...evidence,description:'arbitrary private echo'}).description,'[TELEGRAM_DESCRIPTION_REDACTED]');
 assert.throws(()=>telegramError({...evidence,source:'LOCAL_VALIDATION'}));
});
test('CLI defaults dry-run and never accepts credential options',()=>{
 assert.equal(options(['--session',__filename,'--id',id]).dryRun,true);
 assert.throws(()=>options(['--password','anything']));assert.throws(()=>options(['--session','relative.js']));
});
