const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const reject=()=>Object.assign(Error('Private database configuration unavailable'),{code:'PRIVATE_DB_CONFIG_REJECTED'});
function privateFile(env){
  if(env.DB_USER!=='hdwork_auth'||env.DB_NAME!=='hdwork2'||env.DB_HOST!=='127.0.0.1'||String(env.DB_PORT)!=='3306'||env.HDWORK2_LOCAL_READ_ONLY!=='true'||env.DB_PASSWORD)throw reject();
  const file=path.resolve(root,env.DB_PASSWORD_DPAPI_FILE||'');
  if(!file.startsWith(path.join(root,'.local')+path.sep)||!file.endsWith('.dpapi'))throw reject();
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||!stat.size||stat.size>65536||fs.realpathSync(file).toLowerCase()!==file.toLowerCase())throw reject();
  return file;
}
async function decrypt(file){
  if(process.platform!=='win32')throw reject();
  const name='hdwork2-auth-'+randomBytes(24).toString('hex'),address='\\\\.\\pipe\\'+name;
  let child,socket,timer;const buffers=[];let bytes=0;
  const server=net.createServer();server.maxConnections=1;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(address,resolve);});
    const data=new Promise((resolve,fail)=>{
      server.once('connection',connection=>{socket=connection;connection.on('error',fail);connection.on('data',buffer=>{bytes+=buffer.length;if(bytes>4096){buffer.fill(0);connection.destroy();fail(reject());return;}buffers.push(buffer);});connection.once('end',resolve);});
    });
    const exe=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    child=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/read-dpapi-password.ps1'),'-PasswordFile',file,'-PipeName',name],{windowsHide:true,stdio:'ignore'});
    const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Object.assign(Error('DPAPI failed'),{code:({10:'DPAPI_FILE_READ_FAILED',20:'DPAPI_UNPROTECT_FAILED',30:'DPAPI_MEMORY_READ_FAILED',40:'DPAPI_PIPE_FAILED'})[code]||'DPAPI_DECRYPT_FAILED'})));});
    const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('DPAPI timeout'),{code:'DPAPI_TIMEOUT'})),12000);});
    await Promise.race([Promise.all([data,exited]),timeout]);if(!bytes)throw reject();
    const joined=Buffer.concat(buffers);try{return joined.toString('utf8');}finally{joined.fill(0);}
  }finally{
    clearTimeout(timer);socket?.destroy();
    if(child&&child.exitCode===null&&child.signalCode===null)child.kill();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    for(const buffer of buffers)buffer.fill(0);
  }
}
async function loadPrivatePassword(env=process.env,{read=decrypt}={}){
  const file=privateFile(env),password=await read(file);
  if(typeof password!=='string'||!password.length)throw reject();
  // Runtime process memory only; never writes plaintext to disk or child args.
  env.DB_PASSWORD=password;
}
async function readPrivateDpapi(file,{read=decrypt}={}){
 const resolved=path.resolve(root,file);
 if(!resolved.startsWith(path.join(root,'.local')+path.sep)||!resolved.endsWith('.dpapi'))throw reject();
 const stat=fs.lstatSync(resolved);if(!stat.isFile()||stat.isSymbolicLink()||!stat.size||stat.size>65536||fs.realpathSync(resolved).toLowerCase()!==resolved.toLowerCase())throw reject();
 const value=await read(resolved);if(typeof value!=='string'||!value.length)throw reject();return value;
}
module.exports={loadPrivatePassword,privateFile,readPrivateDpapi};
