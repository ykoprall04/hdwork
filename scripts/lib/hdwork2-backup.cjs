// Backup inspection/import guards. Does not open a database or load runtime secrets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const expectedHash='221EA346755C66E924CFE46F2B88326D88D905F9E5DA70193637C4142B84A9D3';
const tables=['hd2_audit','hd2_auth_guard','hd2_courier_inbox','hd2_courier_nonces','hd2_courier_outbox','hd2_courier_workers','hd2_daily_keys','hd2_live_events','hd2_order_statuses','hd2_orders','hd2_security_audit','hd2_sessions','hd2_tial_keys','hd2_user_modules','hd2_web_requests','users'];
const fail=code=>Object.assign(Error(code),{code});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function privatePath(file){const p=path.resolve(root,file),prefix=path.join(root,'.local')+path.sep;if(!p.toLowerCase().startsWith(prefix.toLowerCase())||fs.realpathSync(p).toLowerCase()!==p.toLowerCase())throw fail('PRIVATE_PATH_REJECTED');let at=p;while(at!==root){if(fs.lstatSync(at).isSymbolicLink())throw fail('REPARSE_PATH_REJECTED');at=path.dirname(at);}return p;}
function splitSql(text){
 if(/^\s*DELIMITER\b/im.test(text))throw fail('DUMP_DELIMITER_REQUIRES_REVIEW');
 const out=[];let start=0,quote=null,line=false,block=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i],next=text[i+1];
  if(line){if(ch==='\n')line=false;continue;}
  if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
  if(quote){if(ch==='\\'&&quote!=='`'){i++;continue;}if(ch===quote){if(next===quote)i++;else quote=null;}continue;}
  if(ch==='-'&&next==='-'&&/\s/.test(text[i+2]||'')){line=true;i++;continue;}
  if(ch==='#'){line=true;continue;}if(ch==='/'&&next==='*'){block=true;i++;continue;}
  if("'\"`".includes(ch)){quote=ch;continue;}
  if(ch===';'){const s=text.slice(start,i).trim();if(s)out.push(s);start=i+1;}
 }
 if(quote||block)throw fail('DUMP_INCOMPLETE');
 if(clean(text.slice(start)).trim())throw fail('DUMP_UNTERMINATED_SQL');return out;
}
function clean(text){return text.replace(/\/\*!\d+\s*([\s\S]*?)\*\//g,'$1').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*--[^\n]*(?:\n|$)/gm,'').trim();}
function value(token){token=token.trim();if(token==='NULL')return null;if(token[0]==="'"&&token.at(-1)==="'")return token.slice(1,-1).replace(/\\([\s\S])|''/g,(_m,c)=>c===undefined?"'":({0:'\0',b:'\b',n:'\n',r:'\r',t:'\t',Z:'\x1a'}[c]??c));if(/^0x[0-9a-f]*$/i.test(token))return Buffer.from(token.slice(2),'hex').toString('utf8');if(/^-?\d+(?:\.\d+)?$/.test(token))return token;throw fail('DUMP_VALUE_REQUIRES_REVIEW');}
function tuples(text,columns){const rows=[];let quote=false,escape=false,depth=0,start=0,row=[];
 for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==="'")quote=false;}else if(c==="'")quote=true;else if(c==='('){if(depth++===0){start=i+1;row=[];}}else if(c===','&&depth===1){row.push(value(text.slice(start,i)));start=i+1;}else if(c===')'){if(--depth===0){row.push(value(text.slice(start,i)));if(row.length!==columns.length)throw fail('DUMP_COLUMN_COUNT_MISMATCH');rows.push(Object.fromEntries(columns.map((k,n)=>[k,row[n]])));}}}
 if(depth||quote||escape)throw fail('DUMP_VALUES_INCOMPLETE');return rows;
}
function loadBackup(file){const full=privatePath(file),buffer=fs.readFileSync(full);if(hash(buffer).toUpperCase()!==expectedHash)throw fail('BACKUP_CHECKSUM_MISMATCH');const text=buffer.toString('utf8');buffer.fill(0);if(!/-- Dump completed on [^\r\n]+\s*$/.test(text))throw fail('BACKUP_FOOTER_MISSING');const statements=splitSql(text),data={};
 for(const source of statements){const s=clean(source);if(!s)continue;let m;
  if((m=/^CREATE TABLE `([^`]+)`\s*\(([\s\S]*)\) ENGINE=(\w+)/.exec(s))){if(!tables.includes(m[1])||m[3]!=='InnoDB')throw fail('DUMP_TABLE_REJECTED');const columns=[...m[2].matchAll(/^\s*`([^`]+)` /gm)].map(x=>x[1]);const json=[...m[2].matchAll(/^\s*`([^`]+)` json\b/gm)].map(x=>x[1]);const temporal=[...m[2].matchAll(/^\s*`([^`]+)` (?:timestamp|datetime)(?:\(\d+\))?\b/gm)].map(x=>x[1]);data[m[1]]={columns,json,temporal,body:m[2],rows:[]};continue;}
  if((m=/^INSERT INTO `([^`]+)`(?: \((.*?)\))? VALUES ([\s\S]*)$/.exec(s))){if(!data[m[1]])throw fail('DUMP_INSERT_SCOPE_REJECTED');const t=data[m[1]],columns=m[2]?[...m[2].matchAll(/`([^`]+)`/g)].map(x=>x[1]):t.columns;if(columns.some(k=>!t.columns.includes(k)))throw fail('DUMP_COLUMN_REJECTED');if(t.insertColumns&&JSON.stringify(t.insertColumns)!==JSON.stringify(columns))throw fail('DUMP_INSERT_COLUMNS_CHANGED');t.insertColumns=columns;t.rows.push(...tuples(m[3],columns));continue;}
  if(/^SET\s/i.test(s)&&!/^SET\s+(?:GLOBAL|PERSIST)/i.test(s))continue;
  if(/^CREATE DATABASE\s/i.test(s)){if(!/^CREATE DATABASE\s+(?:IF NOT EXISTS\s+)?`hdwork2`\s/i.test(s))throw fail('DUMP_DATABASE_REJECTED');continue;}
  if(/^USE `hdwork2`$/.test(s)||/^UNLOCK TABLES$/.test(s))continue;
  if((m=/^(?:DROP TABLE IF EXISTS|LOCK TABLES|ALTER TABLE) `([^`]+)`/.exec(s))&&tables.includes(m[1])){
   if(s.startsWith('ALTER TABLE')&&!/^ALTER TABLE `[^`]+` (?:DISABLE|ENABLE) KEYS$/.test(s))throw fail('DUMP_ALTER_REJECTED');
   if(s.startsWith('LOCK TABLES')&&!/^LOCK TABLES `[^`]+` WRITE$/.test(s))throw fail('DUMP_LOCK_REJECTED');continue;
  }
  throw fail('DUMP_STATEMENT_REQUIRES_REVIEW');
 }
 if(Object.keys(data).sort().join(',')!==[...tables].sort().join(','))throw fail('DUMP_TABLE_COVERAGE_REJECTED');
 for(const t of Object.values(data))for(const col of t.json)for(const row of t.rows)if(row[col]!==null)JSON.parse(row[col]);
 return {file:full,sha256:expectedHash,statements:statements.filter(s=>clean(s)),data};
}
function stable(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(stable);return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function rowText(row,t){const columns=t.insertColumns||t.columns;return JSON.stringify(columns.map(k=>{let v=row[k];if(v===null)return null;if(Buffer.isBuffer(v))v=v.toString('utf8');if(t.json.includes(k))return stable(typeof v==='string'?JSON.parse(v):v);v=String(v);if(t.temporal.includes(k))v=v.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');return v;}));}
function digest(rows,t){return hash(rows.map(r=>rowText(r,t)).sort().join('\n'));}
async function readRows(c,name,t){const columns=t.insertColumns||t.columns;if(!tables.includes(name)||columns.some(k=>!/^\w+$/.test(k)))throw fail('SNAPSHOT_SCOPE_REJECTED');const [rows]=await c.query('SELECT '+columns.map(k=>'`'+k+'`').join(',')+' FROM hdwork2.`'+name+'`');return rows;}
async function assertRestored(c,backup){await c.query("SET SESSION time_zone='+00:00'");const result={};for(const name of tables){const t=backup.data[name],rows=await readRows(c,name,t);if(rows.length!==t.rows.length||digest(rows,t)!==digest(t.rows,t))throw fail('RESTORED_DATA_MISMATCH_'+name.toUpperCase());result[name]=rows.length;}const [[objects]]=await c.query("SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='hdwork2') AS routines,(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='hdwork2') AS triggers,(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='hdwork2') AS events");if(Object.values(objects).some(n=>Number(n)!==0))throw fail('RESTORED_OBJECT_SCOPE_MISMATCH');return result;}
module.exports={root,tables,expectedHash,fail,hash,privatePath,splitSql,clean,loadBackup,digest,readRows,assertRestored};
