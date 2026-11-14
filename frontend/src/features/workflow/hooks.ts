import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {request,operationsBase} from './api';
import {subscribeLive} from './live';
import {areaIncludes,scopeKey} from './model';
export function useWorkData<T>(path:string,{area='ALL',page=1}:{area?:string;page?:number}={}){
 const {user}=useAuth();const scope=scopeKey(user);
 const [result,setResult]=useState<{key:string;data:T}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[arrival,setArrival]=useState(false);
 const current=useRef({path,area,page,scope});useEffect(()=>{current.current={path,area,page,scope};},[path,area,page,scope]);const controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{const key=current.current.scope+'|'+current.current.path;const url=current.current.path;controller.current?.abort();const c=new AbortController();controller.current=c;setLoading(true);try{const data=await request<T>(url,undefined,c.signal);if(!c.signal.aborted){setResult({key,data});setError('');}}catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Gagal membaca data');if([401,403].includes((e as {status:number}).status))setResult(null);}}finally{if(!c.signal.aborted)setLoading(false);}},[]);
 useEffect(()=>{let stopped=false;void Promise.resolve().then(()=>{if(!stopped){setArrival(false);void refresh();}});return()=>{stopped=true;controller.current?.abort();};},[path,scope,refresh]);
 useEffect(()=>subscribeLive(operationsBase+'/events',e=>{if(e.modules?.length&&!areaIncludes(current.current.area,e.modules))return;if(e.arrival&&current.current.page>1){setArrival(true);if(!e.changed&&!e.reset)return;}void refresh();}),[refresh,scope]);
 return {data:result?.key===scope+'|'+path?result.data:null,loading,error,arrival,refresh};
}
export function useServerClock(serverNow?:string){const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const offset=serverNow?Date.parse(serverNow)-Date.now():0;const tick=()=>setNow(Date.now()+offset);tick();const id=setInterval(tick,1000);return()=>clearInterval(id);},[serverNow]);return now;}
