const test=require('node:test'),assert=require('node:assert/strict');
const {windowFlags}=require('../scripts/real-auth-window');
const {validateAuthWriteScope}=require('../src/config/auth-write-policy');
test('approved real-auth window is process-only, expires in 14 minutes and retains exact auth write scope',()=>{
 const now=Date.now(),flags=windowFlags(now);assert.equal(Date.parse(flags.HDWORK2_AUTH_WRITE_UNTIL)-now,840000);assert.ok(!Object.hasOwn(flags,'DB_PASSWORD'));
 const env={...flags,HDWORK2_AUTH_ONLY:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',DB_USER:'hdwork_auth',DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_PORT:'3306',HDWORK2_OPERATIONS_ENABLED:'false',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false'};
 assert.equal(validateAuthWriteScope(env,now),now+840000);assert.throws(()=>validateAuthWriteScope(env,now+840001));
});
