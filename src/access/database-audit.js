const required={users:['SELECT'],hd2_sessions:['SELECT','INSERT','UPDATE'],hd2_security_audit:['INSERT'],hd2_user_modules:['SELECT']};
function reviewGrants(rows){
  const permissions=Object.fromEntries(Object.keys(required).map(table=>[table,new Set()]));
  let unsafe=false,unsupported=false;
  for(const row of rows){
    const grant=String(Object.values(row)[0]);
    if(/WITH GRANT OPTION/i.test(grant)){unsafe=true;continue;}
    if(/^GRANT USAGE ON \*\.\* TO /i.test(grant))continue;
    const m=/^GRANT (.+) ON (.+) TO /i.exec(grant);
    if(!m){unsupported=true;continue;}
    const scope=m[2].replace(/`/g,'').replace(/\\_/g,'_'),[db,table]=scope.split('.');
    if(db!=='hdwork2'||/WITH GRANT OPTION/i.test(grant)){unsafe=true;continue;}
    const priv=m[1].split(', ');
    if(!Object.hasOwn(required,table)||priv.some(p=>!required[table].includes(p)))unsafe=true;
    for(const name of Object.keys(permissions))if(table==='*'||table===name)for(const p of priv)permissions[name].add(p);
  }
  const tables=Object.fromEntries(Object.entries(required).map(([name,needed])=>[name,{required:needed,present:[...permissions[name]],complete:needed.every(p=>permissions[name].has(p))}]));
  return {ok:!unsafe&&!unsupported&&Object.values(tables).every(t=>t.complete),unsafeScopeOrPrivilege:unsafe,unsupportedGrant:unsupported,tables};
}
async function audit(){
  const env=process.env;
  if(env.DB_USER!=='hdwork_auth'||env.DB_NAME!=='hdwork2'||env.DB_HOST!=='127.0.0.1'||String(env.DB_PORT)!=='3306'||env.HDWORK2_LOCAL_READ_ONLY!=='true')throw Error('Audit target rejected');
  const connection=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:3306,user:env.DB_USER,password:env.DB_PASSWORD,database:'hdwork2',connectTimeout:5000,multipleStatements:false});
  try{
    const [[target]]=await connection.query('SELECT DATABASE() AS db,CURRENT_USER() AS account,@@port AS port,VERSION() AS version');
    if(target.db!=='hdwork2'||target.account!=='hdwork_auth@localhost'||Number(target.port)!==3306)throw Error('Audit account rejected');
    const [rows]=await connection.query('SHOW GRANTS FOR CURRENT_USER');const grants=reviewGrants(rows);
    const [tables]=await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ('users','hd2_sessions','hd2_security_audit','hd2_user_modules')");
    const visible=Object.keys(required).every(name=>tables.some(t=>t.TABLE_NAME===name));
    const [[admin]]=await connection.query("SELECT COUNT(*) AS activeSuperAdmins FROM hdwork2.users WHERE role='SUPER_ADMIN' AND is_active=TRUE");
    const result={ok:grants.ok&&visible&&Number(admin.activeSuperAdmins)>0,connection:'PASS',account:'hdwork_auth@localhost',database:'hdwork2',version:target.version,readOnly:true,grants,authTablesVisible:visible,activeSuperAdmins:Number(admin.activeSuperAdmins),loginTested:false,writesPerformed:false};
    if(!result.ok)process.exitCode=1;return result;
  }finally{await connection.end();}
}
module.exports={audit,reviewGrants};
