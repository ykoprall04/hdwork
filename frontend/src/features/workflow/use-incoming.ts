import {useEffect,useState} from 'react';
import {useWorkData} from './hooks';
import {initializeCursor,unread} from './incoming-cursor';

export function useIncoming(account:string,area:string,enabled:boolean){
 const summary=useWorkData<{data:{id:string;sequence:string}[]}>('/chat/incoming-summary?'+new URLSearchParams({area}),{area,enabled});
 const [,redraw]=useState(0),[storageWarning,setStorageWarning]=useState(false);
 useEffect(()=>{
  let active=true;
  void Promise.resolve().then(()=>{
   if(!active||summary.loading||summary.error||!summary.data)return;
   let persisted=true;for(const row of summary.data.data)if(!initializeCursor(account,row.id,row.sequence))persisted=false;
   if(!persisted)setStorageWarning(true);
   redraw(n=>n+1);
  });
  return()=>{active=false;};
 },[account,summary.data,summary.error,summary.loading]);
 useEffect(()=>{const update=()=>redraw(n=>n+1);window.addEventListener('storage',update);window.addEventListener('hdwork2:incoming-read',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('hdwork2:incoming-read',update);};},[]);
 const sequences=new Map(summary.data?.data.map(row=>[row.id,row.sequence]));
 return {isUnread:(id:string)=>enabled&&unread(account,id,sequences.get(id)||'0'),error:summary.error,storageWarning};
}
