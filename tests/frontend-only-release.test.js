const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const release=require('../scripts/frontend-only-release');
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'hdwork-frontend-mock-'));try{
 const active=path.join(root,'runtime/frontend/dist'),source=path.join(root,'candidate'),stage=path.join(root,'release');
 async function output(dir,tag){await fs.mkdir(path.join(dir,'assets'),{recursive:true});await fs.writeFile(path.join(dir,'assets',tag+'-abcdefgh.js'),'console.log("'+tag+'")');await fs.writeFile(path.join(dir,'favicon.svg'),'<svg>'+tag+'</svg>');await fs.writeFile(path.join(dir,'index.html'),'<html><script type="module" src="/assets/'+tag+'-abcdefgh.js"></script></html>');}
 await output(active,'old');await output(source,'new');await fs.mkdir(path.join(root,'runtime/service'));await fs.writeFile(path.join(root,'runtime/service/environment.json'),JSON.stringify({HDWORK2_LOCAL_READ_ONLY:'true',OP_WRITE_ENABLED:'false',HDWORK2_OPERATIONAL_WRITE_APPROVED:'false'}));
 const backend=path.join(root,'runtime/backend.js');await fs.writeFile(backend,'synthetic untouched backend');
 const runtimeBefore=await fs.readFile(path.join(root,'runtime/service/environment.json'),'utf8'),hash=await release.attest(source,'https://example.test',{authCookie:true,operations:true,liveChat:true});
 const config={source,activeDist:active,releaseDir:stage,manifestSha256:hash};
 const health=async({indexHash,activeDist})=>assert.equal(release.digest(await fs.readFile(path.join(activeDist,'index.html'))),indexHash);
 await run({root,active,source,stage,hash,config,health});
 assert.equal(await fs.readFile(path.join(root,'runtime/service/environment.json'),'utf8'),runtimeBefore);assert.equal(await fs.readFile(backend,'utf8'),'synthetic untouched backend');
 }finally{await fs.rm(root,{recursive:true,force:true});}}
test('missing/malformed API origin fails clearly before spawn, without echoing provided values or choosing defaults',()=>{
 const {environment,build}=require('../scripts/build-operational-frontend');let spawned=0;
 for(const value of [undefined,'','  '])assert.throws(()=>build({env:{VITE_API_BASE_URL:value},argv:['--build'],spawn(){spawned++;}}),/VITE_API_BASE_URL is required/);
 for(const value of ['bad-secret-value','https://['])assert.throws(()=>environment({VITE_API_BASE_URL:value}),e=>e.message==='VITE_API_BASE_URL must be a valid HTTPS origin');assert.equal(spawned,0);
});
test('staging verifies manifest and copies only static build; active frontend, backend and runtime permissions stay unchanged',()=>fixture(async f=>{
 const before=await release.inventory(f.active);assert.equal((await release.stage(f.config)).state,'STAGED');assert.deepEqual(await release.inventory(f.active),before);assert.deepEqual((await release.verified(path.join(f.stage,'build'),f.hash)).files,await release.inventory(f.source));await assert.rejects(release.stage(f.config),{code:'EEXIST'});
}));
test('mock apply makes backup, switches index last, preserves old assets and explicit rollback restores old frontend',()=>fixture(async f=>{
 const before=await release.inventory(f.active);await release.stage(f.config);await assert.rejects(release.apply({releaseDir:f.stage,health:f.health}),/APPROVAL/);
 const applied=await release.apply({releaseDir:f.stage,approved:true,health:f.health});assert.equal(applied.state,'ACTIVE');assert.equal(await fs.readFile(path.join(f.active,'assets/old-abcdefgh.js'),'utf8'),'console.log("old")');assert.deepEqual(await release.inventory(path.join(f.stage,'backup')),before);
 assert.equal((await release.rollback({releaseDir:f.stage,approved:true,health:f.health})).state,'ROLLED_BACK');for(const [name,hash]of Object.entries(before))assert.equal(release.digest(await fs.readFile(path.join(f.active,name))),hash);
}));
test('failed post-switch health automatically rolls back, verifies recovery and keeps backup for review',()=>fixture(async f=>{
 await release.stage(f.config);let checks=0;await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:async input=>{checks++;if(checks===2)throw Error('synthetic frontend unavailable');await f.health(input);}}),/DEPLOYMENT_FAILED_ROLLED_BACK/);assert.equal(checks,3);assert.equal(JSON.parse(await fs.readFile(path.join(f.stage,'plan.json'))).state,'ROLLED_BACK');assert.ok((await fs.readFile(path.join(f.active,'index.html'),'utf8')).includes('old-abcdefgh'));
}));
test('failed recovery health is explicitly ROLLBACK_FAILED rather than false success',()=>fixture(async f=>{
 await release.stage(f.config);let checks=0;await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:async input=>{if(++checks>1)throw Error('synthetic offline');await f.health(input);}}),/ROLLBACK_REQUIRES_REVIEW/);assert.equal(JSON.parse(await fs.readFile(path.join(f.stage,'plan.json'))).state,'ROLLBACK_FAILED');assert.equal((await release.rollback({releaseDir:f.stage,approved:true,health:f.health})).state,'ROLLED_BACK');
}));
test('tampered build, changed active files and overlapping paths fail closed before active changes',()=>fixture(async f=>{
 await assert.rejects(release.stage({...f.config,manifestSha256:'0'.repeat(64)}),/MANIFEST_HASH/);await assert.rejects(release.stage({...f.config,releaseDir:path.join(f.active,'release')}),/OVERLAPPING/);await release.stage(f.config);await fs.writeFile(path.join(f.stage,'build/assets/new-abcdefgh.js'),'tampered');await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:f.health}),/BUILD_HASH/);assert.ok((await fs.readFile(path.join(f.active,'index.html'),'utf8')).includes('old-abcdefgh'));
}));
test('active changes and concurrent lock prevent deployment',()=>fixture(async f=>{
 await release.stage(f.config);await fs.writeFile(path.join(f.active,'assets/old-abcdefgh.js'),'changed');await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:f.health}),/ACTIVE_FRONTEND_CHANGED/);await fs.writeFile(path.join(f.active,'assets/old-abcdefgh.js'),'console.log("old")');const lock=path.join(path.dirname(f.active),'.frontend-only-deployment.lock');await fs.writeFile(lock,'other owner');await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:f.health}),{code:'EEXIST'});assert.equal(await fs.readFile(lock,'utf8'),'other owner');
}));
test('non-static files and symlinks are rejected; no configuration or secret is read into releases',()=>fixture(async f=>{
 await fs.writeFile(path.join(f.source,'.env'),'fixture-not-secret');await assert.rejects(release.inventory(f.source),/NON_STATIC_FILE/);await fs.unlink(path.join(f.source,'.env'));await fs.symlink(path.join(f.active,'index.html'),path.join(f.source,'linked.js'));await assert.rejects(release.inventory(f.source),/LINK_REJECTED/);
}));
test('health check is loopback HTTPS frontend only, validates content and assets, rejects redirects/API targets',async()=>{
 for(const url of ['https://example.test/login','http://127.0.0.1/login','https://localhost/api/health','https://user:pass@localhost/login'])assert.throws(()=>release.healthCheck(url),/LOOPBACK/);
 const html='<script src="/assets/test-abcdefgh.js"></script>',asset='fixture',files={'assets/test-abcdefgh.js':release.digest(asset)};const urls=[];await release.healthCheck('https://localhost:8443/login',async(url,options)=>{urls.push(String(url));assert.equal(options.redirect,'error');return new Response(url.pathname==='/login'?html:asset);})({indexHash:release.digest(html),files});assert.equal(urls.length,2);await assert.rejects(release.healthCheck('https://localhost/login',async()=>new Response('wrong build'))({indexHash:release.digest(html),files}),/HEALTH_FAILED/);
});
test('operational-write deployment remains unchanged and frontend wrapper has no runtime/service/secret commands',async()=>{
 const {execFileSync}=require('node:child_process');const baseline=execFileSync('git',['show','61d360a:scripts/deploy-hdwork2-operational.ps1'],{encoding:'utf8'});assert.equal(await fs.readFile('scripts/deploy-hdwork2-operational.ps1','utf8'),baseline);
 const script=await fs.readFile('scripts/deploy-hdwork2-frontend-only.ps1','utf8');assert.doesNotMatch(script,/Set-ScheduledTask|Start-ScheduledTask|Stop-ScheduledTask|Restart-Service|ProtectedData|OP_WRITE_ENABLED|HDWORK2_LOCAL_READ_ONLY|HDWORK2_OPERATIONAL_WRITE_APPROVED/);assert.match(script,/\$Mode='Stage'/);
});

