// Read-only guard for a compatible application rollback; never installs or starts anything.
const path=require('node:path');
const {regular,sha}=require('./courier-cutover.cjs');
const {bots}=require('../../src/config/courier-writer');
const {assertClosed}=require('../../src/courier/writer-fence');
const RETAIN=Object.freeze(['src/courier/mysql-store.js','src/courier/writer-fence.js','src/config/courier-writer.js','src/config/live-chat-activation.js','src/config/operational-pools.js','src/courier/fifo.js','src/courier/fifo-release.js','src/courier/contract.js','src/config/operational-grants.js','src/system/store.js','src/operations/transaction-gate.js','src/access/store.js','src/config/web-drain.js','src/config/readiness-probe.js','src/api-only-app.js','api-only-server.js','local-web-server.js','src/local-web.js','scripts/protected-web-service.js']);
async function verify({currentSource,candidateSource,currentEnv,candidateEnv,botId,pool,expectedEpoch}){
 if(!path.isAbsolute(currentSource||'')||!path.isAbsolute(candidateSource||''))throw Error('WRITER_ROLLBACK_SOURCE_REQUIRED');
 const before=bots(currentEnv).sort(),after=bots(candidateEnv).sort();
 if(!before.includes(botId)||JSON.stringify(before)!==JSON.stringify(after))throw Error('WRITER_ROLLBACK_SCOPE_CHANGED');
 for(const key of ['HDWORK2_COURIER_FIFO_ENABLED','HDWORK2_COURIER_FIFO_RELEASE_ENABLED','HDWORK2_SHARED_GROUPS_ENABLED'])if(currentEnv[key]!==candidateEnv[key])throw Error('WRITER_ROLLBACK_FLAGS_CHANGED');
 const hashes={};for(const file of RETAIN){const old=sha(regular(path.join(currentSource,file))),next=sha(regular(path.join(candidateSource,file)));if(old!==next)throw Error('WRITER_ROLLBACK_GUARD_CHANGED');hashes[file]=next;}
 const fence=await assertClosed(pool,{botId,expectedEpoch});
 return {status:'COMPATIBLE_WRITER_ROLLBACK_VERIFIED',botId,epoch:fence.epoch,retainedHashes:hashes,productionChanged:false,databaseRestoreAllowed:false};
}
module.exports={verify,RETAIN};
