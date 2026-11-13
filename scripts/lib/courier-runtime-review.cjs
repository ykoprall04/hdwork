// Prepare a real new code snapshot; never decrypt or launch any delivery component.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function prepare({source,directory,runtimeConfigFile,runtimeConfigSha256}){
 if(!path.isAbsolute(directory)||fs.existsSync(directory))throw Error('NEW_RUNTIME_REVIEW_DIRECTORY_REQUIRED');
 cp.execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.join(source,'scripts/assert-private-directory.ps1'),'-Directory',path.dirname(directory)],{windowsHide:true,stdio:'pipe'});
 const original=require('../courier-task-runner').configuration(runtimeConfigFile,runtimeConfigSha256);
 const git=args=>cp.execFileSync('git',['-c','safe.directory='+source.replaceAll('\\','/'),...args],{cwd:source,stdio:['ignore','pipe','pipe']});
 const commit=git(['rev-parse','HEAD']).toString().trim();
 if(git(['status','--porcelain','--untracked-files=all']).toString().trim())throw Error('CLEAN_RUNTIME_SOURCE_REQUIRED');
 if(git(['ls-files','-s']).toString().split('\n').some(x=>x.startsWith('120000 ')))throw Error('RUNTIME_ARCHIVE_LINK_REJECTED');
 fs.mkdirSync(directory);const snapshot=path.join(directory,'snapshot');fs.mkdirSync(snapshot);
 for(const name of ['node_modules','service/environment.json','service/secrets.dpapi']){const from=path.join(original.snapshot,name);fs.mkdirSync(path.dirname(path.join(snapshot,name)),{recursive:true});fs.cpSync(from,path.join(snapshot,name),{recursive:true});}
 if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(original.snapshot,'package-lock.json'))))!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(source,'package-lock.json')))))throw Error('RUNTIME_DEPENDENCY_LOCK_CHANGED');
 const names=git(['ls-tree','-r','--name-only',commit]).toString().trim().split('\n').filter(name=>/^(src\/|contracts\/|scripts\/|courier_bot\/courier\/|ops\/windows\/)/.test(name)&&/\.(js|cjs|json|py|ps1)$/.test(name)||['courier-b2c-server.js','courier-api-server.js','api-only-server.js','local-web-server.js','package.json','package-lock.json'].includes(name));
 const tar=path.join(directory,'source.tar');git(['archive','--format=tar','--output='+tar,commit,...names]);cp.execFileSync('tar.exe',['-xf',tar,'-C',snapshot],{windowsHide:true,stdio:'pipe'});
 const sourceHashes={};for(const name of names)sourceHashes[name]=sha(path.join(snapshot,name));
 const plan={...JSON.parse(fs.readFileSync(original.productionPlan)),deliveryMode:'fifo-ack-v2',routingMode:'database',fifoRelease:true};require('../../src/config/production-courier').validate(plan);
 const planFile=path.join(directory,'production-plan.candidate.json');fs.writeFileSync(planFile,JSON.stringify(plan,null,2));
 const runtime={...original,snapshot,productionPlan:planFile,productionPlanSha256:sha(planFile),sourceHashes,environmentSha256:sha(path.join(snapshot,'service/environment.json')),encryptedBundleSha256:sha(path.join(snapshot,'service/secrets.dpapi')),baseCommit:commit,patchCommit:commit,runtimeMode:'flags-off'};
 runtime.binaryHashes={nodeExecutable:sha(runtime.nodeExecutable),pythonExecutable:sha(runtime.pythonExecutable)};
 const configFile=path.join(directory,'runtime.candidate.json');fs.writeFileSync(configFile,JSON.stringify(runtime,null,2));
 fs.writeFileSync(path.join(directory,'startup.fence.json'),JSON.stringify({reason:'PREPARATION_ONLY_NO_APPROVAL',targetCommit:commit}));
 require('../courier-task-runner').configuration(configFile,sha(configFile));
 const result={targetCommit:commit,snapshot,configFile,configSha256:sha(configFile),planSha256:sha(planFile),sourceFiles:Object.keys(sourceHashes).length,mode:'flags-off',productionChanged:false,deliveryReady:false};fs.writeFileSync(path.join(directory,'pins.json'),JSON.stringify(result,null,2));return result;
}
module.exports={prepare};
