// Writes new inactive plans only; never decrypts or overwrites configuration.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'.local'),{recursive:true});
const plans={
 'database-pools.plan.json':{auth:{user:'hdwork_auth',database:'hdwork2',passwordDpapiFile:'.local/hdwork-auth.password.dpapi'},read:{enabled:false,user:'hdwork_ops_read',host:'127.0.0.1',port:3306,database:'hdwork2',passwordDpapiFile:'.local/database-secrets/ops-read-password.dpapi'},write:{enabled:false,user:'hdwork_ops_write',host:'127.0.0.1',port:3306,database:'hdwork2',passwordDpapiFile:'.local/database-secrets/ops-write-password.dpapi'},globalReadOnly:true},
 'courier.receive-only.plan.json':{enabled:false,receiveOnly:true,sendEnabled:false,ingestionWritesApproved:false,networkActivationApproved:false,newBotIsolationConfirmed:false,approvalUntil:null,botId:null,botUsername:null,port:3091,database:{host:'127.0.0.1',port:3306,name:'hdwork2',user:'hdwork_courier'},tokenDpapiFile:'.local/courier-secrets/courier-token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/courier-service-key.dpapi',identityKeyDpapiFile:'.local/courier-secrets/courier-identity-key.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/courier-db-password.dpapi',journalDirectory:null,lockDirectory:null,groups:[]}
};
for(const [name,plan] of Object.entries(plans)){const file=path.join(root,'.local',name);if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify({status:'INACTIVE_PRIVATE_PLANS_PRESERVED_OR_CREATED',databaseUsed:false,networkUsed:false}));
