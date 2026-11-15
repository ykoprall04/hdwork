const test=require('node:test'),assert=require('node:assert/strict');
const {startInboxWorker}=require('../src/courier/inbox-worker');
test('existing handler-failure backoff postpones next inbox by 62 seconds after five failures',async()=>{
 let attempts=0,elapsed=0;const waits=[],pending=[];
 const worker=startInboxWorker({async processNext(){attempts++;if(attempts<=5)throw Error('offline missing origin proof');return true;}},
  {timers:{setTimeout(callback,ms){pending.push({callback,ms});return pending.length;},clearTimeout(){}}});
 try{
  for(let i=0;i<5;i++){
   await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,1);
   const {callback,ms}=pending.shift();waits.push(ms);elapsed+=ms;callback();
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(waits,[2000,4000,8000,16000,32000]);assert.equal(elapsed,62000);assert.equal(attempts,6);
  assert.equal(pending[0].ms,20); // successful work uses the existing short drain interval
 }finally{await worker.close();}
});
