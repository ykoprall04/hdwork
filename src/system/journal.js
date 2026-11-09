const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
function createJournal(directory){
 if(!path.isAbsolute(directory))throw Error('PRIVATE_JOURNAL_REQUIRED');const root=path.resolve(directory),repo=path.resolve(__dirname,'../..');if(root===repo||root.startsWith(repo+path.sep))throw Error('JOURNAL_OUTSIDE_REPOSITORY_REQUIRED');
 async function ready(){await fs.mkdir(root,{recursive:true,mode:0o700});const stat=await fs.lstat(root);if(await fs.realpath(root)!==root||stat.isSymbolicLink()||!stat.isDirectory()||(process.platform!=='win32'&&(stat.mode&0o077)))throw Error('PRIVATE_JOURNAL_REQUIRED');}
 return {
  async append(){await ready();await fs.writeFile(path.join(root,'incident-'+randomUUID()+'.json'),JSON.stringify({at:new Date().toISOString(),code:'MYSQL_PERSISTENCE_UNAVAILABLE'}),{flag:'wx',mode:0o600});},
  async flush(system,botId,alertsApproved){await ready();const names=(await fs.readdir(root)).filter(n=>/^incident-[a-f0-9-]{36}\.json$/.test(n)).slice(0,100);for(const name of names){const file=path.join(root,name),stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024)throw Error('JOURNAL_REQUIRES_REVIEW');const event=JSON.parse(await fs.readFile(file,'utf8'));if(event.code!=='MYSQL_PERSISTENCE_UNAVAILABLE'||!Number.isFinite(Date.parse(event.at)))throw Error('JOURNAL_REQUIRES_REVIEW');await system.report('mysql','OFFLINE','PERSISTENCE_OUTAGE_OBSERVED',event.at);if(alertsApproved)await system.alert(botId,'MYSQL_OUTAGE_RECOVERED',{approved:true});await fs.unlink(file);}}
 };
}
module.exports={createJournal};
