const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),updater=path.join(repo,'scripts/hdwork-web-update.ps1');
const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');

test('numeric-leading SHA is kept intact in candidate and rollback task actions',{skip:process.platform!=='win32'},()=>{
 const output=cp.execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',updater,'-Mock'],{cwd:repo,windowsHide:true,encoding:'utf8',stdio:'pipe'});
 const result=/MOCK_PASS checks=(\d+) webRuntimeChanged=false courierTouched=false/.exec(output);
 assert.ok(result&&Number(result[1])>=59,'task action and reviewed database/retention checks must pass');
});
