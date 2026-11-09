const path=require('node:path');
const {validatePersistentAuth}=require('./persistent-auth');
// Called only by an explicitly approved runtime, never by offline preparation.
async function loadPrivateWebSecrets(env=process.env,{read=file=>require('./private-database-env').readPrivateDpapi(file)}={}) {
  if(!validatePersistentAuth(env)||env.DB_PASSWORD||env.JWT_SECRET)throw Error('Private web secret scope rejected');
  const root=path.resolve(__dirname,'../../.local');
  const files=[env.DB_PASSWORD_DPAPI_FILE,env.JWT_SECRET_DPAPI_FILE];
  if(files.some(file=>typeof file!=='string'||!file.endsWith('.dpapi')||!path.resolve(__dirname,'../..',file).startsWith(root+path.sep))||files[0]===files[1])throw Error('Private web secret references rejected');
  try {
    const password=await read(files[0]),signing=await read(files[1]);
    if(typeof password!=='string'||!password.length||typeof signing!=='string'||Buffer.byteLength(signing)<32)throw Error('Private web secret rejected');
    env.DB_PASSWORD=password;env.JWT_SECRET=signing;
  } catch {
    delete env.DB_PASSWORD;delete env.JWT_SECRET;throw Error('Private web secrets unavailable');
  }
}
module.exports={loadPrivateWebSecrets};
