import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {operationsBase} from './api';
import {subscribeLive} from './live';
import {scopeKey} from './model';
import {notification} from './notification-policy';
export default function OrderNotifications({area='ALL'}:{area?:string}){const {user}=useAuth();const scope=scopeKey(user);return <NotificationContent key={scope+area} area={area} scope={scope}/>;}
function NotificationContent({area,scope}:{area:string;scope:string}){
 const [sound,setSound]=useState(false),[count,setCount]=useState(0),[audioError,setAudioError]=useState('');
 const audio=useRef<AudioContext|null>(null),enabled=useRef(false);
 useEffect(()=>{const key='hdwork2:arrival:'+scope+':'+area;let last='';try{last=sessionStorage.getItem(key)||'';}catch{/* optional storage */}
 return subscribeLive(operationsBase+'/events',event=>{
 const next=notification(event,area,last);if(!next)return;
 last=next.last;try{sessionStorage.setItem(key,last);}catch{/* optional storage */}
 setCount(n=>n+next.count);
 if(enabled.current&&audio.current){const ctx=audio.current;if(ctx.state!=='running'){setAudioError('Aktifkan kembali suara untuk mengizinkan audio browser.');return;}const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.connect(gain);gain.connect(ctx.destination);oscillator.frequency.value=880;gain.gain.setValueAtTime(0.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.25);oscillator.start();oscillator.stop(ctx.currentTime+0.25);}
 });},[scope,area]);
 useEffect(()=>()=>{void audio.current?.close();audio.current=null;},[]);
 async function toggle(){if(sound){enabled.current=false;setSound(false);return;}try{audio.current??=new AudioContext();await audio.current.resume();enabled.current=true;setSound(true);setAudioError('');}catch{setAudioError('Browser belum mengizinkan suara.');}}
 return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"><Button variant="outline" size="sm" aria-pressed={sound} onClick={()=>void toggle()}>Suara {sound?'aktif':'nonaktif'}</Button>{count>0&&<><span role="status" aria-live="polite">{count} order baru masuk</span><Button size="sm" variant="ghost" onClick={()=>setCount(0)}>Tutup notifikasi</Button></>}{audioError&&<span role="status">{audioError}</span>}</div>;
}
