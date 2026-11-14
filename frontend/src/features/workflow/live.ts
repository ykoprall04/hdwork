export type Change={eventId?:string;arrivalModules?:Record<string,number>;arrivalCount?:number;arrival?:boolean;changed?:boolean;modules?:string[];reset?:boolean};
export function connectLive(url:string,onChange:(event:Change)=>void,make:(url:string)=>EventSource=u=>new EventSource(u,{withCredentials:true}),clock:Pick<typeof globalThis,'setTimeout'|'clearTimeout'|'setInterval'|'clearInterval'>=globalThis){
 const source=make(url);let fallback:ReturnType<typeof setInterval>|undefined,timer:ReturnType<typeof setTimeout>|undefined,pending:Change|null=null,lastEventId='';
 const schedule=(e:Change)=>{if(e.eventId){if(!/^\d+$/.test(e.eventId))return;if(lastEventId&&BigInt(e.eventId)<=BigInt(lastEventId))return;lastEventId=e.eventId;}pending={...pending,...e,arrivalModules:Object.fromEntries([...new Set([...Object.keys(pending?.arrivalModules||{}),...Object.keys(e.arrivalModules||{})])].map(key=>[key,(pending?.arrivalModules?.[key]||0)+(e.arrivalModules?.[key]||0)])),arrivalCount:(pending?.arrivalCount||0)+(e.arrivalCount||0),arrival:Boolean(pending?.arrival||e.arrival),changed:Boolean(pending?.changed||e.changed),modules:[...new Set([...(pending?.modules||[]),...(e.modules||[])])]};clock.clearTimeout(timer);timer=clock.setTimeout(()=>{const value=pending;pending=null;if(value)onChange(value);},250);};
 source.addEventListener('change',e=>{try{schedule(JSON.parse((e as MessageEvent).data));}catch{schedule({reset:true});}});source.addEventListener('reset',()=>schedule({reset:true}));
 const poll=()=>{if(typeof document==='undefined'||document.visibilityState!=='hidden')schedule({reset:true});};fallback=clock.setInterval(poll,60000);source.onopen=()=>{};source.onerror=()=>{};
 return()=>{source.close();clock.clearTimeout(timer);if(fallback)clock.clearInterval(fallback);};
}

// Share one SSE/fallback loop per tab, including summary and notification consumers.
const subscriptions=new Map<string,{listeners:Set<(event:Change)=>void>;close:()=>void}>();
export function subscribeLive(url:string,listener:(event:Change)=>void){
 let entry=subscriptions.get(url);
 if(!entry){const listeners=new Set<(event:Change)=>void>();const close=connectLive(url,event=>{for(const fn of listeners)fn(event);});entry={listeners,close};subscriptions.set(url,entry);}
 entry.listeners.add(listener);
 return()=>{entry.listeners.delete(listener);if(!entry.listeners.size){entry.close();subscriptions.delete(url);}};
}
