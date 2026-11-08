const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('private API captures credentials into pool before environment cleanup and closes only owned runtime',async()=>{
 const env={},events=[],handlers={},pool={async end(){events.push('pool-end');}};
 const app={closeAllConnections(){events.push('connections-close');},close(fn){events.push('api-close');fn();}};
 const m={exports:{}};
 const mocked=name=>name==='node:path'?require('node:path'):name==='dotenv'?{config(){}}:name==='../src/config/private-database-env'?{async loadPrivatePassword(){env.DB_PASSWORD='synthetic-memory-only';}}:name==='../src/config/api-only-startup'?{validateApiOnlyConfig(){assert.ok(Boolean(env.DB_PASSWORD));}}:name==='../src/config/operational-pools'?{async close(){events.push('operational-pools-close');}}:name==='../src/config/database'?(events.push('pool-created-with-credential'),assert.ok(Boolean(env.DB_PASSWORD)),pool):name==='../api-only-server'?{async startApiOnly(){events.push('api-start');return app;}}:(()=>{throw Error('Unexpected dependency');})();
 mocked.main={};vm.runInNewContext(fs.readFileSync('scripts/private-runtime.js','utf8'),{module:m,require:mocked,__dirname:require('node:path').resolve('scripts'),process:{argv:['node','runtime','api'],env,once:(name,fn)=>handlers[name]=fn},console:{log(){},error(){}},AbortSignal});
 await m.exports.run();assert.ok(!Object.hasOwn(env,'DB_PASSWORD'));assert.deepEqual(events.slice(0,2),['pool-created-with-credential','api-start']);handlers.SIGINT();await new Promise(r=>setImmediate(r));assert.ok(events.includes('api-close'));assert.ok(events.includes('pool-end'));
});
