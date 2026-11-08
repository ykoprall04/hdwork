const test=require('node:test'),assert=require('node:assert/strict');
const {inventory,selectAllowed,tables}=require('../src/operations/data-inventory');
const {createRealDataAdapter}=require('../src/operations/real-data-adapter');
test('auth-only grants produce BLOCKED inventory without attempting any operational table read',async()=>{
 const calls=[],connection={async query(sql){calls.push(sql);if(sql.includes('CURRENT_USER'))return [[{db:'hdwork2',account:'hdwork_auth@localhost'}]];if(sql.startsWith('SHOW GRANTS'))return [[{grant:"GRANT SELECT ON `hdwork2`.`users` TO 'hdwork_auth'@'localhost'"}]];return [[]];}};
 const result=await inventory(connection);assert.equal(result.status,'BLOCKED');assert.equal(result.modules.B2C.rows,null);assert.equal(result.realSourceConnected,false);assert.equal(calls.length,3);assert.ok(!calls.some(sql=>sql.includes('FROM hdwork2.hd2_orders')));assert.equal(tables.length,11);
});
test('SELECT scope never adopts an unrelated schema and data presence alone is not attested as real',()=>{
 assert.equal(selectAllowed([{grant:'GRANT SELECT ON `other`.`hd2_orders` TO x'}],'hd2_orders'),false);
 assert.equal(selectAllowed([{grant:'GRANT SELECT ON `hdwork2`.`hd2_orders` TO x'}],'hd2_orders'),true);
});
test('isolated operational adapter uses read-only transaction, module scope and bounded DTO with fixtures',async()=>{
 const calls=[];const c={async query(sql){calls.push(sql);return sql.startsWith('SELECT DATABASE')?[[{name:'hdwork2'}]]:[[]];},async beginTransaction(){calls.push('begin');},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},async execute(sql,values){calls.push(sql);assert.ok(sql.startsWith('SELECT'));assert.ok(values.includes('B2B'));return [[{id:'00000000-0000-4000-8000-000000000001',command:null,module:'B2B',status:'WAITING',version:0,telegram_timestamp:1700000000,inet:'123456789',sc_in:'Synthetic',owner_user_id:null,final_user_id:null}]];}};
 const adapter=createRealDataAdapter({async getConnection(){return c;}});const result=await adapter.list({area:'B2B'},{id:1,modules:['B2B']});assert.equal(result.data[0].module,'B2B');assert.notEqual(result.data[0].inetMasked,'123456789');assert.equal(adapter.readOnly,true);assert.ok(!('create' in adapter));assert.ok(calls.includes('SET TRANSACTION READ ONLY'));assert.equal(calls.at(-1),'release');
});
test('wrong database target is rejected before operational SQL and always releases connection',async()=>{
 let released=false,executed=false;const adapter=createRealDataAdapter({async getConnection(){return{query:async()=>[[{name:'other'}]],execute:async()=>{executed=true;},release(){released=true;}};}});
 await assert.rejects(adapter.list({},{id:1,modules:['B2B']}),{code:'OPERATIONAL_TARGET_REJECTED'});assert.equal(released,true);assert.equal(executed,false);
});