test('asset filename collision never replaces content required by existing browser tabs',()=>fixture(async f=>{
 await fs.unlink(path.join(f.source,'assets/new-abcdefgh.js'));await fs.writeFile(path.join(f.source,'assets/old-abcdefgh.js'),'new bytes under old filename');await fs.writeFile(path.join(f.source,'index.html'),'<script src="/assets/old-abcdefgh.js"></script>');f.config.manifestSha256=await release.attest(f.source,'https://example.test',{});await release.stage(f.config);await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:f.health}),/ROLLED_BACK/);assert.equal(await fs.readFile(path.join(f.active,'assets/old-abcdefgh.js'),'utf8'),'console.log("old")');
}));
test('unhealthy baseline prevents writes and corrupt backup blocks manual rollback',()=>fixture(async f=>{
 await release.stage(f.config);await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:async()=>{throw Error('baseline offline');}}),/baseline offline/);assert.equal(JSON.parse(await fs.readFile(path.join(f.stage,'plan.json'))).state,'STAGED');await release.apply({releaseDir:f.stage,approved:true,health:f.health});await fs.writeFile(path.join(f.stage,'backup/index.html'),'corrupt backup');await assert.rejects(release.rollback({releaseDir:f.stage,approved:true,health:f.health}),/BACKUP_HASH_MISMATCH/);assert.ok((await fs.readFile(path.join(f.active,'index.html'),'utf8')).includes('new-abcdefgh'));
}));

test('manifest and plan symlinks are rejected before following their targets',()=>fixture(async f=>{
 await fs.unlink(path.join(f.source,'release-manifest.json'));await fs.symlink(path.join(f.root,'nonexistent-sensitive-target'),path.join(f.source,'release-manifest.json'));await assert.rejects(release.verified(f.source,f.hash),/UNSAFE_RELEASE_METADATA/);
 await fs.mkdir(f.stage);await fs.symlink(path.join(f.root,'nonexistent-sensitive-target'),path.join(f.stage,'plan.json'));await assert.rejects(release.apply({releaseDir:f.stage,approved:true,health:f.health}),/UNSAFE_RELEASE_METADATA/);
}));
