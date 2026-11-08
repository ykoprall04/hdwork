const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {privateFile,loadPrivatePassword}=require('../src/config/private-database-env');
const {reviewGrants}=require('../src/access/database-audit');
const env={DB_USER:'hdwork_auth',DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_PORT:'3306',HDWORK2_LOCAL_READ_ONLY:'true',DB_PASSWORD_DPAPI_FILE:'.local/private-loader-test.dpapi'};
test('private credential target guards reject root, legacy/remote targets, writable mode and plaintext before decryption',async()=>{
 for(const patch of [{DB_USER:'root'},{DB_NAME:'other'},{DB_HOST:'remote'},{DB_PORT:'13316'},{HDWORK2_LOCAL_READ_ONLY:'false'},{DB_PASSWORD:'synthetic'},{DB_PASSWORD_DPAPI_FILE:'../outside.dpapi'}]){
  let read=false;await assert.rejects(loadPrivatePassword({...env,...patch},{read:async()=>{read=true;}}),{code:'PRIVATE_DB_CONFIG_REJECTED'});assert.equal(read,false);
 }
});
test('DPAPI loader accepts a nonempty private file and injects password only into runtime memory',async()=>{
 const file=path.resolve(__dirname,'../.local/private-loader-test.dpapi');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic-encrypted-fixture',{flag:'wx'});
 try{
  const config={...env};assert.equal(privateFile(config),file);
  await loadPrivatePassword(config,{read:async p=>{assert.equal(p,file);return 'synthetic-only';}});
  assert.equal(config.DB_PASSWORD,'synthetic-only');assert.equal(fs.readFileSync(file,'utf8'),'synthetic-encrypted-fixture');delete config.DB_PASSWORD;
 }finally{fs.unlinkSync(file);}
});
const grants=["GRANT USAGE ON *.* TO 'hdwork_auth'@'localhost'",...Object.entries({users:'SELECT',hd2_sessions:'SELECT, INSERT, UPDATE',hd2_security_audit:'INSERT',hd2_user_modules:'SELECT'}).map(([t,p])=>`GRANT ${p} ON \`hdwork2\`.\`${t}\` TO 'hdwork_auth'@'localhost'`)];
test('actual auth grant shape covers login/me/logout with table-level scope only',()=>{const result=reviewGrants(grants.map(g=>({grant:g})));assert.equal(result.ok,true);assert.equal(result.tables.hd2_sessions.complete,true);});
test('missing permissions, global/schema grants, other scopes, role grants and grant option fail closed',()=>{
 for(const extra of ['GRANT SELECT ON *.* TO x','GRANT SELECT ON `other`.* TO x','GRANT SELECT ON `hdwork2`.* TO x','GRANT UPDATE ON `hdwork2`.`users` TO x','GRANT SELECT ON `hdwork2`.`users` TO x WITH GRANT OPTION','GRANT `some_role`@`localhost` TO x'])assert.equal(reviewGrants([...grants,extra].map(g=>({grant:g}))).ok,false);
 assert.equal(reviewGrants(grants.slice(0,2).map(g=>({grant:g}))).ok,false);
});
