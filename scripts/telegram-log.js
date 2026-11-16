// Read-only Python viewer. Reuse the existing rotation/partial-line tail reader.
const fs=require('node:fs'),path=require('node:path');
const {initial,readNew}=require('./courier-log');
const pythonFile=name=>/^hdwork2-\d{4}-\d{2}-\d{2}-python-\d+(?:\.previous)?\.jsonl$/.test(name);
function row(line){try{const r=JSON.parse(line);return r.source==='python'&&/^[A-Z_]{2,64}$/.test(r.event)?r:null;}catch{return null;}}
function isError(r){
 if(!r)return false;
 const errorLevel=value=>/^(ERROR|CRITICAL|FATAL)$/.test(String(value).toUpperCase());
 return !!r.error||r.stream==='stderr'||errorLevel(r.level)||errorLevel(r.severity)||
  /^(ERROR|FAILED|RETRY|RETRYING|TIMEOUT|CRITICAL|FATAL)$/.test(String(r.status).toUpperCase())||
  Number(r.httpStatus)>=400||Number(r.status)>=400||!!r.error_code&&r.error_code!=='0'||
  /ERROR|FAIL|RETRY|TIMEOUT|STALLED|DROPPED|RECONCILIATION/.test(r.event)||
  /ERROR|FAIL|RETRY|TIMEOUT|RATE_LIMIT/.test(r.reason||'')||
  r.stream==='stdout'&&/\b(ERROR|CRITICAL|Traceback|\w+Error:)\b/.test(r.text||'');
}
function visible(r,errors=false){
 if(!r)return false;
 // Failures always win, including failures in otherwise routine events.
 if(isError(r))return true;
 if(errors)return false;
 if(['COURIER_CYCLE','ROUTING'].includes(r.event))return false;
 // Request/poll completion lacks the update count. POLL_RESULT is the reliable
 // positive-activity record; do not infer activity from a successful request.
 if(['TELEGRAM_REQUEST_START','TELEGRAM_REQUEST'].includes(r.event)&&r.apiMethod==='getUpdates')return false;
 if(['TELEGRAM_POLL','TELEGRAM_POLL_RESULT','JOURNAL_INCOMING','OUTBOX_CLAIM','OUTBOX_CLAIM_RESULT'].includes(r.event))return Number(r.count)>0;
 return true;
}
function redact(text){
 return text.replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g,'[REDACTED_TOKEN]')
  .replace(/(https?:\/\/)[^\s/]+@/gi,'$1[REDACTED]@')
  .replace(/(["']?(?:authorization|cookie|set-cookie|token|password|secret|session|service_key|identity_key|lease_token|text|caption|payload|raw_text|first_name|last_name|username|phone_number|chat_id|sender_id|SC\s*\/\s*IN|NO\s+INET|NIK|SN\s+ONT|alamat|nama\s+pelanggan)["']?\s*[:=]\s*).*/gim,'$1[REDACTED]')
  .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,'[REDACTED_EMAIL]');
}
function format(line){const r=row(line);if(!r)return '';if(r.stream&&typeof r.text==='string')return redact(r.text);return line+'\n'+(r.error?.nativeTraceback?redact(r.error.nativeTraceback):'');}
function args(argv){let directory,last=100,errors=false,follow=true;for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--errors')errors=true;else if(a==='--no-follow')follow=false;else if(a==='--last'){last=Number(argv[++i]);if(!Number.isInteger(last)||last<1||last>10000)throw Error('LAST_MUST_BE_1_TO_10000');}else if(!a.startsWith('--')&&!directory)directory=a;else throw Error('VIEWER_ARGUMENT_REJECTED');}return {directory,last,errors,follow};}
async function run({directory,last=100,errors=false,follow=true},write=s=>process.stdout.write(s)){
 const accept=line=>visible(row(line),errors);
 const state=await initial(directory,last,accept,pythonFile);
 for(const line of state.lines)write(format(line));
 if(!follow)return;
 let active=false;
 const timer=setInterval(async()=>{if(active)return;active=true;try{for(const line of await readNew(directory,state.offsets,pythonFile))if(accept(line))write(format(line));}catch{process.stderr.write('TELEGRAM_LOG_READ_FAILED\n');}finally{active=false;}},250);
 const stop=()=>{clearInterval(timer);process.exitCode=0;};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 return {stop};
}
if(require.main===module){try{const options=args(process.argv.slice(2));options.directory||=path.join(process.env.ProgramData||'C:\\ProgramData','HDWork2','Logs','Telegram');run(options).catch(()=>{process.stderr.write('TELEGRAM_LOG_READ_FAILED\n');process.exitCode=1;});}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={row,isError,visible,redact,format,args,run,pythonFile};
