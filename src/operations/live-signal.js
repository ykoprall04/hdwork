// In-process wake hint only. Database tail remains authoritative across processes.
const {EventEmitter}=require('node:events');const events=new EventEmitter();events.setMaxListeners(64);let queued=false;
function notify(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;try{events.emit('commit');}catch{}});}
function subscribe(fn){events.on('commit',fn);return()=>events.off('commit',fn);}
module.exports={notify,subscribe};
