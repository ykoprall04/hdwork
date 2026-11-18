// Pure/injected preparation helpers. No credentials, runtime imports or CLI Apply.
const fs=require('node:fs'),path=require('node:path');
const table='hd2_global_commands';
const marker="  const scope=m[2].replace(/`/g,'').replace(/\\\\_/g,'_').split('.');";
const block=`
  if(scope[0]==='hdwork2'&&scope[1]==='hd2_global_commands'){
   const allowed=role.toLowerCase().includes('write')?['SELECT','UPDATE']:['SELECT'];
   try{const ps=privileges(m[1]);if(!ps.length||ps.some(p=>!allowed.includes(p)))unsafe=true;}catch{unsafe=true;}
   continue;
  }`;
function compatibleValidator(source){
 if(source.includes("scope[1]==='hd2_global_commands'")){
  if(!source.replace(/\r\n/g,'\n').includes(block))throw Error('EXISTING_COMPATIBILITY_UNRECOGNIZED');
  return source;
 }
 if(source.split(marker).length!==2)throw Error('VALIDATOR_BASELINE_UNRECOGNIZED');
 return source.replace(marker,marker+block.replace(/\n/g,source.includes('\r\n')?'\r\n':'\n'));
}
function migrationStatements(){
 const sql=fs.readFileSync(path.join(__dirname,'../../database/manual/021_hdwork2_global_commands.sql'),'utf8');
 return sql.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
}
async function checkSchema(c){
 const [columns]=await c.execute('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table]);
 if(!columns.length)return {exists:false};
 const [tables]=await c.execute('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
 const spec=[['command','varchar','NO'],['enabled','tinyint','NO'],['version','int','NO'],['updated_at','datetime','NO']];
 if(tables[0]?.ENGINE!=='InnoDB'||columns.length!==4||spec.some(([name,type,nullable],i)=>columns[i].COLUMN_NAME!==name||columns[i].DATA_TYPE!==type||columns[i].IS_NULLABLE!==nullable)||columns[0].COLLATION_NAME!=='ascii_bin'||!String(columns[2].COLUMN_TYPE).includes('unsigned'))throw Error('GLOBAL_COMMAND_SCHEMA_MISMATCH');
 if(columns[0].COLUMN_TYPE!=='varchar(16)'||columns[1].COLUMN_TYPE!=='tinyint(1)'||String(columns[1].COLUMN_DEFAULT)!=='1'||String(columns[2].COLUMN_DEFAULT)!=='0'||columns[3].COLUMN_TYPE!=='datetime(3)'||String(columns[3].COLUMN_DEFAULT).toLowerCase().replace(/[()\s]/g,'')!=='utc_timestamp3')throw Error('GLOBAL_COMMAND_SCHEMA_MISMATCH');
 const [keys]=await c.execute('SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=\'PRIMARY\' ORDER BY ORDINAL_POSITION',[table]);
 if(keys.length!==1||keys[0].COLUMN_NAME!=='command')throw Error('GLOBAL_COMMAND_SCHEMA_MISMATCH');
 const [checks]=await c.execute('SELECT cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=?',[table]);
 const clauses=checks.map(r=>r.CHECK_CLAUSE.replace(/\\'/g,"'").replace(/(^|[\s(,])_[a-z0-9]+(?=')/gi,'$1').replace(/[`\s()]/g,'').toLowerCase());
 if(clauses.length!==2||!clauses.includes("commandin'order','req','config_psb','mo'")||!clauses.includes('enabledin0,1'))throw Error('GLOBAL_COMMAND_SCHEMA_MISMATCH');
 const [rows]=await c.execute('SELECT command,enabled,version FROM hd2_global_commands ORDER BY command');
 if(rows.some(r=>!['order','req','config_psb','mo'].includes(r.command)||![0,1].includes(Number(r.enabled))||!Number.isSafeInteger(Number(r.version))||Number(r.version)<0))throw Error('GLOBAL_COMMAND_DATA_MISMATCH');
 return {exists:true,rows};
}
async function rehearseMigration(c,{afterStatement=()=>{}}={}){
 // Caller supplies an owned fixture connection. This helper never creates pools.
 const [useDatabase,...statements]=migrationStatements();
 await c.query(useDatabase);
 await afterStatement(useDatabase);
 await checkSchema(c);
 // GRANT requires the text protocol. These statements come from the fixed SQL file.
 for(const sql of statements){await c.query(sql);await afterStatement(sql);}
 return checkSchema(c);
}
function rollbackPlan({beforeGrants,afterGrants,offPresent=false,compatibleRollback=false,rollbackUnderstandsCommands=false}){
 const added=afterGrants.filter(g=>!beforeGrants.includes(g));
 if(added.some(g=>!/^GRANT (SELECT|SELECT,UPDATE) ON hdwork2\.hd2_global_commands TO '(hdwork_ops_read|hdwork_ops_write|hdwork_courier)'@'localhost'$/.test(g)))throw Error('UNREVIEWED_GRANT_DELTA');
 if(!compatibleRollback&&beforeGrants.some(g=>g.includes('ON hdwork2.hd2_global_commands ')))throw Error('OLD_VALIDATOR_REQUIRES_COMPATIBILITY');
 if(offPresent&&!rollbackUnderstandsCommands)throw Error('OLD_COURIER_CANNOT_ENFORCE_OFF');
 return {preserve:['database','journal','offset','ACK','FIFO','outbox','global settings','audit'],revokeBeforeUnpatchedOldStartup:compatibleRollback?[]:added.map(g=>g.replace(/^GRANT /,'REVOKE ').replace(' TO ',' FROM ')),restoreOldDatabase:false,dropTable:false,requiresOwnedCooperativeStop:true};
}
function verifyBackupEvidence(e){
 for(const key of ['databaseRestoreVerified','grantsCaptured','webRuntimePinned','courierRuntimePinned','lifecycleOverlayVerified','taskXmlCaptured','rollbackFixturePassed'])if(e?.[key]!==true)throw Error('BACKUP_EVIDENCE_REQUIRED_'+key);
 return {ready:true,normalRollbackRestoresOperationalData:false};
}
module.exports={compatibleValidator,migrationStatements,checkSchema,rehearseMigration,rollbackPlan,verifyBackupEvidence};
