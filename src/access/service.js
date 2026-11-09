const {randomBytes,createHash,createHmac}=require('node:crypto');
const bcrypt=require('bcrypt'),jwt=require('jsonwebtoken');
const roles=['SUPER_ADMIN','ADMIN','HD','SHOW_ONLY'],{modules}=require('../operations/modules');
const reject=(statusCode=403,message='Permintaan akun tidak diizinkan')=>Object.assign(Error(message),{statusCode,publicMessage:message});
const approved=u=>u.approval_status===undefined||u.approval_status==='APPROVED';
function username(value){if(typeof value!=='string'||! /^[a-zA-Z0-9._-]{3,64}$/.test(value))throw reject(400,'Username harus 3–64 karakter: huruf, angka, titik, garis bawah atau tanda hubung');return value.toLowerCase();}
const digest=value=>createHash('sha256').update(value).digest('hex');
function password(value){if(typeof value!=='string'||value.length<12||Buffer.byteLength(value)>72)throw reject(400,'Password minimal 12 karakter dan maksimal 72 byte');return value;}
function data(input){if(!input||Object.keys(input).some(k=>!['name','username','password','role','modules','is_active'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||!roles.includes(input.role)||typeof input.is_active!=='boolean'||!Array.isArray(input.modules)||input.modules.some(m=>!modules.includes(m))||new Set(input.modules).size!==input.modules.length)throw reject(400);return {...input,name:input.name.trim()};}
function createService(store,secret) {
 const profile=async(s,u)=>({id:u.id,name:u.name,username:u.username,role:u.role,city_id:u.city_id??null,modules:u.role==='SUPER_ADMIN'?modules:await s.modules(u.id)});
 const dummy=bcrypt.hashSync('synthetic-non-account-value',12);
 return {
 csrf:token=>createHmac('sha256',secret).update('csrf:'+token).digest('hex'),
 async register(input){
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['name','username','password','confirmPassword'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw reject(400,'Nama dan data pendaftaran tidak valid');
 const handle=username(input.username),pass=password(input.password);if(pass!==input.confirmPassword)throw reject(400,'Konfirmasi password tidak cocok');
 const password_hash=await bcrypt.hash(pass,12);
 return store.tx(async s=>{await s.lock();if(await s.username(handle))throw reject(409,'Username sudah digunakan');const id=await s.save(null,{name:input.name.trim(),username:handle,password_hash,role:'SHOW_ONLY',modules:[],is_active:false,approval_status:'PENDING'});await s.audit(null,id,'USER_REGISTERED');return id;});
 },
 async login(username,pass){if(typeof username!=='string'||typeof pass!=='string'||username.length>64||Buffer.byteLength(pass)>72){await store.audit(null,null,'LOGIN_FAILED');throw reject(401);}return store.tx(async s=>{
 const u=await s.username(username.toLowerCase());const valid=await bcrypt.compare(pass,u?.password_hash||dummy);
 if(!u||![1,true].includes(u.is_active)||!approved(u)||!roles.includes(u.role)||!valid){await s.audit(null,null,'LOGIN_FAILED');return null;}
 const token=jwt.sign({id:u.id,jti:randomBytes(32).toString('hex')},secret,{algorithm:'HS256',expiresIn:'8h'});await s.addSession(digest(token),u.id);await s.audit(u.id,u.id,'LOGIN_SUCCESS');return {token,user:await profile(s,u)};
 });},
 async me(token){try{jwt.verify(token,secret,{algorithms:['HS256']});}catch{throw reject(401);}const session=await store.session(digest(token));if(!session)throw reject(401);const u=await store.user(session.user_id);if(!u||![1,true].includes(u.is_active)||!approved(u)||!roles.includes(u.role))throw reject(401);return profile(store,u);},
 async logout(token){await store.tx(async s=>{const session=await s.session(digest(token));await s.logout(digest(token));if(session)await s.audit(session.user_id,session.user_id,'LOGOUT');});},
 async manage(actor,id,input,action='SAVE'){return store.tx(async s=>{await s.lock();const admin=await s.user(actor);if(!admin||!['SUPER_ADMIN','ADMIN'].includes(admin.role)||![1,true].includes(admin.is_active)||!approved(admin))throw reject();
 const old=id?await s.user(id):null;if(id&&!old)throw reject(404);
 const permitted=admin.role==='SUPER_ADMIN'?['ADMIN','HD','SHOW_ONLY']:['HD','SHOW_ONLY'];
 if(old&&!permitted.includes(old.role))throw reject();
 if(action==='APPROVE'||action==='REJECT'){
 if(!old||String(actor)===String(id)||old.approval_status!=='PENDING')throw reject(409,'Akun tidak lagi menunggu persetujuan');
 const registration=await s.registered(id);
 if((registration||action==='REJECT')&&admin.role!=='SUPER_ADMIN')throw reject(403,'Permintaan pendaftaran hanya dapat diputuskan Super Admin');
 let role=old.role,grants=await s.modules(id);
 if(action==='APPROVE'&&(registration||Object.keys(input||{}).length)){
 if(!input||Object.keys(input).some(k=>!['role','modules'].includes(k))||!permitted.includes(input.role)||!Array.isArray(input.modules)||input.modules.some(m=>!modules.includes(m))||new Set(input.modules).size!==input.modules.length)throw reject(400,'Pilih role dan akses modul yang valid');
 role=input.role;grants=input.modules;
 }
 await s.save(id,{...old,role,modules:grants,approval_status:action==='APPROVE'?'APPROVED':'REJECTED',is_active:action==='APPROVE'});
 if(role!==old.role)await s.audit(actor,id,'ROLE_CHANGED');
 await s.revoke(id);await s.audit(actor,id,action==='APPROVE'?'USER_APPROVED':'USER_REJECTED');await s.audit(actor,id,'MODULES_CHANGED');return id;
 }
 if(action==='REVOKE'){await s.revoke(id);await s.audit(actor,id,'SESSIONS_REVOKED');return id;}
 if(action==='RESET'){const hash=await bcrypt.hash(password(input.password),12);await s.save(id,{...old,password_hash:hash,modules:await s.modules(id)});await s.revoke(id);await s.audit(actor,id,'PASSWORD_RESET');return id;}
 const next=data(input);
 if(!permitted.includes(next.role))throw reject();
 if(!id){next.approval_status='PENDING';next.is_active=false;}else{next.approval_status=old.approval_status||'APPROVED';if(next.approval_status!=='APPROVED'&&next.is_active)throw reject(403,'Akun belum disetujui atau sudah ditolak');}
 if(!id){next.username=username(next.username);if(await s.username(next.username))throw reject(409,'Username sudah digunakan');next.password_hash=await bcrypt.hash(password(next.password),12);}
 else if('password' in next||'username' in next)throw reject(400);
 if(old?.role==='SUPER_ADMIN'&&[1,true].includes(old.is_active)&&(next.role!=='SUPER_ADMIN'||!next.is_active)&&await s.activeSupers()<=1)throw reject(409);
 const target=await s.save(id,next);if(id)await s.revoke(id);
 await s.audit(actor,target,id?'USER_UPDATED':'USER_CREATED');
 if(old?.role!==next.role)await s.audit(actor,target,'ROLE_CHANGED');
 await s.audit(actor,target,'MODULES_CHANGED');if(old&&Boolean(old.is_active)!==next.is_active)await s.audit(actor,target,next.is_active?'USER_ENABLED':'USER_DISABLED');return target;
 });},
 async changePassword(actor,input){return store.tx(async s=>{await s.lock();const u=await s.user(actor);if(!u||![1,true].includes(u.is_active)||!approved(u))throw reject();if(typeof input?.currentPassword!=='string'||!await bcrypt.compare(input.currentPassword,u.password_hash))throw reject(403);const password_hash=await bcrypt.hash(password(input.password),12);await s.save(actor,{...u,password_hash,modules:await s.modules(actor)});await s.revoke(actor);await s.audit(actor,actor,'PASSWORD_CHANGED');});},
 async bootstrap(input){return store.tx(async s=>{await s.lock();if(await s.activeSupers())throw reject(409);const next=data({...input,role:'SUPER_ADMIN',modules,is_active:true});if(!/^[a-zA-Z0-9._-]{3,64}$/.test(next.username||''))throw reject(400);next.username=next.username.toLowerCase();next.password_hash=await bcrypt.hash(password(next.password),12);const id=await s.save(null,next);await s.audit(id,id,'FIRST_ADMIN_PROVISIONED');return id;});}
 };
}
module.exports={createService,modules,roles,reject,digest};
