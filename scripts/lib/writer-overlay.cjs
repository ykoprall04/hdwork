// File-only preparation. Never imports the candidate application or controls services.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const FILES=Object.freeze(['src/courier/mysql-store.js','src/courier/fifo.js','src/courier/fifo-release.js','src/courier/writer-fence.js','src/config/courier-writer.js','src/config/operational-pools.js','src/config/live-chat-activation.js','src/config/operational-grants.js','src/operations/live-signal.js','src/operations/transaction-gate.js','src/access/store.js','src/system/store.js','src/config/web-drain.js','src/config/readiness-probe.js','src/api-only-app.js','api-only-server.js','local-web-server.js','src/local-web.js','scripts/protected-web-service.js','ops/windows/web-native-supervisor.ps1','ops/windows/web-native-control.ps1']);
function files(root){const result={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('OVERLAY_LINK_REJECTED');if(entry.isDirectory())walk(file);else if(entry.isFile())result[path.relative(root,file).replaceAll('\\','/')]=sha(fs.readFileSync(file));}}walk(root);return result;}
function prepare({baseline,source,directory,botId='hdworkopsbot-testing',copyDependencies=true}){
 for(const p of [baseline,source,directory])if(!path.isAbsolute(p))throw Error('ABSOLUTE_OVERLAY_PATHS_REQUIRED');
 if(fs.existsSync(directory))throw Error('NEW_OVERLAY_DIRECTORY_REQUIRED');
 if(process.platform==='win32')cp.execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../assert-private-directory.ps1'),'-Directory',path.dirname(directory)],{windowsHide:true,stdio:'pipe'});
 else if(fs.statSync(path.dirname(directory)).mode&0o077)throw Error('PRIVATE_DIRECTORY_ACL_REJECTED');
 for(const p of [baseline,source])if(directory.toLowerCase()===p.toLowerCase()||directory.toLowerCase().startsWith(baseline.toLowerCase()+path.sep))throw Error('OVERLAY_PRODUCTION_PATH_REJECTED');
 if(!/^[a-z][a-z0-9_-]{1,63}$/.test(botId))throw Error('OVERLAY_BOT_REJECTED');
 const git=args=>cp.execFileSync('git',['-c','safe.directory='+source.replaceAll('\\','/'),...args],{cwd:source,stdio:['ignore','pipe','pipe']});
 const commit=git(['rev-parse','HEAD']).toString().trim();
 const sourceBytes={};for(const file of FILES){const committed=git(['show',commit+':'+file]),disk=fs.readFileSync(path.join(source,file));if(committed.toString().replaceAll('\r\n','\n')!==disk.toString().replaceAll('\r\n','\n'))throw Error('UNCOMMITTED_OVERLAY_SOURCE');sourceBytes[file]=committed;}
 if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(baseline,'package-lock.json'))))!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(source,'package-lock.json')))))throw Error('OVERLAY_DEPENDENCY_LOCK_CHANGED');
 const env=JSON.parse(fs.readFileSync(path.join(baseline,'service/environment.json')));
 if(env.COURIER_ENABLED!=='false'||env.HDWORK2_TESTING_SOLVER_ENABLED!=='false')throw Error('EXISTING_EXTERNAL_SENDER_NOT_OFF');
 fs.mkdirSync(directory,{recursive:true});
 const roots=['src','contracts','scripts','api-only-server.js','local-web-server.js','package.json','package-lock.json','frontend/dist','service/environment.json','service/secrets.dpapi','.local/tls',...(copyDependencies?['node_modules']:[])];
 const packets={};for(const name of ['candidate','rollback']){
  const root=path.join(directory,name);fs.mkdirSync(root);
  for(const file of roots){const from=path.join(baseline,file);if(fs.existsSync(from)){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.cpSync(from,path.join(root,file),{recursive:true,dereference:false});}}
  for(const [file,bytes] of Object.entries(sourceBytes)){const to=path.join(root,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);}
  const next={...env,PORT:name==='candidate'?'3092':'3093',LOCAL_HTTPS_PORT:name==='candidate'?'8444':'8445',HDWORK2_COURIER_WRITER_V2_BOTS_JSON:JSON.stringify([botId])};
  fs.writeFileSync(path.join(root,'service/environment.json'),JSON.stringify(next,null,2));fs.mkdirSync(path.join(root,'service/state'),{recursive:true});
  const hashes=files(root);const manifest={kind:'HDWORK2_WRITER_OVERLAY',sourceCommit:commit,baseline,botId,files:hashes,overlay:FILES,dependenciesCopied:copyDependencies,productionChanged:false,installed:false,telegramEnabled:false};
  fs.writeFileSync(path.join(root,'overlay-manifest.json'),JSON.stringify(manifest,null,2));
  const controlRoot=path.join(directory,'control-'+name);fs.mkdirSync(controlRoot);
  const control={kind:'HDWORK2_WEB_SUPERVISOR',version:1,targetCommit:commit,ownerSid:'S-1-5-19',taskName:name==='candidate'?'HDWork2-Web-Standby':'HDWork2-Web-Rollback',pipeName:'hdwork2-web-'+crypto.randomUUID().replaceAll('-',''),graceSeconds:60,stateFile:path.join(controlRoot,'state.json'),fenceFile:path.join(controlRoot,'startup.fence.json'),childExecutable:process.execPath,childExecutableSha256:sha(fs.readFileSync(process.execPath)),childCodeFile:path.join(root,'scripts/protected-web-service.js'),childCodeSha256:hashes['scripts/protected-web-service.js'],childArguments:[path.join(root,'scripts/protected-web-service.js')],childWorkingDirectory:root,supervisorScript:path.join(root,'ops/windows/web-native-supervisor.ps1'),supervisorSha256:hashes['ops/windows/web-native-supervisor.ps1'],secretBundleFile:path.join(root,'service/secrets.dpapi'),encryptedBundleSha256:hashes['service/secrets.dpapi'],sourceHashes:hashes};
  const controlFile=path.join(controlRoot,'config.json');fs.writeFileSync(controlFile,JSON.stringify(control,null,2));
  fs.writeFileSync(control.fenceFile,JSON.stringify({reason:'PREPARATION_ONLY_NO_APPROVAL',configSha256:sha(fs.readFileSync(controlFile))}));
  fs.writeFileSync(path.join(controlRoot,'task-settings.json'),JSON.stringify({priority:4,allowHardTerminate:false,multipleInstances:'IgnoreNew',executionTimeLimit:'PT0S',registerTask:false,requiresLocalServiceReadAcl:true},null,2));
  packets[name]={directory:root,manifestSha256:sha(fs.readFileSync(path.join(root,'overlay-manifest.json'))),controlFile,controlSha256:sha(fs.readFileSync(controlFile)),startupFenced:true};
 }
 const report={sourceCommit:commit,packets,productionChanged:false,readyForDeployment:false,requiresPrivateAcl:true,requiresLegacyOwnerRetirement:true};fs.writeFileSync(path.join(directory,'preparation.json'),JSON.stringify(report,null,2));return report;
}
module.exports={prepare,FILES,files};
