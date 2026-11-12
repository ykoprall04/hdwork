// File-only preparation. Never imports host adapters, credentials or production services.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {FLAGS,sha,within,regular}=require('./lib/courier-cutover.cjs');
const {validateAllowlist}=require('../src/courier/administrative-closure');
async function prepare({source,releaseDirectory,frontend,frontendSha256,allowlistFile,expectedHead,hostAdapterFile,hostAdapterSha256}){
 for(const value of [source,releaseDirectory,frontend,allowlistFile])if(!path.isAbsolute(value||''))throw Error('ABSOLUTE_PATHS_REQUIRED');
 const git=args=>cp.execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(git(['rev-parse','HEAD'])!==expectedHead||git(['status','--porcelain','--untracked-files=all']))throw Error('EXACT_CLEAN_HEAD_REQUIRED');
 const target=git(['rev-parse','HEAD']);
 if(git(['rev-parse',target+':frontend'])!==git(['rev-parse','f399b0d76cba6e6e255b2195c19076eda4a34f40:frontend']))throw Error('NEW_FRONTEND_BUILD_PROVENANCE_REQUIRED');
 await require('./frontend-only-release').verified(frontend,frontendSha256);
 const graph=await require('./prepare-live-chat-production').dependencyGraph(source,target,{production:true});
 for(const file of ['scripts/close-courier-administratively.js','src/courier/administrative-closure.js','scripts/execute-courier-cutover.js','scripts/lib/courier-cutover.cjs','scripts/prepare-courier-cutover.js','src/courier/fifo-reconcile.js','scripts/reconcile-fifo-release.js','package.json','package-lock.json','database/manual/015_hdwork2_fifo_ack.review.sql','database/manual/016_fifo_release.PLAN_ONLY.sql','database/manual/017_administrative_closure.PLAN_ONLY.sql','database/manual/015_fifo_lane_grants.review.sql'])graph.set(file,Buffer.from(cp.execFileSync('git',['show',target+':'+file],{cwd:source})));
 const hashes={};
 for(const [file,bytes] of graph){const disk=regular(within(source,file));if(disk.toString('utf8').replace(/\r\n/g,'\n')!==bytes.toString('utf8').replace(/\r\n/g,'\n'))throw Error('SOURCE_CHANGED');hashes[file]=sha(disk);}
 const allowBytes=regular(allowlistFile),allow=JSON.parse(allowBytes.toString('utf8').replace(/^\uFEFF/,'')),logicalSha=validateAllowlist(allow);
 if(hostAdapterFile&&(!hostAdapterSha256||sha(regular(hostAdapterFile))!==hostAdapterSha256))throw Error('OWNER_ADAPTER_PIN_REQUIRED');
 if(fs.existsSync(releaseDirectory))throw Error('NEW_RELEASE_DIRECTORY_REQUIRED');fs.mkdirSync(releaseDirectory);
 const write=(name,bytes)=>fs.writeFileSync(path.join(releaseDirectory,name),bytes,{flag:'wx',mode:0o600});
 write('allowlist.json',allowBytes);
 const backend=JSON.stringify({version:1,targetCommit:target,sourceHashes:hashes,frontendGitTree:git(['rev-parse',target+':frontend'])},null,2)+'\n';write('backend-manifest.json',backend);
 const plan={version:1,kind:'HDWORK2_COURIER_CUTOVER',targetCommit:target,source,releaseDirectory,decisionId:allow.decisionId,backend:{file:'backend-manifest.json',sha256:sha(backend)},frontend:{source:frontend,sha256:frontendSha256,provenance:'UNCHANGED_FRONTEND_TREE_FROM_F399B0D_OFFICIAL_BUILD'},allowlist:{file:'allowlist.json',fileSha256:sha(allowBytes),logicalSha256:logicalSha},initialFlags:{...FLAGS},hostAdapter:hostAdapterFile?{file:hostAdapterFile,sha256:hostAdapterSha256}:null,stages:['queue-gate','clean-stop-and-writer-fence','paired-backup-and-restore-verification','schema-015-016-017','minimum-grants','close-18-without-fifo-release','install-flags-off','health','separate-phase-approvals'],phases:[{phase:1,deliveryMode:'fifo-ack-v2',fifoRelease:true,adaptiveScheduler:false,separateIo:false},{phase:2,deliveryMode:'fifo-ack-v2',fifoRelease:true,adaptiveScheduler:true,separateIo:false},{phase:3,deliveryMode:'fifo-ack-v2',fifoRelease:true,adaptiveScheduler:true,separateIo:true}],automaticDatabaseRestore:false,rollbackPreservesAdministrativeAudit:true};
 const bytes=JSON.stringify(plan,null,2)+'\n';write('cutover.PLAN_ONLY.json',bytes);
 const result={status:'PINNED_PLAN_NOT_EXECUTED',targetCommit:target,planSha256:sha(bytes),frontendManifestSha256:frontendSha256,backendManifestSha256:sha(backend),allowlistSha256:logicalSha,hostAdapterReady:!!hostAdapterFile};write('pins.json',JSON.stringify(result,null,2)+'\n');return result;
}
async function main(argv){const a={};for(let i=0;i<argv.length;i+=2){const key={'--source':'source','--release':'releaseDirectory','--frontend':'frontend','--frontend-sha256':'frontendSha256','--allowlist':'allowlistFile','--expected-head':'expectedHead','--host-adapter':'hostAdapterFile','--host-adapter-sha256':'hostAdapterSha256'}[argv[i]];if(!key||!argv[i+1]||a[key])throw Error('ARGUMENT_REJECTED');a[key]=argv[i+1];}return prepare(a);}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.log(JSON.stringify({status:'STOP',code:'PREPARATION_REJECTED'}));process.exitCode=1;});
module.exports={prepare,main};
