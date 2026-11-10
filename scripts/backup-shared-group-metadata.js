// Native read-account backup only. No root credential, migration, queue/order SQL or Telegram.
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./courier-task-runner');
function migration(checks,columns){
 const added=['group_name','blocked_before'].filter(c=>columns.includes(c));
 const category=checks.filter(c=>c.clause.replace(/`/g,'').toLowerCase().includes('category'));
 const normalized=category[0]?.clause.replace(/\\'/g,"'").replace(/_[a-z0-9]+(?=')/gi,'').replace(/[\s`()]/g,'').toUpperCase();
 if(added.length===2&&category.length===1&&category[0].name==='hd2_mapping_category'&&normalized==="CATEGORYIN'TIAL','LOGIC','ALL'")return {status:'ALREADY_PRESENT',sql:null};
 if(added.length)throw Error('PARTIAL_OR_UNEXPECTED_MIGRATION_014');
 if(category.length!==1||normalized!=="CATEGORYIN'TIAL','LOGIC'"||!/^hd2_[A-Za-z0-9_]+$/.test(category[0].name))throw Error('CATEGORY_CHECK_REQUIRES_REVIEW');
 return {status:'REQUIRED',sql:'USE hdwork2;\nALTER TABLE hd2_system_mappings\n ADD COLUMN group_name VARCHAR(100) NOT NULL DEFAULT \'\',\n ADD COLUMN blocked_before DATETIME(3) NULL,\n DROP CHECK `'+category[0].name+'`,\n ADD CONSTRAINT hd2_mapping_category CHECK(category IN (\'TIAL\',\'LOGIC\',\'ALL\'));\n'};
}
const metadataSql={
 columns:"SELECT COLUMN_NAME AS `name`,DATA_TYPE AS `type`,CHARACTER_MAXIMUM_LENGTH AS `maximumLength`,DATETIME_PRECISION AS `precision`,IS_NULLABLE AS `nullable` FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='hd2_system_mappings'",
 checks:"SELECT t.CONSTRAINT_NAME AS `name`,c.CHECK_CLAUSE AS `clause` FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_NAME='hd2_system_mappings' AND t.CONSTRAINT_TYPE='CHECK'"
};
async function backup({directory,input=process.stdin,connect,bootstrap=require('./office-web-service').bootstrap,now=()=>new Date().toISOString()}={}){
 const raw=fs.readFileSync(path.join(directory,'release.review.json')),plan=JSON.parse(raw),snapshot=plan.snapshot;
 if(plan.kind!=='HDWORK2_SHARED_GROUPS_RELEASE'||!plan.backupComplete||plan.release!==require('./prepare-shared-groups-release').release)throw Error('APPROVED_SHARED_RELEASE_REQUIRED');
 const current=fs.readFileSync(path.join(snapshot,'service/environment.json'));if(hash(current)!==plan.environmentSha256)throw Error('RUNTIME_ENVIRONMENT_CHANGED');const env=JSON.parse(current);
 const secrets=await bootstrap(input,{validate:value=>{if(!value||Object.keys(value).join(',')!=='readPassword'||typeof value.readPassword!=='string'||!value.readPassword)throw Error('READ_ACCOUNT_ONLY_REQUIRED');return value;}});
 let c;try{
  const opts=require('../src/config/operational-pools').options('read',env);const connectionOptions={...opts,password:secrets.readPassword};for(const key of ['connectionLimit','queueLimit','waitForConnections'])delete connectionOptions[key];c=await (connect||require('mysql2/promise').createConnection)(connectionOptions);
  const query=async(phase,sql)=>{try{return await c.query(sql);}catch(error){error.phase=phase;throw error;}};
  const [[identity]]=await query('IDENTITY','SELECT CURRENT_USER() AS account,DATABASE() AS db');if(identity.account!=='hdwork_ops_read@localhost'||identity.db!=='hdwork2')throw Error('NATIVE_READ_ACCOUNT_IDENTITY_MISMATCH');
  const [grants]=await query('GRANTS','SHOW GRANTS FOR CURRENT_USER');if(!require('../src/config/operational-grants').reviewOperationalGrants(grants,'chatRead').ok)throw Error('NATIVE_READ_GRANTS_REJECTED');
  await query('READ_ONLY_TRANSACTION','SET TRANSACTION READ ONLY');await c.beginTransaction();
  const [rows]=await query('MAPPING_ROWS','SELECT * FROM hd2_system_mappings ORDER BY id');
  const [ddl]=await query('MAPPING_DDL','SHOW CREATE TABLE hd2_system_mappings');
  const [columns]=await query('MAPPING_COLUMNS',metadataSql.columns);
  const [checks]=await query('MAPPING_CHECKS',metadataSql.checks);
  const result=migration(checks,columns.map(c=>c.name));if(result.status==='ALREADY_PRESENT'){const name=columns.find(c=>c.name==='group_name'),boundary=columns.find(c=>c.name==='blocked_before');if(name.type!=='varchar'||Number(name.maximumLength)!==100||name.nullable!=='NO'||boundary.type!=='datetime'||Number(boundary.precision)!==3||boundary.nullable!=='YES')throw Error('MIGRATION_014_COLUMN_CONTRACT_MISMATCH');}await c.commit();
  const bytes=Buffer.from(JSON.stringify({version:1,checkedAt:now(),account:identity.account,database:identity.db,table:'hd2_system_mappings',ddl,rows},null,2)+'\n');const file=path.join(directory,'mapping-backup.json');fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});if(hash(fs.readFileSync(file))!==hash(bytes))throw Error('MAPPING_BACKUP_VERIFICATION_FAILED');
  const sqlFile=path.join(directory,'migration-014.native.review.sql');if(result.sql)fs.writeFileSync(sqlFile,result.sql,{flag:'wx',mode:0o600});
  const report={status:'MAPPING_BACKUP_VERIFIED',releasePlanSha256:hash(raw),backupSha256:hash(bytes),rowCount:rows.length,migration014:result.status,migrationSqlSha256:result.sql?hash(Buffer.from(result.sql)):null,sqlWrites:false,queueRowsRead:false,orderRowsRead:false,telegramAccessed:false};
  fs.writeFileSync(path.join(directory,'mapping-backup.report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
 }finally{secrets.readPassword='';if(c)await c.end();}
}
if(require.main===module){if(process.argv.length!==4||process.argv[2]!=='--release-directory'){console.error('RELEASE_DIRECTORY_REQUIRED');process.exitCode=1;}else backup({directory:path.resolve(process.argv[3])}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'MAPPING_BACKUP_FAILED',code:e.code||e.message,errno:e.errno||null,sqlState:e.sqlState||null,phase:e.phase||null,sqlWrites:false}));process.exitCode=1;});}
module.exports={backup,migration,metadataSql};
