const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {readPrivateDpapi}=require('../src/config/private-database-env');
test('tunnel DPAPI rejects external/plaintext files before invoking decrypt',async()=>{
 for(const file of ['../external.dpapi','.local/token.txt']){
  let invoked=false;await assert.rejects(readPrivateDpapi(file,{read:async()=>{invoked=true;}}));assert.equal(invoked,false);
 }
});
test('tunnel DPAPI leaves encrypted fixture unchanged and rejects empty decrypted output',async()=>{
 const folder=fs.mkdtempSync(path.resolve(__dirname,'../.local/tunnel-secret-test-')),file=path.join(folder,'synthetic.dpapi');
 fs.writeFileSync(file,'synthetic-encrypted-fixture',{flag:'wx'});
 try{
  assert.equal(await readPrivateDpapi(file,{read:async()=> 'synthetic-memory-only'}),'synthetic-memory-only');
  assert.equal(fs.readFileSync(file,'utf8'),'synthetic-encrypted-fixture');
  await assert.rejects(readPrivateDpapi(file,{read:async()=>''}));
 }finally{fs.unlinkSync(file);fs.rmdirSync(folder);}
});
