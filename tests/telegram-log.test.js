const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {run,args,format,isError,visible,pythonFile}=require('../scripts/telegram-log');
const {initial,readNew}=require('../scripts/courier-log');
function folder(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'telegram-log-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
const record=(event,extra={})=>JSON.stringify({timestamp:'2026-11-15T00:00:00Z',source:'python',event,...extra});
test('only Python files/records; original stdout/stderr and technical JSON; Last and NoFollow',async t=>{
 const dir=folder(t),file=path.join(dir,'hdwork2-2026-11-15-python-1.jsonl');
 fs.writeFileSync(path.join(dir,'hdwork2-2026-11-15-node-2.jsonl'),record('WEB_SECRET')+'\n');
 fs.writeFileSync(file,[record('TELEGRAM_POLL',{count:0}),record('PYTHON_STDOUT',{stream:'stdout',text:'2026 INFO unchanged\n'}),record('PYTHON_STDERR',{stream:'stderr',text:'Traceback (most recent call last):\nTimeoutError: timed out\n'})].join('\n')+'\n');
 let out='';await run({directory:dir,last:2,follow:false},s=>out+=s);
 assert.equal(out,'2026 INFO unchanged\nTraceback (most recent call last):\nTimeoutError: timed out\n');
 assert.equal(format(record('TELEGRAM_POLL',{count:0})),record('TELEGRAM_POLL',{count:0})+'\n');
 assert.deepEqual(args(['--last','100','--errors','--no-follow']),{directory:undefined,last:100,errors:true,follow:false});
 assert.throws(()=>args(['--last','NaN']));
});
test('Errors retains whole native traceback; excludes normal events',async t=>{
 const dir=folder(t);fs.writeFileSync(path.join(dir,'hdwork2-2026-11-15-python-1.jsonl'),[record('TELEGRAM_POLL'),record('PYTHON_STDERR',{stream:'stderr',text:'  File "clients.py", line 12, in send\n'}),record('TELEGRAM_SEND',{status:'ERROR',error:{nativeTraceback:'Traceback (most recent call last):\nTransportError: courier_transport_error\nstatus=429\n'}})].join('\n')+'\n');
 let out='';await run({directory:dir,last:100,errors:true,follow:false},s=>out+=s);assert.doesNotMatch(out,/TELEGRAM_POLL/);assert.match(out,/clients.py/);assert.match(out,/status=429/);
});
test('follows partial Unicode, rotation and changed PID without mixing Node files',async t=>{
 const dir=folder(t),state=await initial(dir,100,()=>true,pythonFile),file=path.join(dir,'hdwork2-2026-11-15-python-3.jsonl');
 fs.writeFileSync(file,record('TELEGRAM_POLL').slice(0,-1));assert.deepEqual(await readNew(dir,state.offsets,pythonFile),[]);
 fs.appendFileSync(file,'}\n');assert.equal((await readNew(dir,state.offsets,pythonFile)).length,1);assert.deepEqual(await readNew(dir,state.offsets,pythonFile),[]);
 fs.writeFileSync(path.join(dir,'hdwork2-2026-11-16-node-4.jsonl'),record('MYSQL')+'\n');fs.writeFileSync(path.join(dir,'hdwork2-2026-11-16-python-5.jsonl'),record('TELEGRAM_SEND')+'\n');assert.equal((await readNew(dir,state.offsets,pythonFile)).length,1);
});
test('viewer has no lifecycle control and redacts leaked token in native stream',()=>{
 assert.doesNotMatch(fs.readFileSync('scripts/telegram-log.js','utf8'),/child_process|\.kill\(|taskkill|Stop-ScheduledTask|process\.stdin/);
 assert.doesNotMatch(format(record('PYTHON_STDOUT',{stream:'stdout',text:'token=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef\n'})),/ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
});

const routineRows=[
 record('TELEGRAM_REQUEST_START',{apiMethod:'getUpdates'}),record('TELEGRAM_REQUEST',{apiMethod:'getUpdates',status:'OK'}),
 record('TELEGRAM_POLL',{status:'OK',durationMs:25000}),record('TELEGRAM_POLL_RESULT',{count:0}),
 record('COURIER_CYCLE',{status:'OK'}),record('ROUTING',{status:'OK'}),
 record('JOURNAL_INCOMING',{status:'OK'}),record('OUTBOX_CLAIM',{status:'OK'}),
 record('OUTBOX_CLAIM_RESULT',{count:0,reason:'NO_ELIGIBLE_MESSAGE'})
];
test('hide routine/empty records, retain real activity unchanged and unknown events',()=>{
 for(const line of routineRows)assert.equal(visible(JSON.parse(line)),false,line);
 const activity=[record('TELEGRAM_POLL_RESULT',{count:2}),record('OUTBOX_CLAIM_RESULT',{count:1,reason:'CLAIMED'}),
  record('TELEGRAM_COMMAND',{command:'order',status:'VALID'}),record('TELEGRAM_COMMAND',{command:'req'}),
  record('TELEGRAM_COMMAND',{command:'config_psb'}),record('TELEGRAM_COMMAND',{command:'mo'}),
  record('INBOX_FORWARD'),record('TELEGRAM_REQUEST_START',{apiMethod:'sendMessage'}),record('TELEGRAM_SEND',{status:'OK'}),
  record('DELIVERY_RESULT',{status:'SENT'}),record('DELIVERY_RESULT',{status:'RETRY'}),record('TELEGRAM_POLL_RETRY'),
  record('NETWORK_TIMEOUT'),record('FUTURE_TELEGRAM_ACTIVITY')];
 for(const line of activity){assert.equal(visible(JSON.parse(line)),true,line);assert.equal(format(line),line+'\n');}
});
test('errors override every routine filter and remain visible in Errors mode',()=>{
 for(const line of routineRows)for(const error of [{error:{type:'TimeoutError'}},{status:'ERROR'},{status:'FAILED'},
  {status:'RETRY'},{level:'error'},{level:'INFO',severity:'CRITICAL'},{httpStatus:429},{status:503},{error_code:'NETWORK'},{reason:'TIMEOUT'}]){
  const r={...JSON.parse(line),...error};assert.equal(visible(r),true,JSON.stringify(r));assert.equal(visible(r,true),true);
 }
 assert.equal(visible(JSON.parse(record('TELEGRAM_COMMAND')),true),false);
});
test('Last counts visible activity, NoFollow preserves original history bytes',async t=>{
 const dir=folder(t),file=path.join(dir,'hdwork2-2026-11-15-python-1.jsonl');const rows=[];
 for(let i=0;i<120;i++){rows.push(record('TELEGRAM_COMMAND',{command:'req',count:i}),...routineRows);}
 const original=rows.join('\n')+'\n';fs.writeFileSync(file,original);
 let out='';await run({directory:dir,last:100,follow:false},s=>out+=s);
 const expected=rows.filter(l=>JSON.parse(l).event==='TELEGRAM_COMMAND').slice(-100).join('\n')+'\n';
 assert.equal(out,expected);assert.equal(fs.readFileSync(file,'utf8'),original);
});
test('follow uses same activity/error filter, including new PID files',async t=>{
 const dir=folder(t);let out='';const follower=await run({directory:dir,last:100,follow:true},s=>out+=s);
 t.after(()=>{follower.stop();process.removeListener('SIGINT',follower.stop);process.removeListener('SIGTERM',follower.stop);});
 const activity=record('TELEGRAM_COMMAND',{command:'mo'}),error=record('ROUTING',{status:'ERROR'});
 fs.writeFileSync(path.join(dir,'hdwork2-2026-11-16-python-6.jsonl'),[...routineRows,activity,error].join('\n')+'\n');
 for(let i=0;i<20&&!out.includes(error);i++)await new Promise(r=>setTimeout(r,50));
 assert.equal(out,activity+'\n'+error+'\n');
});
