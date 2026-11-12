const fs=require('node:fs'),path=require('node:path');
const {closeAdministrative,validateAllowlist,barrierProof,hash}=require('../src/courier/administrative-closure');
function parse(argv){const a={dryRun:true};for(let i=0;i<argv.length;i++){if(argv[i]==='--execute'){a.dryRun=false;continue;}const k={'--session':'session','--allowlist':'file','--allowlist-sha256':'expectedAllowlistSha256','--barrier':'barrierFile'}[argv[i]];if(!k||!argv[i+1]||a[k])throw Error('ARGUMENT_REJECTED');a[k]=argv[++i];}if(!a.session||!path.isAbsolute(a.session)||!a.file||!path.isAbsolute(a.file))throw Error('EXPLICIT_SESSION_AND_ALLOWLIST_REQUIRED');return a;}
async function main(argv){const a=parse(argv),allowlist=JSON.parse(fs.readFileSync(a.file,'utf8').replace(/^\uFEFF/,'')),seal=validateAllowlist(allowlist),barrier=a.barrierFile?JSON.parse(fs.readFileSync(a.barrierFile,'utf8').replace(/^\uFEFF/,'')):undefined;
 if(a.expectedAllowlistSha256!==seal)throw Object.assign(Error('ALLOWLIST_SEAL_MISMATCH'),{code:'ALLOWLIST_SEAL_MISMATCH'});
 if(!a.dryRun){
  barrierProof(barrier,seal,allowlist);
  if(!path.isAbsolute(barrier.backupReceiptFile||''))throw Object.assign(Error('BACKUP_RECEIPT_FILE_REQUIRED'),{code:'BACKUP_RECEIPT_FILE_REQUIRED'});
  const tools=require('./lib/courier-cutover.cjs'),receipt=JSON.parse(tools.regular(barrier.backupReceiptFile));
  if(hash(receipt)!==barrier.backupReceiptSha256)throw Object.assign(Error('BACKUP_RECEIPT_PIN_MISMATCH'),{code:'BACKUP_RECEIPT_PIN_MISMATCH'});
  tools.pairedReceipt(receipt,barrier,allowlist,seal,path.dirname(a.barrierFile));
 }
 const session=require(a.session);try{return await closeAdministrative(await session.pool(),{allowlist,barrier,dryRun:a.dryRun,expectedAllowlistSha256:a.expectedAllowlistSha256});}finally{await session.close?.();}}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.log(JSON.stringify({status:'STOP',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'CLOSURE_REJECTED'}));process.exitCode=1;});
module.exports={main,parse};
