const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {tlsFailure,errorReport,startChrome}=require('../scripts/open-local-login');
test('refused local TLS reports missing HTTPS runtime instead of certificate or generic browser failure',()=>{
 const report=errorReport(tlsFailure({code:'ECONNREFUSED'}));assert.equal(report.code,'LOCAL_HTTPS_NOT_RUNNING');assert.equal(report.nativeCode,'ECONNREFUSED');assert.ok(report.message.includes('8443'));assert.equal(report.osTrustChanged,false);
});
test('diagnostics never echo arbitrary exception text',()=>{
 const report=errorReport({code:'EPERM',message:'synthetic-secret-not-for-log'});assert.equal(report.nativeCode,'EPERM');assert.ok(!JSON.stringify(report).includes('synthetic-secret-not-for-log'));
});
test('Chrome launch surfaces Windows spawn errors and early exit codes; waits for a stable start',async()=>{
 const child=action=>{const c=new EventEmitter();setImmediate(()=>action(c));return c;};
 await assert.rejects(startChrome('fake',[],{spawn:()=>child(c=>c.emit('error',{code:'EPERM'})),settleMs:5}),e=>e.code==='CHROME_SPAWN_FAILED'&&e.nativeCode==='EPERM');
 await assert.rejects(startChrome('fake',[],{spawn:()=>child(c=>{c.emit('spawn');c.emit('exit',21);}),settleMs:5}),e=>e.code==='CHROME_EARLY_EXIT'&&e.exitCode===21);
 const c=await startChrome('fake',[],{spawn:()=>child(c=>c.emit('spawn')),settleMs:5});assert.ok(c instanceof EventEmitter);
});
