const {createHash,randomUUID}=require('node:crypto');
const {open,writeFile,rename,unlink}=require('node:fs/promises');
const path=require('node:path');
const {fail}=require('../operations/policy');

const uploadLimit=5*1024*1024;
const downloadLimit=20*1024*1024;
function mime(bytes){
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 return null;
}
function upload(value){
 const max=Math.ceil(uploadLimit/3)*4;
 if(typeof value!=='string'||value.length>max||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw fail(400,'Gunakan gambar JPG atau PNG maksimal 5 MB.');
 const bytes=Buffer.from(value,'base64'),type=mime(bytes);
 if(!type||bytes.length>uploadLimit||bytes.toString('base64')!==value)throw fail(400,'Gunakan gambar JPG atau PNG maksimal 5 MB.');
 return {bytes,type};
}
function isPhoto(file){
 return file?.kind==='photo'||file?.kind==='document'&&['image/jpeg','image/png'].includes(file.mime_type);
}
function photoEntry(data){
 if(Buffer.isBuffer(data))data=data.toString('utf8');
 if(typeof data==='string')try{data=JSON.parse(data);}catch{return null;}
 return Array.isArray(data)?data.find(isPhoto):null;
}
function cachePath(botId,fileId){
 const dir=process.env.HDWORK2_CHAT_MEDIA_DIR;
 if(!dir||!path.isAbsolute(dir)||typeof fileId!=='string'||!fileId)return null;
 return path.join(dir,createHash('sha256').update(botId+'\0'+fileId).digest('hex')+'.img');
}
const photoKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function outgoingPath(key){
 const dir=process.env.HDWORK2_CHAT_MEDIA_DIR;
 if(!dir||!path.isAbsolute(dir)||!photoKey(key))throw fail(404,'Foto belum tersedia');
 return path.join(dir,'outgoing',key+'.img');
}
async function storeOutgoing(userId,requestId,encoded){
 const {bytes}=upload(encoded);
 const key=createHash('sha256').update(JSON.stringify([userId,requestId])).update(bytes).digest('hex');
 const name=outgoingPath(key);
 const temporary=name+'.'+randomUUID()+'.partial';
 try{
  await writeFile(temporary,bytes,{flag:'wx',mode:0o640});
  await rename(temporary,name);
 }finally{
  await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
 return key;
}
async function readImage(name,limit){
 if(!name)throw fail(404,'Foto belum tersedia');
 const file=await open(name,'r').catch(error=>{if(error.code==='ENOENT')throw fail(404,'Foto belum tersedia');throw error;});
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size<1||stat.size>limit)throw fail(404,'Foto belum tersedia');
  const bytes=await file.readFile();
  const type=mime(bytes);
  if(!type||bytes.length>limit)throw fail(404,'Foto belum tersedia');
  return {bytes,type};
 }finally{await file.close();}
}
function incoming(botId,fileId,thumbnail){
 return readImage(cachePath(botId,fileId),thumbnail?128*1024:downloadLimit);
}
async function outgoing(key){
 const name=outgoingPath(key);
 try{return await readImage(name,uploadLimit);}
 catch(error){
  if(error.statusCode!==404)throw error;
  return readImage(name.slice(0,-4)+'.sent',uploadLimit);
 }
}
async function requestIncoming(botId,fileId,thumbnail=false){
 const name=cachePath(botId,fileId);
 if(!name)throw fail(404,'Foto belum tersedia');
 const prefix=createHash('sha256').update(botId).digest('hex').slice(0,16);
 const queue=path.join(path.dirname(name),'requests',prefix+'-'+path.basename(name,'.img')+'.fetch');
 await writeFile(queue,JSON.stringify({botId,fileId,thumbnail}),{flag:'wx',mode:0o640}).catch(error=>{
  if(error.code!=='EEXIST')throw error;
 });
}
module.exports={upload,isPhoto,photoEntry,incoming,requestIncoming,storeOutgoing,outgoing,photoKey};
