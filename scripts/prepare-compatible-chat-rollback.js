// Management sidecar only. Original release manifest, backups and active runtime remain unchanged.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{randomUUID}=require('node:crypto');
const {hash}=require('./apply-live-chat-web-overlay');
const release='4ef886e9bb2176b15f86cb3c2462a601fb8d14d6';
function read(file){const p=path.resolve(file),s=fs.lstatSync(p),real=fs.realpathSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>8*1024*1024||(process.platform==='win32'?real.toLowerCase()!==p.toLowerCase():real!==p))throw Error('UNSAFE_ROLLBACK_INPUT');return fs.readFileSync(p);}
const normalized=b=>b.toString('utf8').replace(/\r\n/g,'\n');
function prepare({prepared,repo=path.resolve(__dirname,'..'),output}={}){
 prepared=path.resolve(prepared);repo=path.resolve(repo);
 const raw=read(path.join(prepared,'production-plan.review.json')),plan=JSON.parse(raw);
 if(plan.commit!==release||plan.status!=='STAGED_NOT_ACTIVATED'||!plan.backupComplete)throw Error('PINNED_STAGED_RELEASE_REQUIRED');
 const oldEnv=read(path.join(prepared,'backup/service/environment.json'));
 if(hash(oldEnv)!==plan.environmentSha256||hash(read(path.join(prepared,'backup/service/secrets.dpapi')))!==plan.encryptedBundleSha256)throw Error('ORIGINAL_BACKUP_HASH_MISMATCH');
 const pool=plan.entries.find(e=>e.file==='src/config/operational-pools.js');
 if(!/^[a-f0-9]{40}$/.test(pool?.ancestor||'')||pool.classification!=='KNOWN_ANCESTOR')throw Error('KNOWN_POOL_ANCESTOR_REQUIRED');
 const oldPool=read(path.join(prepared,'backup',pool.file));
 if(hash(oldPool)!==pool.before)throw Error('POOL_BACKUP_CHANGED');
 const git=(args)=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
 if(normalized(git(['show',pool.ancestor+':'+pool.file]))!==normalized(oldPool))throw Error('POOL_ANCESTOR_HASH_MISMATCH');
 const policy=read(path.join(repo,'src/config/operational-grants.js'));
 if(normalized(git(['show',pool.ancestor+':src/config/operational-grants.js']))!==normalized(policy))throw Error('ANCESTOR_GRANT_POLICY_DIFFERS');
 const fallback=JSON.parse(JSON.stringify(plan));
 const retained=['scripts/protected-web-service.js','src/config/protected-service-bundle.js'];
 for(const file of retained){const e=fallback.entries.find(e=>e.file===file);if(!e||hash(read(path.join(prepared,'payload',file)))!==e.after)throw Error('RETAINED_VALIDATOR_PAYLOAD_REQUIRED');e.before=e.after;e.classification='MATCH';}
 const env=Buffer.from(JSON.stringify({...JSON.parse(oldEnv),...plan.patch},null,2)+'\n');
 if(JSON.parse(env).HDWORK2_TESTING_SOLVER_ENABLED!=='false')throw Error('DORMANT_TRIAL_REQUIRED');
 fallback.environmentSha256=hash(env);
 fallback.rollback={...fallback.rollback,grantProfileAlignmentRequired:false,priorExpectedProfiles:{read:'chatRead',write:'chatWrite'},strategy:'RESTORE_PRIOR_SOURCE_KEEP_CHAT_GRANTS_AND_DORMANT_BUNDLE_VALIDATOR',grantPolicySha256:hash(policy),poolPreflight:'PENDING_REAL_READ_ONLY_PROBE',fullWebBootVerified:false};
 output=path.resolve(output||path.join(prepared,'compatible-rollback-'+randomUUID()));
 if(path.dirname(output)!==prepared)throw Error('OUTPUT_MUST_INHERIT_PRIVATE_PREPARATION_ACL');
 fs.mkdirSync(output,{mode:0o700});
 // Copy only reviewed backup/payload artifacts, never runtime directories or live DB data.
 for(const folder of ['backup','payload']){
  fs.mkdirSync(path.join(output,folder),{mode:0o700});
  for(const e of plan.entries){
   if(e.classification==='MATCH')continue;
   if(!(/^(src|contracts)\/[A-Za-z0-9_./-]+\.(js|json)$/.test(e.file)||/^courier_bot\/courier\/[A-Za-z0-9_/-]+\.py$/.test(e.file)||['courier-b2c-server.js','local-web-server.js','api-only-server.js','scripts/run-production-live-chat-courier.js','scripts/protected-web-service.js','scripts/office-web-service.js','scripts/read-dpapi-password.ps1'].includes(e.file))||e.file.split('/').includes('..'))throw Error('ROLLBACK_ARTIFACT_PATH_REJECTED');
   if(folder==='backup'&&e.before===null)continue;
   const bytes=read(path.join(prepared,folder,e.file));
   if(hash(bytes)!==(folder==='backup'?e.before:e.after))throw Error('ROLLBACK_ARTIFACT_HASH_MISMATCH');
   const target=path.join(output,folder,e.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
  }
 }
 fs.mkdirSync(path.join(output,'backup/service'),{recursive:true});
 fs.writeFileSync(path.join(output,'backup/service/environment.json'),env,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(output,'backup/service/secrets.dpapi'),read(path.join(prepared,'backup/service/secrets.dpapi')),{flag:'wx',mode:0o600});
 const bytes=JSON.stringify(fallback,null,2)+'\n';fs.writeFileSync(path.join(output,'production-plan.review.json'),bytes,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(output,'pool-probe.js'),`require(${JSON.stringify(path.join(repo,'scripts/check-compatible-chat-rollback.js'))}).run({prepared:${JSON.stringify(output)},planSha256:${JSON.stringify(hash(bytes))}}).catch(()=>{console.error('ROLLBACK_POOL_PREFLIGHT_FAILED');process.exitCode=1;});\n`,{flag:'wx',mode:0o600});
 const quote=s=>"'"+s.replace(/'/g,"''")+"'";
 let wrapper=read(path.join(repo,'scripts/check-live-chat-readiness.ps1')).toString('utf8');
 const rootLine="$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",engineLine="$engine=Join-Path $root 'scripts/check-live-chat-readiness.js'";
 if(!wrapper.includes(rootLine)||!wrapper.includes(engineLine))throw Error('READ_ONLY_WRAPPER_CONTRACT_CHANGED');
 wrapper=wrapper.replace(rootLine,()=>'$root='+quote(repo)).replace(engineLine,()=>'$engine='+quote(path.join(output,'pool-probe.js')));
 fs.writeFileSync(path.join(output,'check-pools.ps1'),wrapper,{flag:'wx',mode:0o600});
 return {status:'COMPATIBLE_ROLLBACK_PREPARED_NOT_APPLIED',output,releaseCommit:release,originalPlanSha256:hash(raw),rollbackPlanSha256:hash(bytes),realPoolProbe:'PENDING',runtimeChanged:false};
}
if(require.main===module){try{if(process.argv.length!==4||process.argv[2]!=='--prepared')throw Error('PREPARED_ARGUMENT_REQUIRED');console.log(JSON.stringify(prepare({prepared:process.argv[3]}),null,2));}catch{console.error('COMPATIBLE_ROLLBACK_PREPARATION_FAILED');process.exitCode=1;}}
module.exports={prepare,release};
