const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {safeEvent,instrument,run}=require('../scripts/start-production-courier-with-trace');
test('startup trace reports only approved phase/type/status fields and never raw stderr or environment',()=>{
 const output=[],calls=[],options={env:{TOKEN:'SYNTHETIC_PRIVATE_VALUE'}};
 const spawn=(...args)=>{const child={stderr:new EventEmitter()};calls.push({args,child});return child;};
 const traced=instrument(spawn,'fixed trace source',event=>output.push(event));
 const child=traced('python',['-B','-m','courier','--run'],options);
 assert.deepEqual(calls[0].args[1],['-B','-c','fixed trace source','--run']);assert.equal(calls[0].args[2],options);
 child.stderr.emit('data',Buffer.from('SYNTHETIC_PRIVATE_VALUE\n'));
 child.stderr.emit('data',Buffer.from(JSON.stringify({event:'STARTUP_FAILURE',phase:'WORKER_LEASE',exceptionType:'TransportError',httpStatus:503,raw:'SYNTHETIC_PRIVATE_VALUE'})+'\n'));
 assert.deepEqual(output,[{event:'STARTUP_FAILURE',phase:'WORKER_LEASE',exceptionType:'TransportError',httpStatus:503}]);
 assert.equal(safeEvent({event:'STARTUP_FAILURE',phase:'SYNTHETIC_PRIVATE_VALUE',exceptionType:'ValueError'}),null);
 traced('powershell.exe',['-File','protected-reader.ps1'],options);assert.deepEqual(calls[1].args[1],['-File','protected-reader.ps1']);
 assert.doesNotMatch(JSON.stringify(output),/SYNTHETIC_PRIVATE_VALUE/);
});
test('trace wrapper requires explicit approved deployment inputs before changing spawn',async()=>{
 const original=require('node:child_process').spawn;
 await assert.rejects(run([]),/APPROVED_SNAPSHOT_PLAN_REQUIRED/);
 assert.equal(require('node:child_process').spawn,original);
});
