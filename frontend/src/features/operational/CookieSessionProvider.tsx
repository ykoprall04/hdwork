import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import {AuthContext,type User} from '@/contexts/auth-context';
import {SessionState} from './session-state';
import {cookieFetch,setCsrf} from './cookie-http';
import {API_URL} from '@/config/api';
export default function CookieSessionProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[status,setStatus]=useState('loading'),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const clear=useCallback(()=>{setCsrf('');setUser(null);setStatus('anonymous');},[]);
 useEffect(()=>{
  try{localStorage.removeItem('hdwork:operational:auth:v1');}catch{/* remove obsolete bearer token only */}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function verify(){try{const response=await cookieFetch(`${API_URL}/auth/me`,{signal:controller.signal});if(response.status===401||response.status===403){clear();return;}if(!response.ok)throw Error('Sesi belum dapat diverifikasi.');const result=await response.json();if(!result.success||!Array.isArray(result.data?.modules)||!['SUPER_ADMIN','ADMIN','HD','SHOW_ONLY'].includes(result.data.role)||typeof result.csrf!=='string')throw Error('Respons sesi tidak valid.');if(!controller.signal.aborted){setCsrf(result.csrf);setUser(result.data);setStatus('authenticated');setError('');}}catch(e){if(!controller.signal.aborted){setUser(null);setStatus('error');setError(e instanceof Error?e.message:'Verifikasi gagal');}}finally{if(!controller.signal.aborted)timer=setTimeout(()=>void verify(),60000);}}
  void verify();return()=>{controller.abort();clearTimeout(timer);};
 },[revision,clear]);
 const login=useCallback((_token:string,newUser:User)=>{try{sessionStorage.removeItem(`hdwork:operational:checkin:${newUser.id}`);}catch{/* UI preference only */}setStatus('loading');setRevision(n=>n+1);},[]);
 const logout=useCallback(()=>{void cookieFetch(`${API_URL}/auth/logout`,{method:'POST'}).then(r=>{if(!r.ok&&r.status!==401)throw Error();clear();}).catch(()=>{setStatus('error');setError('Logout belum berhasil. Coba lagi sebelum meninggalkan perangkat.');});},[clear]);
 const auth=useMemo(()=>({user,token:user?'cookie-session':null,login,logout}),[user,login,logout]);
 return <AuthContext.Provider value={auth}><SessionState.Provider value={{status,error,retry:()=>setRevision(n=>n+1)}}>{children}</SessionState.Provider></AuthContext.Provider>;
}
