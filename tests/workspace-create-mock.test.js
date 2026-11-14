const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../src/operations/create');
test('manual creation is disabled for every role and workspace before opening storage',async()=>{
 for(const role of ['SUPER_ADMIN','ADMIN','HD','SHOW_ONLY'])for(const module of ['TIAL','ASSUREN','B2B','REPLACEMENT']){
  const pool={getConnection(){assert.fail('Manual creation must not access storage');}};
  await assert.rejects(create(pool,'synthetic',1,{role,module,reference:'SC123'}),{statusCode:403});
 }
});
