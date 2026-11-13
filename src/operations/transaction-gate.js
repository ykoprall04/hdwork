// Process-local admission/drain accounting, including clients that disconnected.
let draining=false,active=0;
const listeners=new Set();
const changed=()=>{for(const fn of listeners)fn();};
function enter(){if(draining)throw Object.assign(Error('WEB_DRAINING'),{code:'WEB_DRAINING',statusCode:503});active++;let done=false;return ()=>{if(!done){done=true;active--;changed();}};}
async function run(fn){const leave=enter();try{return await fn();}finally{leave();}}
function begin(){draining=true;changed();}
function snapshot(){return {draining,active};}
function subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
module.exports={enter,run,begin,snapshot,subscribe};
