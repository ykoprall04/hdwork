const test=require('node:test'),assert=require('node:assert/strict'),http=require('http'),path=require('path');
test('HTTP drain waits for real transaction after client disconnect, ends SSE and never kills on timeout',async()=>{
 const f=await require('./helpers/temporary-courier-mysql.cjs').start(path.resolve('.local'));let release,entered;
 const held=new Promise(r=>release=r),started=new Promise(r=>entered=r),gate=require('../src/operations/transaction-gate');
 const drain=require('../src/config/web-drain').create({transactions:gate});let poolsClosed=false;
 await f.c.query('CREATE DATABASE hdwork2');await f.c.query('CREATE TABLE hdwork2.fixture(id INT PRIMARY KEY) ENGINE=InnoDB');
 const server=drain.attach(http.createServer(drain.wrap(async(req,res)=>{
  if(req.url==='/sse'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': ready\n\n');return;}
  try{await gate.run(async()=>{const c=await f.pool.getConnection();try{await c.beginTransaction();await c.query('INSERT INTO fixture VALUES (1)');entered();await held;await c.commit();}finally{c.release();}});res.end('committed');}catch{res.statusCode=503;res.end();}
 })));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let sse;const ended=new Promise(resolve=>{sse=http.get(base+'/sse',res=>{res.resume();res.on('end',resolve);});});
 const request=http.get(base+'/write');request.on('error',()=>{});
 try{
  await started;request.destroy();await new Promise(r=>setTimeout(r,30));
  await assert.rejects(drain.close({timeoutMs:50,closePools:async()=>{poolsClosed=true;}}),{code:'WEB_DRAIN_TIMEOUT'});assert.equal(poolsClosed,false);assert.equal(gate.snapshot().active,1);
  await ended;release();const proof=await drain.close({timeoutMs:2000});assert.equal(proof.status,'DRAINED');assert.equal(proof.activeTransactions,0);assert.equal(proof.forced,false);assert.equal(poolsClosed,true);
  const [[n]]=await f.c.query('SELECT COUNT(*) AS n FROM hdwork2.fixture');assert.equal(n.n,1);await assert.rejects(gate.run(async()=>{}),{code:'WEB_DRAINING'});
 }finally{release();sse?.destroy();await f.stop();}
});
test('handoff rejects unsupported old owner before any drain or route operation',async()=>{
 let changes=0;await assert.rejects(require('../scripts/lib/web-handoff.cjs').handoff({approve:true,old:{inspect:async()=>({protocol:'LEGACY'})},candidate:{inspect:async()=>({protocol:'HDWORK2_WEB_DRAIN_V1'})},route:{switchTarget(){changes++;}}}),/LEGACY_WEB_OWNER_UNSUPPORTED/);assert.equal(changes,0);
});
