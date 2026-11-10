// Stage two reviewed code files over the pinned base. Never change active files or config.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{randomUUID}=require('node:crypto');
const {hash}=require('./apply-live-chat-web-overlay');
const base='4ef886e9bb2176b15f86cb3c2462a601fb8d14d6';
const files=['src/chat/service.js','courier_bot/courier/groups.py'];
function read(file){const p=path.resolve(file),s=fs.lstatSync(p),real=fs.realpathSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>8*1024*1024||(process.platform==='win32'?real.toLowerCase()!==p.toLowerCase():real!==p))throw Error('UNSAFE_INCOMING_FIX_INPUT');return fs.readFileSync(p);}
const norm=b=>b.toString('utf8').replace(/\r\n/g,'\n');
function prepare({prepared,patchCommit,repo=path.resolve(__dirname,'..')}={}){
 if(!/^[a-f0-9]{40}$/.test(patchCommit||''))throw Error('EXACT_PATCH_COMMIT_REQUIRED');
 prepared=path.resolve(prepared);repo=path.resolve(repo);
 const git=args=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
 if(git(['cat-file','-t',patchCommit]).toString('utf8').trim()!=='commit')throw Error('PATCH_MUST_BE_A_COMMIT');
 const original=JSON.parse(read(path.join(prepared,'production-plan.review.json')));
 if(original.commit!==base||!original.backupComplete)throw Error('PINNED_BASE_PREPARATION_REQUIRED');
 const snapshot=path.resolve(original.snapshot),env=read(path.join(snapshot,'service/environment.json')),values=JSON.parse(env);
 const patch={HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'false'};
 if(Object.entries(patch).some(([k,v])=>values[k]!==v)||hash(Buffer.from(JSON.stringify({...values,...patch},null,2)+'\n'))!==hash(env))throw Error('UNCHANGED_ACTIVE_CHAT_CONFIG_REQUIRED');
 const cipher=read(path.join(snapshot,'service/secrets.dpapi'));
 if(hash(cipher)!==original.encryptedBundleSha256)throw Error('PROTECTED_BUNDLE_CHANGED');
 const entries=[],content=[];
 for(const file of files){
  const before=read(path.join(snapshot,file)),ancestor=git(['show',base+':'+file]),after=git(['show',patchCommit+':'+file]);
  if(norm(before)!==norm(ancestor))throw Error('RUNTIME_SOURCE_DRIFT');
  if(norm(read(path.join(repo,file)))!==norm(after))throw Error('PATCH_WORKTREE_MISMATCH');
  if(file.endsWith('.js')){
   const prefix=s=>s.slice(0,s.indexOf('async function captureIncoming'));
   const suffix=s=>s.slice(s.indexOf('async function recordOriginal'));
   if(prefix(norm(before))!==prefix(norm(after))||suffix(norm(before))!==suffix(norm(after)))throw Error('OUTGOING_CHAT_OR_AUTH_CHANGE_REJECTED');
  }else if(norm(before).split('    def outgoing(')[1]!==norm(after).split('    def outgoing(')[1])throw Error('OUTGOING_COURIER_CHANGE_REJECTED');
  entries.push({file,before:hash(before),after:hash(after),classification:'KNOWN_ANCESTOR',ancestor:base});content.push({file,before,after});
 }
 const output=path.join(prepared,'incoming-fix-'+randomUUID());fs.mkdirSync(output,{mode:0o700});
 const write=(file,bytes)=>{const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});};
 for(const e of content){write('backup/'+e.file,e.before);write('payload/'+e.file,e.after);}
 write('backup/service/environment.json',env);write('backup/service/secrets.dpapi',cipher);
 const plan={version:1,kind:'HDWORK2_INCOMING_CHAT_FIX',status:'STAGED_NOT_ACTIVATED',backupComplete:true,commit:patchCommit,baseCommit:base,snapshot,entries,environmentSha256:hash(env),encryptedBundleSha256:hash(cipher),patch,configurationChanged:false,requires:'STOP_ONLY_COURIER_BEFORE_APPLY_OR_ROLLBACK'};
 const bytes=JSON.stringify(plan,null,2)+'\n';write('production-plan.review.json',bytes);
 for(const e of content){if(hash(read(path.join(output,'backup',e.file)))!==hash(e.before)||hash(read(path.join(output,'payload',e.file)))!==hash(e.after)||hash(read(path.join(snapshot,e.file)))!==hash(e.before))throw Error('INCOMING_FIX_BACKUP_OR_PREIMAGE_CHANGED');}
 return {status:'INCOMING_FIX_STAGED_NOT_APPLIED',output,baseCommit:base,patchCommit,planSha256:hash(bytes),backupVerified:true,runtimeChanged:false,configurationChanged:false};
}
if(require.main===module){try{const a=process.argv.slice(2);if(a.length!==4||a[0]!=='--prepared'||a[2]!=='--patch-commit')throw Error();console.log(JSON.stringify(prepare({prepared:a[1],patchCommit:a[3]}),null,2));}catch{console.error('INCOMING_FIX_PREPARATION_FAILED');process.exitCode=1;}}
module.exports={prepare};
