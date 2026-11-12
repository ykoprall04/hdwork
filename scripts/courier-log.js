// Independent read-only monitor. No process control, stdin ownership, secrets or Courier imports.
const fs=require('node:fs'),path=require('node:path');
const pattern=/^hdwork2-\d{4}-\d{2}-\d{2}-[a-z-]+-\d+\.jsonl$/;
function snapshot(directory){try{return fs.readdirSync(directory).filter(f=>pattern.test(f)).sort();}catch{return [];}}
async function initial(directory,tail=100){
 const offsets=new Map(),rows=[];
 // Read backwards in bounded chunks: never load entire 24h files into RAM.
 for(const name of snapshot(directory)){
  let fd;try{fd=await fs.promises.open(path.join(directory,name),'r');const stat=await fd.stat();let end=stat.size,text='';offsets.set(name,{position:stat.size,partial:''});
   while(end>0&&text.split('\n').length<=tail+1){const size=Math.min(65536,end),buffer=Buffer.alloc(size);end-=size;const {bytesRead}=await fd.read(buffer,0,size,end);text=buffer.subarray(0,bytesRead).toString('utf8')+text;}
   if(end>0)text=text.slice(text.indexOf('\n')+1);
   // Preserve an incomplete trailing record for the next append.
   const split=text.lastIndexOf('\n');offsets.get(name).partial=split<0?text:text.slice(split+1);
   for(const line of (split<0?'':text.slice(0,split)).split('\n').filter(Boolean).slice(-tail))rows.push(line);
  }catch{}finally{await fd?.close();}
 }
 rows.sort((a,b)=>{try{return String(JSON.parse(a).timestamp).localeCompare(String(JSON.parse(b).timestamp));}catch{return 0;}});
 return {offsets,lines:rows.slice(-tail)};
}
async function readNew(directory,offsets){const lines=[];
 for(const name of snapshot(directory)){
  let fd;try{fd=await fs.promises.open(path.join(directory,name),'r');const stat=await fd.stat();let state=offsets.get(name)||{position:0,partial:''};if(stat.size<state.position)state={position:0,partial:''};
   // One chunk per file per tick bounds observer overhead; subsequent ticks drain the rest.
   const length=Math.min(stat.size-state.position,65536);if(length){const buffer=Buffer.alloc(length);const {bytesRead}=await fd.read(buffer,0,length,state.position);state.position+=bytesRead;const text=state.partial+buffer.subarray(0,bytesRead).toString('utf8');const parts=text.split('\n');state.partial=parts.pop();lines.push(...parts.filter(Boolean));}offsets.set(name,state);
  }catch{}finally{await fd?.close();}
 }
 return lines;
}
async function run(directory){const {offsets,lines}=await initial(directory);for(const line of lines)process.stdout.write(line+'\n');process.stderr.write('courier-log: monitoring only; Ctrl+C stops this viewer.\n');
 let active=false;const timer=setInterval(async()=>{if(active)return;active=true;try{for(const line of await readNew(directory,offsets))process.stdout.write(line+'\n');}finally{active=false;}},250);
 process.once('SIGINT',()=>{clearInterval(timer);process.exitCode=0;});process.once('SIGTERM',()=>{clearInterval(timer);process.exitCode=0;});
}
if(require.main===module){const directory=process.argv[2]||process.env.HDWORK2_LOG_DIRECTORY||path.join(process.env.ProgramData||'C:\\ProgramData','HDWork2','Logs');run(directory).catch(()=>{process.stderr.write('LOG_MONITOR_FAILED\n');process.exitCode=1;});}
module.exports={snapshot,initial,readNew};
