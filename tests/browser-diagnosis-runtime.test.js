// Pure utility tests: no runner invocation, browser, socket or database.
const test=require('node:test'),assert=require('node:assert/strict');
const {retryBusy,deadline,withSignal,sleep,safeCode}=require('../scripts/browser-diagnosis-runtime');
const error=code=>Object.assign(Error('private details must not enter diagnostics'),{code});

test('EBUSY retry uses bounded progressive delays and records only safe operation metadata',async()=>{
  const retries=[],delays=[];let calls=0;
  const result=await retryBusy('devtools-active-port-read',()=>{if(++calls<4)throw error('EBUSY');return 'ready';},{signal:new AbortController().signal,onRetry:e=>retries.push(e),pause:async ms=>delays.push(ms)});
  assert.equal(result,'ready');assert.equal(calls,4);assert.deepEqual(delays,[50,100,200]);
  assert.deepEqual(Object.keys(retries[0]),['operation','code','retry','delayMs']);
  assert.ok(!JSON.stringify(retries).includes('private details'));
});
test('persistent EBUSY stops after initial attempt plus five retries and retains operation',async()=>{
  let calls=0;const delays=[];
  await assert.rejects(retryBusy('report-write',()=>{calls++;throw error('EBUSY');},{signal:new AbortController().signal,pause:async ms=>delays.push(ms)}),{code:'EBUSY',operation:'report-write'});
  assert.equal(calls,6);assert.deepEqual(delays,[50,100,200,400,800]);
});
test('non-EBUSY file errors propagate unchanged immediately without retries',async()=>{
  for(const code of ['EACCES','EPERM','ENOENT','EIO']){
    const original=error(code);let calls=0,retries=0;
    await assert.rejects(retryBusy('certificate-read',()=>{calls++;throw original;},{signal:new AbortController().signal,onRetry:()=>retries++}),e=>e===original&&e.code===code&&e.operation==='certificate-read');
    assert.equal(calls,1);assert.equal(retries,0);
  }
});
test('overall deadline terminates an unresolved operation',async()=>{
  const budget=deadline(15);
  try{await assert.rejects(withSignal(new Promise(()=>{}),budget.signal),{code:'OVERALL_TIMEOUT',operation:'overall-timeout'});}finally{budget.stop();}
});
test('deadline abort interrupts retry backoff rather than completing all attempts',async()=>{
  const budget=deadline(15);let calls=0;
  try{await assert.rejects(retryBusy('devtools-active-port-read',()=>{calls++;throw error('EBUSY');},{signal:budget.signal}),{code:'OVERALL_TIMEOUT'});assert.equal(calls,1);}finally{budget.stop();}
});
test('already aborted operation never executes and sleep cancels without an extra retry',async()=>{
  const controller=new AbortController(),reason=error('CANCELLED');controller.abort(reason);let called=false;
  await assert.rejects(retryBusy('report-write',()=>{called=true;},{signal:controller.signal}),e=>e===reason);
  await assert.rejects(sleep(100,controller.signal),e=>e===reason);assert.equal(called,false);
});
test('diagnostic code never includes arbitrary error text or paths',()=>{
  assert.equal(safeCode({code:'EBUSY',message:'private'}),'EBUSY');
  assert.equal(safeCode({code:'C:/private/path',message:'private'}),'DIAGNOSIS_FAILED');
});
