import {useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {Section} from '../operations/components';
import {useWorkData} from './hooks';
import Actions from './Actions';
import OrderChat from './OrderChat';
import type {Detail,Work} from './model';
type Conversation=Work&{reference:string};
export default function LiveChat(){return import.meta.env.VITE_HDWORK2_LIVE_CHAT==='true'?<OperationalChat/>:<p>Live Chat belum diaktifkan pada build ini.</p>;}
function OperationalChat(){const {id}=useParams();const {user}=useAuth();const [page,setPage]=useState(1),[area,setArea]=useState('');const {data,error,refresh}=useWorkData<{data:Conversation[];hasMore:boolean}>(`/chat/conversations?${new URLSearchParams({page:String(page),...(area?{area}:{})})}`,{page});
 return <><h1 className="text-3xl font-semibold">Telegram Live Chat</h1><p className="text-sm text-muted-foreground">Percakapan seluruh jenis order sesuai akses modul · status pengiriman dari Courier.</p><div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="space-y-3 rounded-xl border bg-card p-3"><label className="text-sm">Kategori<select className="ml-2 rounded border bg-background p-2" value={area} onChange={e=>{setArea(e.target.value);setPage(1);}}><option value="">SEMUA JENIS</option><option>TIAL</option><option>LOGIC</option></select></label>{error&&<p role="alert">{error}</p>}{data?.data.map(c=><Link key={c.id} to={`/chat/${c.id}`} className={`block rounded-lg border p-3 text-sm ${id===c.id?'border-primary bg-primary/5':''}`}><strong>{c.reference||'/'+c.command}</strong><span className="block">{c.module} · {c.status}</span><span className="text-xs">{c.ownerName||'Belum ditugaskan'}</span></Link>)}{data&&!data.data.length&&<p>Belum ada percakapan sesuai akses.</p>}<div className="flex justify-between"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><Button variant="outline" disabled={!data?.hasMore} onClick={()=>setPage(p=>p+1)}>Berikutnya</Button></div></aside><section className="min-w-0" aria-label="Conversation">{id?<ConversationPanel key={`${user?.id}:${id}`} id={id} onChange={refresh}/>:<Section title="Pilih percakapan" description="Pesan tersimpan di MySQL. Tidak ada data demo atau kiriman otomatis."><p>Pilih order dari daftar.</p></Section>}</section></div></>;
}
function ConversationPanel({id,onChange}:{id:string;onChange:()=>Promise<void>}){
 const detail=useWorkData<Detail>(`/orders/${id}`);
 async function refresh(){await Promise.all([detail.refresh(),onChange()]);}
 return <div className="space-y-4"><Section title={detail.data?.data.scIn||detail.data?.data.inetMasked||'Percakapan order'} description={`${detail.data?.data.module||''} · ${detail.data?.data.ownerName||'Belum ditugaskan'}`}><Link className="text-primary underline" to={`/orders/${id}`}>Detail order</Link>{detail.error&&<p role="alert">{detail.error}</p>}{detail.data&&<Actions key={id} order={detail.data.data} refresh={refresh} escalationEnabled={detail.data.capabilities?.escalate===true}/>}</Section><OrderChat key={id} id={id} order={detail.error?undefined:detail.data?.data} onChange={refresh}/></div>;
}
