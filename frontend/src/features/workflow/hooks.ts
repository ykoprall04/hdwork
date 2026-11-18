import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {request,operationsBase} from './api';
import {subscribeLive} from './live';
import {areaIncludes,scopeKey,type Work,type WorkList} from './model';

// Give bursts of live events one trailing refresh, and keep the same cooldown
// when changing filters or pages within the same account.
const refreshIntervalMs = 2_000;
function useWorkRead<T>(key: string, scope: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>) {
 const [result,setResult]=useState<{key:string;data:T}|null>(null);
 const [loading,setLoading]=useState(enabled),[error,setError]=useState('');
 const cooldown=useRef({scope,until:0});
 const read=useRef<() => Promise<void>>(async()=>{});
 const refresh=useCallback(()=>read.current(),[]);

 useEffect(()=>{
  if(cooldown.current.scope!==scope)cooldown.current={scope,until:0};
  if(!enabled)return;

  let stopped=false,requested=false,nextRead=0;
  let active:Promise<void>|undefined,controller:AbortController|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;

  function schedule():Promise<void>{
   if(stopped||!requested)return Promise.resolve();
   if(active)return active;
   if(timer!==undefined)return Promise.resolve();
   const delay=Math.max(nextRead,cooldown.current.until)-Date.now();
   if(delay>0){
    setLoading(false);
    timer=setTimeout(()=>{timer=undefined;void schedule();},Math.min(delay,2_147_483_647));
    return Promise.resolve();
   }

   requested=false;
   const c=new AbortController();
   controller=c;
   nextRead=Date.now()+refreshIntervalMs;
   setLoading(true);
   active=Promise.resolve().then(()=>load(c.signal)).then(data=>{
    if(!stopped){setResult({key,data});setError('');}
   }).catch(cause=>{
    if(stopped)return;
    const issue=cause as {status?:number;retryAfter?:number}|null;
    if(issue?.status===429){
     cooldown.current.until=Date.now()+(issue.retryAfter??60)*1000;
     requested=true;
     setError('Terlalu banyak permintaan. Data akan diperbarui otomatis setelah jeda.');
    }else{
     setError(cause instanceof Error?cause.message:'Gagal membaca data');
     if(issue?.status===401||issue?.status===403)setResult(null);
    }
   }).finally(()=>{
    active=undefined;
    if(!stopped){setLoading(false);void schedule();}
   });
   return active;
  }

  read.current=()=>{requested=true;return schedule();};
  // Avoid starting an extra request on React's development setup/cleanup cycle.
  void Promise.resolve().then(()=>{if(!stopped)void read.current();});
  return ()=>{
   stopped=true;
   clearTimeout(timer);
   controller?.abort();
   read.current=async()=>{};
  };
 },[key,scope,enabled,load]);
 return {data:enabled&&result?.key===key?result.data:null,loading:enabled&&loading,error:enabled?error:'',refresh};
}

export function useWorkData<T>(path:string,{area='ALL',page=1,enabled=true}:{area?:string;page?:number;enabled?:boolean}={}){
 const {user}=useAuth();const scope=scopeKey(user);
 const [arrival,setArrival]=useState(false);
 const load=useCallback((signal:AbortSignal)=>request<T>(path,undefined,signal),[path]);
 const result=useWorkRead(scope+'|'+path,scope,enabled,load);
 const {refresh}=result;
 useEffect(()=>{setArrival(false);},[path,scope,enabled]);
 useEffect(()=>{if(!enabled)return;return subscribeLive(operationsBase+'/events',e=>{if(e.modules?.length&&!areaIncludes(area,e.modules))return;if(e.arrival&&page>1){setArrival(true);if(!e.changed&&!e.reset)return;}void refresh();});},[refresh,scope,enabled,area,page]);
 return {...result,arrival};
}
export function useMyActiveWork(area:string,enabled=true){
 const {user}=useAuth();const scope=scopeKey(user);
 const load=useCallback(async(signal:AbortSignal)=>{
  const all:Work[]=[];let page=1,hasMore=true;
  while(hasMore&&page<=10000){const query=new URLSearchParams({area,tab:'process',mine:'true',page:String(page)});const response=await request<WorkList>('/orders?'+query,undefined,signal);all.push(...response.data);hasMore=response.hasMore;page++;}
  if(hasMore)throw Error('Daftar pekerjaan melewati batas paginasi 10.000 halaman; sebagian order belum dapat dimuat.');
  return all.filter(order=>order.status==='IN_PROGRESS'&&String(order.ownerId)===String(user?.id));
 },[area,user?.id]);
 const result=useWorkRead(scope+'|'+area,scope,enabled,load);
 const {refresh}=result;
 useEffect(()=>{if(!enabled)return;return subscribeLive(operationsBase+'/events',event=>{if(event.modules?.length&&!areaIncludes(area,event.modules))return;if(event.arrival&&!event.changed&&!event.reset)return;void refresh();});},[enabled,refresh,scope,area]);
 return {...result,data:result.data||[],loaded:result.data!==null};
}
export function useServerClock(serverNow?:string){const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const offset=serverNow?Date.parse(serverNow)-Date.now():0;const tick=()=>setNow(Date.now()+offset);tick();const id=setInterval(tick,1000);return()=>clearInterval(id);},[serverNow]);return now;}
