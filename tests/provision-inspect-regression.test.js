const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {review,provision}=require('../scripts/provision-testing-accounts');
const sql=()=>fs.readFileSync('ops/examples/hdworkopsbot-testing-accounts.review.sql','utf8');

test('integrated provisioning SQL includes exactly the minimum feedback metadata grants',()=>{
 const result=review();assert.equal(result.statements,15);
 assert.equal(result.groups.hdwork_courier.length,8);assert.equal(result.groups.hdwork_ops_read.length,7);
 assert.ok(result.groups.hdwork_ops_read.includes("GRANT SELECT (order_id,request_id,user_id) ON hdwork2.hd2_web_requests TO 'hdwork_ops_read'@'localhost'"));
 assert.ok(result.groups.hdwork_ops_read.includes("GRANT SELECT (id,bot_id,idem_key,created_at,state,telegram_message_id,last_error_code,lease_until_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost'"));
});

test('outdated template reproduces SQL_GRANTS_REJECTED before a root connection and explains missing grants',()=>{
 const old=sql().split('\n').filter(line=>!line.includes('GRANT SELECT (order_id,request_id,user_id)')&&!line.includes('GRANT SELECT (id,bot_id,idem_key')).join('\n');
 assert.throws(()=>review(old),e=>{
  assert.equal(e.code,'SQL_GRANTS_REJECTED');assert.equal(e.account,'hdwork_ops_read');assert.equal(e.unsafePrivileges,false);
  assert.deepEqual(e.missingPrivileges,['hd2_web_requests:SELECT (order_id, request_id, user_id)','hd2_courier_outbox:SELECT (bot_id, created_at, id, idem_key, last_error_code, lease_until_ms, state, telegram_message_id)']);return true;
 });
});

test('read validator still rejects full outbox access, payload, wildcard, grant option and other schemas',()=>{
 for(const line of ["GRANT SELECT ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';","GRANT SELECT (payload) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost';","GRANT SELECT ON hdwork2.* TO 'hdwork_ops_read'@'localhost';","GRANT SELECT ON hdwork2.hd2_orders TO 'hdwork_ops_read'@'localhost' WITH GRANT OPTION;","GRANT SELECT ON other_schema.orders TO 'hdwork_ops_read'@'localhost';"]){assert.throws(()=>review(sql()+'\n'+line));}
});

test('Inspect with MySQL 8.4-style grants is read-only even when current read grants are incomplete',async()=>{
 const statements=review(),calls=[];let closed=false,connected=0;
 const input={adminUser:'root',adminPassword:'synthetic-not-a-real-password'};
 const metadata="SELECT DATABASE() AS db,@@port AS port,@@session.sql_mode AS sqlMode";
 const accounts="SELECT User,Host,account_locked FROM mysql.user WHERE User IN (?,?) AND Host='localhost'";
 const c={
  async query(q){assert.equal(q.timeout,5000);calls.push(q.sql);if(q.sql===metadata)return [[{db:'hdwork2',port:3306,sqlMode:'STRICT_TRANS_TABLES'}]];
   if(q.sql==="SHOW GRANTS FOR 'hdwork_courier'@'localhost'")return [[{g:'GRANT USAGE ON *.* TO `hdwork_courier`@`localhost`'},...statements.groups.hdwork_courier.map(g=>({g}))]];
   if(q.sql==="SHOW GRANTS FOR 'hdwork_ops_read'@'localhost'")return [[{g:'GRANT USAGE ON *.* TO `hdwork_ops_read`@`localhost`'},...statements.groups.hdwork_ops_read.filter(g=>!g.includes('hd2_web_requests')&&!g.includes('hd2_courier_outbox')).map(g=>({g}))]];
   assert.fail('Unexpected or mutating query');
  },
  async execute(q,params){assert.equal(q.sql,accounts);assert.deepEqual(params,['hdwork_courier','hdwork_ops_read']);calls.push(q.sql);return [[{User:'hdwork_courier',Host:'localhost',account_locked:'N'},{User:'hdwork_ops_read',Host:'localhost',account_locked:'N'}]];},
  async end(){closed=true;}
 };
 const result=await provision({mode:'inspect',input,async createConnection(options){connected++;assert.equal(options.database,'hdwork2');assert.equal(options.host,'127.0.0.1');assert.equal(options.user,'root');assert.equal(options.multipleStatements,false);return c;},readSecret(){assert.fail('Inspect must never read runtime credentials');}});
 assert.equal(result.status,'INSPECTED_NO_WRITES');assert.equal(result.writesPerformed,false);assert.equal(result.accounts[0].grantsMatch,true);assert.equal(result.accounts[1].grantsMatch,false);assert.equal(result.accounts[1].missingPrivileges.length,2);
 assert.deepEqual(calls,[metadata,accounts,"SHOW GRANTS FOR 'hdwork_courier'@'localhost'","SHOW GRANTS FOR 'hdwork_ops_read'@'localhost'"]);
 assert.equal(connected,1);assert.equal(closed,true);assert.equal(input.adminPassword,'');
});
