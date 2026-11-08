export type Change={arrival?:boolean;changed?:boolean;modules?:string[];reset?:boolean};
export function connectLive(url:string,onChange:(event:Change)=>void,make:(url:string)=>EventSource=u=>new EventSource(u,{withCredentials:true}),clock:Pick<typeof globalThis,'setTimeout'|'clearTimeout'|'setInterval'|'clearInterval'>=globalThis){
 const source=make(url);let fallback:ReturnType<typeof setInterval>|undefined,timer:ReturnType<typeof setTimeout>|undefined,pending:Change|null=null;
 const schedule=(e:Change)=>{pending={...pending,...e,arrival:Boolean(pending?.arrival||e.arrival),changed:Boolean(pending?.changed||e.changed),modules:[...new Set([...(pending?.modules||[]),...(e.modules||[])])]};clock.clearTimeout(timer);timer=clock.setTimeout(()=>{const value=pending;pending=null;if(value)onChange(value);},250);};
 source.addEventListener('change',e=>{try{schedule(JSON.parse((e as MessageEvent).data));}catch{schedule({reset:true});}});source.addEventListener('reset',()=>schedule({reset:true}));
 source.onopen=()=>{if(fallback)clock.clearInterval(fallback);fallback=undefined;};source.onerror=()=>{if(!fallback)fallback=clock.setInterval(()=>schedule({reset:true}),60000);};
 return()=>{source.close();clock.clearTimeout(timer);if(fallback)clock.clearInterval(fallback);};
}
