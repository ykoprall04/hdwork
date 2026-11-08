const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module'),http=require('node:http');
test('operation HTTP routes select read/write pools without falling back to auth pool',async()=>{
 const file=require.resolve('../src/operations/routes'),native=createRequire(file),m={exports:{}},readPool={identity:'read'},writePool={identity:'write'},calls=[];
 const h={auth(req,_res,next){req.user={id:1,role:'HD',modules:['B2B']};req.sessionToken='synthetic';next();},csrf(){calls.push('csrf');}};
 const mocked=name=>name==='../access/http'?h:name==='../config/operational-pools'?{getReadPool:()=>readPool,getWritePool:()=>writePool}:name==='./read'?{reader(p){assert.equal(p,readPool);return {async list(){calls.push('read');return {data:[]};}};}}:name==='./create'?{async create(p){assert.equal(p,writePool);calls.push('write-create');return {success:true};}}:name==='./mutate'?{async act(p){assert.equal(p,writePool);calls.push('write-status');return {success:true};}}:native(name);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,require:mocked,process:{env:{HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',DB_NAME:'hdwork2'}}});
 const app=require('express')();app.use(require('express').json());app.use('/api/operations',m.exports);const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port+'/api/operations';assert.equal((await fetch(base+'/orders')).status,200);for(const url of ['/orders','/orders/synthetic/actions'])assert.ok([200,201].includes((await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status));assert.deepEqual(calls,['read','csrf','write-create','csrf','write-status']);assert.equal(require.cache[require.resolve('../src/config/database')],undefined);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('auth pool rejects root and an operational identity before creating a pool',()=>{
 const source=fs.readFileSync('src/config/database.js','utf8');for(const user of ['root','hdwork_ops_read','hdwork_courier']){let created=false;assert.throws(()=>vm.runInNewContext(source,{module:{exports:{}},require:()=>({createPool(){created=true;}}),process:{env:{HDWORK2_AUTH_V2:'true',DB_USER:user,DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_PORT:'3306'}}}));assert.equal(created,false);}
});
