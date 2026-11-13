const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto'),assert=require('node:assert/strict');
const mysql=require('mysql2/promise'),base='C:/Program Files/MySQL/MySQL Server 8.4';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function start(parent){
 const root=fs.mkdtempSync(path.join(parent,'owned-mysql-')),data=path.join(root,'data'),pipe='hdwork_admin_'+randomBytes(12).toString('hex'),socketPath='\\\\.\\pipe\\'+pipe;
 const log=fs.openSync(path.join(root,'server.log'),'wx'),env=Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const launch=args=>spawn(path.join(base,'bin/mysqld.exe'),['--no-defaults',...args],{env,windowsHide:true,stdio:['ignore',log,log]});
 await new Promise((resolve,reject)=>{const p=launch(['--initialize-insecure','--basedir='+base,'--datadir='+data]);p.once('error',reject);p.once('exit',n=>n===0?resolve():reject(Error('FIXTURE_INITIALIZATION_FAILED')));});
 const child=launch(['--standalone','--console','--basedir='+base,'--datadir='+data,'--skip-networking','--named-pipe','--socket='+pipe,'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=32M','--max-connections=12']);child.on('error',()=>{});
 let c;for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('FIXTURE_STOPPED');try{c=await mysql.createConnection({socketPath,user:'root',password:'',dateStrings:true,timezone:'Z',connectTimeout:500});break;}catch{await wait(500);}}
 if(!c)throw Error('FIXTURE_NOT_READY');const [[t]]=await c.query('SELECT @@datadir AS dir,@@skip_networking AS offline');assert.equal(path.resolve(t.dir).toLowerCase(),path.resolve(data).toLowerCase());assert.equal(Number(t.offline),1);
 const pool=mysql.createPool({socketPath,user:'root',password:'',database:'hdwork2',dateStrings:true,timezone:'Z',connectionLimit:3});
 return {root,data,pipe,socketPath,c,pool,env,async stop(){await pool.end();try{await c.query('SHUTDOWN');}catch{}await c.end().catch(()=>{});for(let i=0;i<300&&child.exitCode===null;i++)await wait(200);if(child.exitCode===null)throw Error('FIXTURE_GRACEFUL_STOP_TIMEOUT');fs.closeSync(log);}};
}
module.exports={start,base};
