const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLogger,errorInfo,fields,day}=require('../src/observability/raw-log');
const {initial,readNew}=require('../scripts/courier-log');
const id='12345678-1234-1234-1234-123456789abc';
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-log-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('technical log rejects secrets/body/SQL/URLs and preserves original frame locations and MySQL code',async t=>{
 const directory=temp(t),log=createLogger({directory});const e=Object.assign(Error('SYNTHETIC_CHAT token=SECRET password=SECRET session=SECRET\n    at SECRET.js:1:2'),{code:'ER_LOCK_DEADLOCK',sql:'SELECT SECRET',errno:1213});
 log.emit('MYSQL_TRANSACTION',{correlationId:id,status:'ERROR',durationMs:1.234,text:'SYNTHETIC_CHAT',password:'SECRET',token:'SECRET',session:'SECRET',sql:'SELECT SECRET'},e);await log.flush();
 const text=fs.readFileSync(path.join(directory,fs.readdirSync(directory)[0]),'utf8'),row=JSON.parse(text);assert.ok(!/SECRET|SYNTHETIC_CHAT|SELECT/.test(text));assert.equal(row.error.code,'ER_LOCK_DEADLOCK');assert.equal(row.error.errno,1213);assert.ok(row.error.traceback.some(x=>x.includes('courier-raw-log.test.js:')));assert.equal(row.correlationId,id);assert.match(row.timestamp,/\.\d{3}Z$/);
 assert.deepEqual(fields({correlationId:'token-secret',reason:'text with customer',count:Infinity}),{});
});
test('daily WIB rotation and seven calendar days retention touches only managed log files',async t=>{
 const directory=temp(t);let now=Date.parse('2026-11-11T16:59:59Z');const log=createLogger({directory,now:()=>now});
 fs.writeFileSync(path.join(directory,'hdwork2-2026-11-04-python-1.jsonl'),'old');fs.writeFileSync(path.join(directory,'keep.txt'),'unchanged');
 log.emit('BEFORE_MIDNIGHT');await log.flush();now+=2000;log.emit('AFTER_MIDNIGHT');await log.flush();
 const files=fs.readdirSync(directory);assert.ok(files.some(x=>x.includes('2026-11-11')));assert.ok(files.some(x=>x.includes('2026-11-12')));assert.ok(!files.some(x=>x.includes('2026-11-04')));assert.ok(files.includes('keep.txt'));assert.equal(day(now),'2026-11-12');
});
test('disabled and failed storage never throw into delivery; queue overflow is reported',async t=>{
 const directory=temp(t),disabled=createLogger({directory:path.join(directory,'disabled'),enabled:false});disabled.emit('NO_WRITE');await disabled.flush();assert.ok(!fs.existsSync(path.join(directory,'disabled')));
 const bad=path.join(directory,'not-directory');fs.writeFileSync(bad,'x');const log=createLogger({directory:bad});log.emit('FAILURE');await log.flush();assert.equal(log.dropped,1);
 const bounded=createLogger({directory,limit:2});for(let i=0;i<100;i++)bounded.emit('BURST');await bounded.flush();const text=fs.readFileSync(path.join(directory,fs.readdirSync(directory).find(x=>x.endsWith('.jsonl'))),'utf8');assert.match(text,/LOG_DROPPED/);
});
test('monitor returns latest 100, follows new daily files and partial records without duplicates',async t=>{
 const directory=temp(t),a='hdwork2-2026-11-11-node-1.jsonl',b='hdwork2-2026-11-12-python-2.jsonl';
 const rows=Array.from({length:130},(_,i)=>JSON.stringify({timestamp:new Date(1000+i).toISOString(),n:i}));fs.writeFileSync(path.join(directory,a),rows.join('\n')+'\n');
 const state=await initial(directory);assert.equal(state.lines.length,100);assert.equal(JSON.parse(state.lines[0]).n,30);assert.deepEqual(await readNew(directory,state.offsets),[]);
 fs.writeFileSync(path.join(directory,b),'{"event":');assert.deepEqual(await readNew(directory,state.offsets),[]);fs.appendFileSync(path.join(directory,b),'"NEW_DAY"}\n');assert.deepEqual(await readNew(directory,state.offsets),['{"event":"NEW_DAY"}']);assert.deepEqual(await readNew(directory,state.offsets),[]);
 fs.appendFileSync(path.join(directory,a),'old-file-still-live\n');assert.deepEqual(await readNew(directory,state.offsets),['old-file-still-live']);
});
test('monitor import cannot start or stop Courier and owner forwards only nonsecret logging settings',()=>{
 const monitor=fs.readFileSync('scripts/courier-log.js','utf8');assert.doesNotMatch(monitor,/child_process|\.kill\(|taskkill|Stop-ScheduledTask|process\.stdin/);
 const owner=fs.readFileSync('scripts/run-courier-scheduled-owner.ps1','utf8');assert.match(owner,/HDWORK2_RAW_LOG_ENABLED/);assert.doesNotMatch(owner,/Exception\.Message/);
});
test('24h simulated logging continues without a viewer; original result/error preserved',async t=>{
 const directory=temp(t);let now=Date.parse('2026-11-11T00:00:00Z');const log=createLogger({directory,now:()=>now});
 for(let hour=0;hour<24;hour++){log.emit('COURIER_HEARTBEAT',{status:'OK'});await log.flush();now+=3600000;}
 const rows=fs.readdirSync(directory).flatMap(f=>fs.readFileSync(path.join(directory,f),'utf8').trim().split('\n'));assert.equal(rows.length,24);assert.equal(fs.readdirSync(directory).length,2);
 const {observe}=require('../src/observability/raw-log');const result={ok:true};assert.equal(await observe('TEST_CALL',{},async()=>result),result);const error=Error('private');await assert.rejects(observe('TEST_CALL',{},async()=>{throw error;}),e=>e===error);
});
test('file symlink is rejected without writing its target',async t=>{
 const directory=temp(t),target=path.join(directory,'protected.txt');fs.writeFileSync(target,'unchanged');const log=createLogger({directory});const link=path.join(directory,`hdwork2-${day(Date.now())}-node-${process.pid}.jsonl`);fs.symlinkSync(target,link);log.emit('TEST_LINK');await log.flush();assert.equal(fs.readFileSync(target,'utf8'),'unchanged');assert.equal(log.dropped,1);
});
test('enabled instrumentation inherits trace/request IDs across nested async stages',async t=>{
 const directory=temp(t),{spawnSync}=require('node:child_process');
 const result=spawnSync(process.execPath,['-e',`const {observe,logger}=require('./src/observability/raw-log');(async()=>{await observe('OUTER',{requestId:'${id}'},()=>observe('INNER',{},async()=>{await Promise.resolve();}));await logger().flush();})().catch(()=>process.exitCode=1);`],{cwd:process.cwd(),env:{...process.env,HDWORK2_RAW_LOG_ENABLED:'true',HDWORK2_LOG_DIRECTORY:directory},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const rows=fs.readFileSync(path.join(directory,fs.readdirSync(directory)[0]),'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,2);assert.equal(rows[0].traceId,rows[1].traceId);assert.equal(rows[0].requestId,id);assert.equal(rows[1].requestId,id);
});
test('SIGINT stops only viewer while independent mock writer continues',async t=>{
 const {spawn}=require('node:child_process'),directory=temp(t),file=path.join(directory,'hdwork2-2026-11-12-node-999.jsonl');
 const writer=spawn(process.execPath,['-e',`const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],JSON.stringify({timestamp:new Date().toISOString(),event:'MOCK'})+'\\n'),25);`,file],{stdio:'ignore'});t.after(()=>writer.kill());
 const viewer=spawn(process.execPath,[path.resolve('scripts/courier-log.js'),directory],{stdio:['ignore','pipe','pipe']});t.after(()=>viewer.kill());
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('VIEWER_TIMEOUT')),3000);viewer.stderr.once('data',()=>{clearTimeout(timer);resolve();});});
 const done=new Promise(resolve=>viewer.once('exit',resolve));viewer.kill('SIGINT');await done;assert.equal(writer.exitCode,null);await new Promise(r=>setTimeout(r,100));assert.ok(fs.statSync(file).size>0);
});
