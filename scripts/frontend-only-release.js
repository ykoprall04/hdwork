// Static frontend files only. Never imports runtime/configuration, DB or credentials.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error(code);};
const within=(a,b)=>a===b||a.startsWith(b+path.sep);
const safeName=name=>name==='index.html'||name==='favicon.svg'||name==='icons.svg'||/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|svg|png|jpg|webp|ico)$/.test(name);
async function directory(value){const resolved=path.resolve(value);if((await fs.realpath(resolved)).toLowerCase()!==resolved.toLowerCase()||(await fs.lstat(resolved)).isSymbolicLink())fail('SYMLINK_DIRECTORY_REJECTED');return resolved;}
async function inventory(root){
 root=await directory(root);const files={};
 async function walk(folder,prefix=''){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
  const name=prefix+entry.name,file=path.join(folder,entry.name),stat=await fs.lstat(file);
  if(stat.isSymbolicLink()||(entry.isFile()&&stat.nlink>1))fail('LINK_REJECTED');
  if(entry.isDirectory()){if(name!=='assets')fail('NON_STATIC_DIRECTORY_REJECTED');await walk(file,name+'/');}
  else if(entry.isFile()){if(name==='release-manifest.json')continue;if(!safeName(name))fail('NON_STATIC_FILE_REJECTED');files[name]=digest(await fs.readFile(file));}
  else fail('NON_STATIC_FILE_REJECTED');
 }}await walk(root);if(!files['index.html']||!Object.keys(files).some(n=>n.startsWith('assets/')))fail('INCOMPLETE_FRONTEND');return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
}
async function atomic(file,bytes){const tmp=file+'.frontend-'+crypto.randomUUID()+'.tmp';await fs.writeFile(tmp,bytes,{flag:'wx'});try{await fs.rename(tmp,file);}catch(e){await fs.rm(tmp,{force:true});throw e;}}
const save=(file,value)=>atomic(file,JSON.stringify(value,null,2)+'\n');
async function attest(dist,apiOrigin,flags){
 const files=await inventory(dist),manifest={version:1,kind:'HDWORK2_FRONTEND_BUILD',apiOrigin,flags,files};
 const bytes=JSON.stringify(manifest,null,2)+'\n';await atomic(path.join(dist,'release-manifest.json'),bytes);return digest(bytes);
}
async function metadata(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>5*1024*1024)fail('UNSAFE_RELEASE_METADATA');return fs.readFile(file);}
async function verified(source,expected){
 if(!/^[a-f0-9]{64}$/.test(expected||''))fail('EXPECTED_MANIFEST_SHA256_REQUIRED');
 source=await directory(source);const bytes=await metadata(path.join(source,'release-manifest.json'));
 if(digest(bytes)!==expected)fail('MANIFEST_HASH_MISMATCH');const manifest=JSON.parse(bytes);
 if(manifest.version!==1||manifest.kind!=='HDWORK2_FRONTEND_BUILD'||!manifest.files||typeof manifest.files!=='object')fail('INVALID_MANIFEST');
 const origin=new URL(manifest.apiOrigin);if(origin.protocol!=='https:'||origin.origin!==manifest.apiOrigin)fail('INVALID_API_ORIGIN');
 const files=await inventory(source);if(JSON.stringify(files)!==JSON.stringify(manifest.files))fail('BUILD_HASH_MISMATCH');
 const html=await fs.readFile(path.join(source,'index.html'),'utf8');
 const references=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m=>m[1].slice(1));
 if(!references.length||references.some(n=>!files[n]))fail('INDEX_ASSET_MISSING');
 return {source,manifest,files};
}
async function copyFiles(from,to,files){await fs.mkdir(to,{recursive:true});for(const name of Object.keys(files)){const target=path.join(to,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(from,name),target,require('node:fs').constants.COPYFILE_EXCL);}}
function separate(a,b){if(within(a,b)||within(b,a))fail('OVERLAPPING_PATHS_REJECTED');}
async function stage({source,activeDist,releaseDir,manifestSha256}){
 source=await directory(source);activeDist=await directory(activeDist);releaseDir=path.resolve(releaseDir);
 separate(source,activeDist);separate(releaseDir,activeDist);separate(releaseDir,source);
 const parent=await directory(path.dirname(releaseDir));if(path.dirname(releaseDir)!==parent)fail('RELEASE_PARENT_REJECTED');
 const build=await verified(source,manifestSha256),baseline=await inventory(activeDist);
 await fs.mkdir(releaseDir); // Existing staging/backup data must never be overwritten.
 const staged=path.join(releaseDir,'build');await copyFiles(source,staged,build.files);
 await fs.copyFile(path.join(source,'release-manifest.json'),path.join(staged,'release-manifest.json'),require('node:fs').constants.COPYFILE_EXCL);
 await verified(staged,manifestSha256);
 const plan={version:1,state:'STAGED',activeDist,manifestSha256,baseline};await save(path.join(releaseDir,'plan.json'),plan);
 return plan;
}
async function readPlan(releaseDir){releaseDir=await directory(releaseDir);const plan=JSON.parse((await metadata(path.join(releaseDir,'plan.json'))).toString('utf8'));if(plan.version!==1||!['STAGED','APPLYING','ACTIVE','ROLLED_BACK','ROLLBACK_FAILED'].includes(plan.state))fail('INVALID_RELEASE_PLAN');plan.activeDist=await directory(plan.activeDist);separate(releaseDir,plan.activeDist);return {releaseDir,plan};}
async function locked(activeDist,run){const file=path.join(path.dirname(activeDist),'.frontend-only-deployment.lock');const handle=await fs.open(file,'wx');try{return await run();}finally{await handle.close();await fs.unlink(file);}}
async function install(from,to,files){
 for(const [name,hash] of Object.entries(files)){if(name==='index.html')continue;const target=path.join(to,name);await fs.mkdir(path.dirname(target),{recursive:true});
  if(name.startsWith('assets/')){try{if(digest(await fs.readFile(target))!==hash)fail('ASSET_NAME_COLLISION');continue;}catch(e){if(e.code!=='ENOENT')throw e;}await fs.copyFile(path.join(from,name),target,require('node:fs').constants.COPYFILE_EXCL);}
  else await atomic(target,await fs.readFile(path.join(from,name)));
 }
 await atomic(path.join(to,'index.html'),await fs.readFile(path.join(from,'index.html'))); // Switch entry point last; old hashed assets stay available.
}
async function restore(releaseDir,plan,health){
 const backup=path.join(releaseDir,'backup'),files=await inventory(backup);
 if(JSON.stringify(files)!==JSON.stringify(plan.baseline))fail('BACKUP_HASH_MISMATCH');
 for(const name of Object.keys(files).filter(n=>!n.startsWith('assets/')))await atomic(path.join(plan.activeDist,name),await fs.readFile(path.join(backup,name)));
 // Backup assets were never removed/replaced. Check them before reporting rollback success.
 for(const [name,hash] of Object.entries(files))if(digest(await fs.readFile(path.join(plan.activeDist,name)))!==hash)fail('ROLLBACK_HASH_MISMATCH');
 await health({indexHash:files['index.html'],files,activeDist:plan.activeDist});
 plan.state='ROLLED_BACK';await save(path.join(releaseDir,'plan.json'),plan);
}
async function apply({releaseDir,approved=false,health}){
 if(!approved)fail('FRONTEND_ONLY_APPROVAL_REQUIRED');if(typeof health!=='function')fail('HEALTH_CHECK_REQUIRED');
 const read=await readPlan(releaseDir);releaseDir=read.releaseDir;const plan=read.plan;if(plan.state!=='STAGED')fail('RELEASE_NOT_STAGED');
 return locked(plan.activeDist,async()=>{
  const build=await verified(path.join(releaseDir,'build'),plan.manifestSha256);
  if(JSON.stringify(await inventory(plan.activeDist))!==JSON.stringify(plan.baseline))fail('ACTIVE_FRONTEND_CHANGED');
  await health({indexHash:plan.baseline['index.html'],files:plan.baseline,activeDist:plan.activeDist}); // Healthy baseline before any active mutation.
  await copyFiles(plan.activeDist,path.join(releaseDir,'backup'),plan.baseline);
  if(JSON.stringify(await inventory(path.join(releaseDir,'backup')))!==JSON.stringify(plan.baseline))fail('BACKUP_HASH_MISMATCH');
  plan.state='APPLYING';await save(path.join(releaseDir,'plan.json'),plan);
  try{await install(build.source,plan.activeDist,build.files);await health({indexHash:build.files['index.html'],files:build.files,activeDist:plan.activeDist});plan.state='ACTIVE';await save(path.join(releaseDir,'plan.json'),plan);return plan;}
  catch(e){try{await restore(releaseDir,plan,health);}catch{plan.state='ROLLBACK_FAILED';await save(path.join(releaseDir,'plan.json'),plan);fail('DEPLOYMENT_FAILED_ROLLBACK_REQUIRES_REVIEW');}throw Error('DEPLOYMENT_FAILED_ROLLED_BACK',{cause:e});}
 });
}
async function rollback({releaseDir,approved=false,health}){
 if(!approved)fail('FRONTEND_ONLY_APPROVAL_REQUIRED');if(typeof health!=='function')fail('HEALTH_CHECK_REQUIRED');const read=await readPlan(releaseDir);const plan=read.plan;releaseDir=read.releaseDir;
 if(!['ACTIVE','APPLYING','ROLLBACK_FAILED'].includes(plan.state))fail('RELEASE_NOT_ROLLBACKABLE');
 return locked(plan.activeDist,async()=>{const build=await verified(path.join(releaseDir,'build'),plan.manifestSha256);const current=digest(await fs.readFile(path.join(plan.activeDist,'index.html')));if(![build.files['index.html'],plan.baseline['index.html']].includes(current))fail('ACTIVE_FRONTEND_CHANGED');await restore(releaseDir,plan,health);return plan;});
}
function healthCheck(value,fetchImpl=fetch){
 const url=new URL(value);if(url.protocol!=='https:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/login'||url.username||url.password||url.search||url.hash)fail('LOOPBACK_HTTPS_LOGIN_HEALTH_REQUIRED');
 return async({indexHash,files})=>{const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Cache-Control':'no-cache'}});const bytes=Buffer.from(await response.arrayBuffer());if(response.status!==200||digest(bytes)!==indexHash)fail('FRONTEND_HEALTH_FAILED');
  for(const match of bytes.toString('utf8').matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)){const name=match[1].slice(1);if(!safeName(name)||!files?.[name])fail('FRONTEND_HEALTH_FAILED');const asset=await fetchImpl(new URL(match[1],url),{redirect:'error',signal:AbortSignal.timeout(10000)});if(asset.status!==200||digest(Buffer.from(await asset.arrayBuffer()))!==files[name])fail('FRONTEND_ASSET_HEALTH_FAILED');}};
}
async function main(argv=process.argv.slice(2)){
 const [mode,...rest]=argv,args={};for(let i=0;i<rest.length;i+=2){const key=rest[i];if(!['--source','--active-dist','--release-dir','--manifest-sha256','--health-url','--approve-frontend-only'].includes(key)||Object.hasOwn(args,key)||rest[i+1]===undefined)fail('INVALID_ARGUMENTS');args[key]=rest[i+1];}
 let result;if(mode==='stage')result=await stage({source:args['--source'],activeDist:args['--active-dist'],releaseDir:args['--release-dir'],manifestSha256:args['--manifest-sha256']});
 else if(['apply','rollback'].includes(mode))result=await ({apply,rollback}[mode])({releaseDir:args['--release-dir'],approved:args['--approve-frontend-only']==='yes',health:healthCheck(args['--health-url'])});else fail('EXPECTED_STAGE_APPLY_OR_ROLLBACK');
 console.log(JSON.stringify({state:result.state,releaseDir:args['--release-dir']}));
}
if(require.main===module)main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'FRONTEND_RELEASE_FAILED');process.exitCode=1;});
module.exports={attest,verified,inventory,stage,apply,rollback,healthCheck,digest};
