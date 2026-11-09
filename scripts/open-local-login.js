// Development-only isolated Chrome. Never starts the backend or submits login.
const fs=require('node:fs'),path=require('node:path'),tls=require('node:tls');
const {X509Certificate,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function launcherFailure(code,operation,nativeCode){return Object.assign(Error(code),{code,operation,nativeCode});}
function tlsFailure(error){
  const native=error.code;
  return launcherFailure(native==='ECONNREFUSED'?'LOCAL_HTTPS_NOT_RUNNING':native==='TLS_TIMEOUT'?'LOCAL_HTTPS_TIMEOUT':'LOCAL_TLS_VERIFICATION_FAILED','tls-connect-127.0.0.1:8443',native);
}
function errorReport(error){
  const messages={LOCAL_HTTPS_NOT_RUNNING:'HTTPS 127.0.0.1:8443 tidak aktif. Jalankan runtime lokal proyek terlebih dahulu.',LOCAL_HTTPS_TIMEOUT:'Koneksi HTTPS lokal melewati batas waktu.',LOCAL_TLS_VERIFICATION_FAILED:'Verifikasi sertifikat server lokal gagal; pengecualian Chrome tidak diterapkan.',CHROME_NOT_FOUND:'Executable Google Chrome tidak ditemukan.',CHROME_SPAWN_FAILED:'Windows menolak atau gagal menjalankan Chrome.',CHROME_EARLY_EXIT:'Chrome berhenti sebelum startup selesai. Profil baru dipertahankan.',LOCAL_PROFILE_REJECTED:'Lokasi profil Chrome lokal ditolak.'};
  const safe=value=>typeof value==='string'&&/^[A-Za-z0-9_:.-]{1,90}$/.test(value)?value:undefined;
  const code=messages[error.code]?error.code:'LOCAL_LOGIN_LAUNCH_FAILED';
  return {status:'BLOCKED',code,operation:safe(error.operation),nativeCode:safe(error.nativeCode||error.code),exitCode:Number.isInteger(error.exitCode)?error.exitCode:undefined,message:messages[code]||'Launcher gagal sebelum halaman login dibuka; periksa file sertifikat dan profil proyek.',osTrustChanged:false};
}
function browserArguments(profile,pin) {
  const local=path.join(root,'.local');
  if(!path.resolve(profile).startsWith(local+path.sep)||!/^localhost-browser-[A-Za-z0-9]+$/.test(path.basename(profile))||! /^[A-Za-z0-9+/]{43}=$/.test(pin))throw Error('Isolated browser arguments rejected');
  return ['--new-window','--no-first-run','--no-default-browser-check','--disable-sync','--disable-extensions','--disable-background-networking','--no-proxy-server','--user-data-dir='+profile,'--ignore-certificate-errors-spki-list='+pin,'https://localhost:8443/login'];
}
async function verifyLocalCertificate() {
  const pem=fs.readFileSync(path.join(root,'.local/tls/localhost.crt'));
  const caPem=fs.readFileSync(path.join(root,'.local/tls/ca.crt'));
  const leaf=new X509Certificate(pem),ca=new X509Certificate(caPem),now=Date.now();
  if(!ca.ca||!leaf.verify(ca.publicKey)||!leaf.checkHost('localhost')||!leaf.checkIP('127.0.0.1')||[leaf,ca].some(cert=>Date.parse(cert.validFrom)>now||Date.parse(cert.validTo)<=now))throw Error('Project certificate invalid');
  // Real CA verification plus exact certificate match, before any browser exception.
  await new Promise((resolve,reject)=>{
    const socket=tls.connect({host:'127.0.0.1',port:8443,servername:'localhost',ca:caPem,rejectUnauthorized:true},()=>{
      const peer=socket.getPeerCertificate();
      const match=socket.authorized&&peer.raw&&Buffer.from(peer.raw).equals(leaf.raw);
      socket.end();match?resolve():reject(Error('Server certificate differs from project'));
    });
    socket.setTimeout(5000,()=>socket.destroy(Object.assign(Error('Local TLS timeout'),{code:'TLS_TIMEOUT'})));socket.once('error',error=>reject(tlsFailure(error)));
  });
  return {pin:createHash('sha256').update(leaf.publicKey.export({type:'spki',format:'der'})).digest('base64'),validTo:leaf.validTo};
}
async function main(){
  const mode=process.argv[2];if(process.argv.length!==3||!['--check','--open'].includes(mode))throw Error('Use --check or --open');
  const verified=await verifyLocalCertificate();
  if(mode==='--check'){console.log(JSON.stringify({ok:true,localhost:true,projectCA:true,servedCertificateMatches:true,validTo:verified.validTo,osTrustChanged:false}));return;}
  const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';if(!fs.existsSync(exe))throw launcherFailure('CHROME_NOT_FOUND','chrome-executable');
  const local=path.join(root,'.local');if(fs.lstatSync(local).isSymbolicLink())throw launcherFailure('LOCAL_PROFILE_REJECTED','profile-directory');
  const profile=fs.mkdtempSync(path.join(local,'localhost-browser-'));
  const chrome=await startChrome(exe,browserArguments(profile,verified.pin));chrome.unref();
  console.log('Chrome lokal terpisah dibuka pada halaman login. Tutup jendelanya setelah selesai; profil dipertahankan, trust OS tidak diubah.');
}
async function startChrome(exe,args,{spawn=require('node:child_process').spawn,settleMs=1000}={}){
  let chrome;
  try{chrome=spawn(exe,args,{windowsHide:false,detached:true,stdio:'ignore'});}catch(error){throw launcherFailure('CHROME_SPAWN_FAILED','chrome-spawn',error.code);}
  await new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);chrome.removeListener('exit',exit);chrome.removeListener('error',failed);};
    const failed=error=>{cleanup();reject(launcherFailure('CHROME_SPAWN_FAILED','chrome-spawn',error.code));};
    const exit=code=>{cleanup();reject(Object.assign(launcherFailure('CHROME_EARLY_EXIT','chrome-startup'),{exitCode:code}));};
    chrome.once('error',failed);chrome.once('exit',exit);chrome.once('spawn',()=>{timer=setTimeout(()=>{cleanup();resolve();},settleMs);});
  });
  return chrome;
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify(errorReport(error)));process.exitCode=1;});
module.exports={browserArguments,verifyLocalCertificate,tlsFailure,errorReport,startChrome};
