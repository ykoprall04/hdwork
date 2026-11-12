// Independent read-only monitor. No process control, stdin ownership, secrets or Courier imports.
const fs=require('node:fs'),path=require('node:path'),{StringDecoder}=require('node:string_decoder');
const view=require('./courier-log-view');
const pattern=/^hdwork2-\d{4}-\d{2}-\d{2}-[a-z-]+-\d+\.jsonl$/;
function snapshot(directory){try{return fs.readdirSync(directory).filter(f=>pattern.test(f)).sort();}catch{return [];}}
async function initial(directory,tail=100,accept=()=>true){
 const offsets=new Map(),rows=[];
 for(const name of snapshot(directory)){
  let fd;try{fd=await fs.promises.open(path.join(directory,name),'r');const stat=await fd.stat();let end=stat.size,carry=Buffer.alloc(0),trailing=true,partial=Buffer.alloc(0),selected=[];
   while(end>0&&selected.length<tail){const size=Math.min(65536,end),buffer=Buffer.alloc(size);end-=size;const {bytesRead}=await fd.read(buffer,0,size,end);const data=Buffer.concat([buffer.subarray(0,bytesRead),carry]);let stop=data.length;
    for(let i=data.length-1;i>=0;i--)if(data[i]===10){const line=data.subarray(i+1,stop);stop=i;if(trailing){partial=Buffer.from(line);trailing=false;}else if(line.length){const text=line.toString('utf8');if(accept(text))selected.push(text);if(selected.length>=tail)break;}}
    carry=Buffer.from(data.subarray(0,stop));
   }
   if(end===0&&carry.length&&selected.length<tail){if(trailing)partial=carry;else{const text=carry.toString('utf8');if(accept(text))selected.push(text);}}
   const decoder=new StringDecoder('utf8');offsets.set(name,{position:stat.size,partial:decoder.write(partial),decoder});rows.push(...selected.reverse());
  }catch{}finally{await fd?.close();}
 }
 rows.sort((a,b)=>{try{return String(JSON.parse(a).timestamp).localeCompare(String(JSON.parse(b).timestamp));}catch{return 0;}});
 return {offsets,lines:rows.slice(-tail)};
}
async function readNew(directory,offsets){const lines=[];
 for(const name of snapshot(directory)){
  let fd;try{fd=await fs.promises.open(path.join(directory,name),'r');const stat=await fd.stat();let state=offsets.get(name)||{position:0,partial:'',decoder:new StringDecoder('utf8')};if(stat.size<state.position)state={position:0,partial:'',decoder:new StringDecoder('utf8')};
   // One chunk per file per tick bounds observer overhead; subsequent ticks drain the rest.
   const length=Math.min(stat.size-state.position,65536);if(length){const buffer=Buffer.alloc(length);const {bytesRead}=await fd.read(buffer,0,length,state.position);state.position+=bytesRead;const text=state.partial+state.decoder.write(buffer.subarray(0,bytesRead));const parts=text.split('\n');state.partial=parts.pop();lines.push(...parts.filter(Boolean));}offsets.set(name,state);
  }catch{}finally{await fd?.close();}
 }
 return lines;
}
async function run(directory,mode='default'){const accept=line=>view.visible(view.project(line),mode);const print=line=>{const row=view.project(line);if(view.visible(row,mode))process.stdout.write(view.format(row,mode)+'\n');};const {offsets,lines}=await initial(directory,100,accept);for(const line of lines)print(line);process.stderr.write('courier-log: monitoring only; Ctrl+C stops this viewer.\n');
 let active=false;const timer=setInterval(async()=>{if(active)return;active=true;try{for(const line of await readNew(directory,offsets))print(line);}finally{active=false;}},250);
 process.once('SIGINT',()=>{clearInterval(timer);process.exitCode=0;});process.once('SIGTERM',()=>{clearInterval(timer);process.exitCode=0;});
}
if(require.main===module){try{const {directory,mode}=view.args(process.argv.slice(2));run(directory||process.env.HDWORK2_LOG_DIRECTORY||path.join(process.env.ProgramData||'C:\\ProgramData','HDWork2','Logs'),mode).catch(()=>{process.stderr.write('LOG_MONITOR_FAILED\n');process.exitCode=1;});}catch{process.stderr.write('VIEWER_ARGUMENT_REJECTED\n');process.exitCode=1;}}
module.exports={snapshot,initial,readNew};
