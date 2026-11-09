const test=require('node:test'),assert=require('node:assert/strict');
const {splitSql,clean,fail}=require('../scripts/lib/hdwork2-backup.cjs');
const {plan,target}=require('../scripts/hdwork2-release');
test('backup parser preserves semicolons, escaped strings and executable version comments',()=>{
 const parts=splitSql("-- metadata\n/*!40101 SET NAMES utf8mb4 */;INSERT INTO `users` VALUES ('x;\\\'y',NULL);-- footer\n");
 assert.equal(parts.length,2);assert.equal(clean(parts[0]),'SET NAMES utf8mb4');assert.ok(parts[1].includes("x;\\\'y"));
 for(const text of ["INSERT INTO t VALUES ('unfinished);","SET x=1",'DELIMITER ;;\n'])assert.throws(()=>splitSql(text));
});
test('release plan admits exactly additive approval migration and two reader-only grants',()=>{
 const p=plan();assert.equal(p.migration.length,2);assert.equal(p.grants.length,2);assert.ok(p.migration.every(s=>s.startsWith('ALTER TABLE users ADD ')));assert.ok(p.grants.every(s=>s.endsWith("TO 'hdwork_ops_read'@'localhost'")));assert.match(p.sha256,/^[a-f0-9]{64}$/);
});
test('target guard rejects wrong instance/datadir/UUID before any write',async()=>{
 for(const change of [{db:'other'},{account:'runtime@localhost'},{port:3306},{datadir:'D:/wrong'},{uuid:'wrong'}]){
  let calls=0;const c={async query({sql}){calls++;assert.ok(sql.startsWith('SELECT'));return [[{db:'hdwork2',account:'root@localhost',port:13326,version:'8.4.13',datadir:'D:/private',uuid:'test',...change}]];}};
  await assert.rejects(target(c,{port:13326,datadir:'D:/private',uuid:'test'}));assert.equal(calls,1);
 }
});
test('wrapper masks root input and carries it only through anonymous stdin, never argv or env',()=>{
 const s=require('node:fs').readFileSync('scripts/hdwork2-release.ps1','utf8');assert.match(s,/Read-Host[^\n]+-AsSecureString/);assert.match(s,/StandardInput.Write\(\$privateInput\)/);assert.doesNotMatch(s,/Arguments=.*(?:adminPassword|rootSecret|privateInput)/i);assert.match(s,/EnvironmentVariables.Clear\(\)/);assert.match(s,/SetAccessRuleProtection\(\$true,\$false\)/);
});

test('escaped CHECK metadata from MySQL 8.4.13 is accepted without admitting a weaker constraint',async()=>{
 const {schema}=require('../scripts/hdwork2-release');
 const clause="(`approval_status` in (_utf8mb4\\'PENDING\\',_utf8mb4\\'APPROVED\\'))".replace(/\\\\/g,'\\');
 function connection(expression){return {async query({sql}){
  if(sql.includes('information_schema.COLUMNS'))return [[{COLUMN_NAME:'approval_status',COLUMN_TYPE:'varchar(20)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'APPROVED'}]];
  if(sql.includes('CHECK_CONSTRAINTS'))return [[{TABLE_NAME:'users',ENFORCED:'YES',CHECK_CLAUSE:expression}]];
  if(sql.startsWith('SELECT COUNT'))return [[{n:0}]];assert.fail('Unexpected query');
 }};}
 assert.deepEqual(await schema(connection(clause)),{column:true,constraint:true});
 await assert.rejects(schema(connection(clause+' OR 1')),{code:'EXISTING_APPROVAL_CONSTRAINT_REQUIRES_REVIEW'});
});
