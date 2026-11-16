const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const {check,files}=require('../scripts/check-web-vlan-payload.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('physical Web payload: missing helper reproduced, narrow repair works with legacy command parser, tampering rejected',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-vlan-fixture-')),runtime=path.join(temp,'runtime'),payload=path.join(temp,'payload'),pins={};
 const helper='src/b2c-workflow/order-network.js',target=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const put=(root,f,b)=>{const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);};
 try{
  fs.mkdirSync(runtime,{recursive:true});fs.symlinkSync(path.resolve('node_modules'),path.join(runtime,'node_modules'),process.platform==='win32'?'junction':'dir');
  for(const f of files){if(f===helper)continue;let b=fs.readFileSync(f);
   // Model the independently deployed legacy parser; do not replace it in payload.
   if(f==='src/b2c-workflow/commands.js')b=Buffer.from(b.toString()
    .replace("if(['order','config_psb'].includes(command))Object.assign(fields,require('./order-network').parseNetwork(body));",'')
    .replace('label=rule.aliases?.[label]||label;','')
    .replace('if(Object.hasOwn(fields,label))','if(rule.required.includes(label)&&Object.hasOwn(fields,label))'));
   put(runtime,f,b);pins[f]=hash(b);
  }
  assert.throws(()=>require(path.join(runtime,'src/vlan/format.js')),e=>e.code==='MODULE_NOT_FOUND');
  assert.throws(()=>check({runtime,payload,pins,target}),/ENOENT/);
  const bytes=cp.execFileSync('git',['show',target+':'+helper]);put(payload,helper,bytes);
  assert.deepEqual(check({runtime,payload,pins,target}),{status:'PASS',files:files.length,databaseAccessed:false});
  const crlf=Buffer.from(bytes.toString('latin1').replace(/\r?\n/g,'\r\n'),'latin1');
  put(payload,helper,crlf);assert.deepEqual(check({runtime,payload,pins,target}),{status:'PASS',files:files.length,databaseAccessed:false});
  assert.notEqual(hash(crlf),hash(bytes),'actual-byte pins must distinguish line endings');
  put(payload,helper,Buffer.from(crlf.toString('latin1').replace('function parseNetwork','function  parseNetwork'),'latin1'));assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_TARGET_DRIFT/);
  assert.equal(fs.existsSync(path.join(payload,'src/b2c-workflow/commands.js')),false);
  put(payload,helper,Buffer.from(bytes+'\n// tamper'));assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_TARGET_DRIFT/);
  put(payload,helper,bytes);
  const contract='contracts/b2c-commands.json',contractBytes=cp.execFileSync('git',['show',target+':'+contract]);
  const stale=JSON.parse(contractBytes);stale.config_psb.optional=stale.config_psb.optional.filter(name=>name!=='NIK ATASAN');
  const staleBytes=Buffer.from(JSON.stringify(stale));put(runtime,contract,staleBytes);pins[contract]=hash(staleBytes);
  assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_FORMAT_FAILED/,'a valid old runtime pin alone does not prove current export/detail readiness');
  put(payload,contract,contractBytes);assert.deepEqual(check({runtime,payload,pins,target}),{status:'PASS',files:files.length,databaseAccessed:false});
  const contractCrlf=Buffer.from(contractBytes.toString('latin1').replace(/\r?\n/g,'\r\n'),'latin1');
  put(payload,contract,contractCrlf);assert.deepEqual(check({runtime,payload,pins,target}),{status:'PASS',files:files.length,databaseAccessed:false});assert.notEqual(hash(contractBytes),hash(contractCrlf));
  put(payload,contract,Buffer.from(contractBytes+' '));assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_TARGET_DRIFT/);
  put(payload,contract,contractBytes);
  const moduleFile=path.join(runtime,'src/operations/modules.js'),original=fs.readFileSync(moduleFile);
  const changedNewlines=Buffer.from(original.toString('latin1').includes('\r\n')?original.toString('latin1').replace(/\r\n/g,'\n'):original.toString('latin1').replace(/\n/g,'\r\n'),'latin1');
  fs.writeFileSync(moduleFile,changedNewlines);assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_RUNTIME_DRIFT/);
  fs.writeFileSync(moduleFile,original);fs.appendFileSync(moduleFile,'\n// tamper');assert.throws(()=>check({runtime,payload,pins,target}),/VLAN_PAYLOAD_RUNTIME_DRIFT/);
 }finally{const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('hdwork-vlan-fixture-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
test('updater selects the exact helper even when unchanged in Git and absent from runtime; then becomes a no-op',{skip:process.platform!=='win32'},()=>{
 const ps=String.raw`
$ErrorActionPreference='Stop';$root=$PWD.Path
$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts/hdwork-web-update.ps1'),[ref]$tokens,[ref]$errors)
foreach($s in $ast.EndBlock.Statements){if($s -is [System.Management.Automation.Language.FunctionDefinitionAst]){. ([scriptblock]::Create($s.Extent.Text))}}
$temp=Join-Path $env:TEMP ('hdwork-vlan-select-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($temp)
try{
 $target=(& git rev-parse HEAD).Trim();$web=[pscustomobject]@{Runtime=$temp;Config=[pscustomobject]@{sourceHashes=[pscustomobject]@{}}}
 $p=@(RequiredVlanHelper $web $target);Need ($p.Count -eq 1 -and $p[0] -ceq 'src/b2c-workflow/order-network.js') 'MISSING_HELPER_NOT_SELECTED'
 $dest=Join-Path $temp $p[0];[void][IO.Directory]::CreateDirectory((Split-Path -Parent $dest));Copy-Item $p[0] $dest
 $web.Config.sourceHashes|Add-Member -NotePropertyName $p[0] -NotePropertyValue (Hash $dest)
 Need (@(RequiredVlanHelper $web $target).Count -eq 0) 'UNCHANGED_HELPER_RESELECTED'
 [IO.File]::AppendAllText($dest,'tamper');$blocked=$false;try{RequiredVlanHelper $web $target}catch{$blocked=$_.Exception.Message -eq 'WEB_RUNTIME_SOURCE_DRIFT'};Need $blocked 'HELPER_DRIFT_NOT_BLOCKED'
 Need (WebPath 'src/b2c-workflow/order-network.js') 'HELPER_EXCLUDED';Need (-not(WebPath 'src/b2c-workflow/commands.js')) 'COMMANDS_EXPOSED';Need (-not(WebPath 'src/b2c-workflow/workflow.js')) 'WORKER_EXPOSED'
 $contracts=@(RequiredWebContracts $web $target);Need ($contracts.Count -eq 2) 'MISSING_CONTRACTS_NOT_SELECTED'
 foreach($relative in $contracts){Need (WebPath $relative) 'CONTRACT_EXCLUDED';$file=Join-Path $temp $relative;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $file));Copy-Item $relative $file;$web.Config.sourceHashes|Add-Member -NotePropertyName $relative -NotePropertyValue (Hash $file)}
 Need (@(RequiredWebContracts $web $target).Count -eq 0) 'UNCHANGED_CONTRACTS_RESELECTED'
 $file=Join-Path $temp 'contracts/b2c-commands.json';[IO.File]::WriteAllText($file,'{}');$web.Config.sourceHashes.'contracts/b2c-commands.json'=Hash $file
 Need (@(RequiredWebContracts $web $target).Count -eq 1) 'PINNED_OLD_CONTRACT_NOT_REPLACED'
 [IO.File]::AppendAllText($file,'tamper');$blocked=$false;try{RequiredWebContracts $web $target}catch{$blocked=$_.Exception.Message -eq 'WEB_RUNTIME_SOURCE_DRIFT'};Need $blocked 'CONTRACT_DRIFT_NOT_BLOCKED'
 Need (-not(WebPath 'contracts/unrelated.json')) 'ALL_CONTRACTS_EXPOSED'
 Write-Output 'VLAN_SELECTION_PASS'
}finally{$resolved=[IO.Path]::GetFullPath($temp);if((Split-Path -Parent $resolved) -ne [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notlike 'hdwork-vlan-select-*'){throw 'CLEANUP_SCOPE'};Remove-Item -LiteralPath $resolved -Recurse -Force}
`;
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/VLAN_SELECTION_PASS/);
});
