// Validate the physical post-update module tree before Web is stopped.
// Copies only source dependencies to an owned disposable tree; no env/secrets/DB.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const files=['src/vlan/format.js','src/vlan/reference.js','src/operations/policy.js','src/operations/modules.js','src/b2c-workflow/order-network.js','src/b2c-workflow/commands.js','contracts/b2c-commands.json','src/courier/workspace-command.js','contracts/workspace-commands.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
// Latin-1 round-trip preserves every byte; only CRLF pairs become LF here.
// Never use this normalization for the runtime's byte-level integrity pins.
const sourceBytes=b=>Buffer.from(b.toString('latin1').replace(/\r\n/g,'\n'),'latin1');
function check({runtime,payload,pins,target,repo=path.resolve(__dirname,'..')}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-vlan-payload-'));
 try{
  for(const relative of files){
   const candidate=path.join(payload,relative),from=fs.existsSync(candidate)?candidate:path.join(runtime,relative);
   const stat=fs.lstatSync(from);if(!stat.isFile()||stat.isSymbolicLink())throw Error('VLAN_PAYLOAD_FILE_REJECTED');
   const bytes=fs.readFileSync(from);
   if(from===candidate){
    const expected=cp.execFileSync('git',['-C',repo,'show',target+':'+relative],{maxBuffer:4*1024*1024,stdio:['ignore','pipe','ignore']});
    if(!sourceBytes(bytes).equals(sourceBytes(expected)))throw Error('VLAN_PAYLOAD_TARGET_DRIFT');
   }else if(hash(bytes)!==pins[relative])throw Error('VLAN_PAYLOAD_RUNTIME_DRIFT');
   if(relative==='src/b2c-workflow/order-network.js'&&/\brequire\s*\(|\bimport\b/.test(bytes.toString()))throw Error('VLAN_NETWORK_HELPER_NOT_LEAF');
   const dest=path.join(temp,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
  }
  const result=cp.spawnSync(process.execPath,['-e',String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
const {formatOrder}=require(path.resolve(process.argv[1],'src/vlan/format.js'));
(async()=>{for(const command of ['order','config_psb']){
 const head=command==='order'?'/order\nSC/IN:DGPS-AO123\nSN ONT:TEST\nTIPE TRANSAKSI:AO\nNIK:TEST':'/config_psb\nORDER ID:DGPS-AO123\nSERVICE (1P/2P/3P/1P-Voice):1P\nTIPE ONT:TEST';
 const raw=head+'\nSTO:BKL\nKETERANGAN:synthetic\nNO INTERNET:000123\nIP OLT:172.27.106.125\nSlot:2\nPort:3\nPORT ODP:99\nValins ID:TEST';
 let queries=0;const r=await formatOrder({data:{command},fields:{STO:'BKL'},originalMessage:raw},{async execute(sql,args){queries++;assert.deepEqual(args,['172.27.106.125','MDR']);return [[{vlan_inet:'1035',vlan_voip:'500-502'}]];}});
 assert.equal(queries,1);assert.equal(r.lookup.status,'found');assert.match(r.text,/SLOT \/ PORT : 2 \/ 3/);assert.match(r.text,/DATA VLAN VOIP 500-502/);
}})().catch(()=>process.exitCode=1);
`,temp],{encoding:'utf8',timeout:10000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
  if(result.status!==0)throw Error('VLAN_PAYLOAD_FORMAT_FAILED');
  return {status:'PASS',files:files.length,databaseAccessed:false};
 }finally{
  const resolved=path.resolve(temp),parent=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('hdwork-vlan-payload-'))throw Error('VLAN_PAYLOAD_CLEANUP_SCOPE_REJECTED');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
if(require.main===module){try{const [runtime,payload,control,target]=process.argv.slice(2);if(process.argv.length!==6)throw Error();const pins=JSON.parse(fs.readFileSync(control)).sourceHashes;console.log(JSON.stringify(check({runtime,payload,pins,target})));}catch{console.error('VLAN_PAYLOAD_CHECK_FAILED');process.exitCode=1;}}
module.exports={check,files};
