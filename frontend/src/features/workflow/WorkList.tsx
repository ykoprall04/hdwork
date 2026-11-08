import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Section,Empty} from '../operations/components';
import {jakartaToday} from '../tial/query';
import {useWorkData,useServerClock} from './hooks';
import {duration,labels,type WorkList as Data} from './model';
import Actions from './Actions';
import People from './People';
import ExportButton from './ExportButton';
import NewOrder from './NewOrder';
import WorkspaceCounts from './WorkspaceCounts';
const field='mt-1 block w-full rounded-lg border bg-background p-2 text-sm';
export default function WorkList(){
 const {user}=useAuth();const location=useLocation();const workspace=location.pathname.split('/')[2]||'B2C';const area=workspace==='B2C'?(location.pathname.includes('LOGIC')?'LOGIC':'TIAL'):workspace;
 const allowed=(user?.modules||[]).filter(m=>area==='TIAL'?['TIAL','REQ'].includes(m):area==='LOGIC'?['LOGIC_PSB','LOGIC_MO'].includes(m):m===area);
 const [tab,setTab]=useState('incoming'),[command,setCommand]=useState(''),[mine,setMine]=useState(true),[from,setFrom]=useState(''),[to,setTo]=useState(''),[hd,setHd]=useState(''),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const query={area,command,tab,mine:String(mine),from,to,hd,status,q:search.trim(),page:String(page)};const validDate=(!from&&!to)||(Boolean(from&&to)&&from<=to);
 const path='/orders?'+new URLSearchParams({...query,...(!validDate?{from:'',to:''}:{})});
 const {data,loading,error,arrival,refresh}=useWorkData<Data>(path,{area,page});const now=useServerClock(data?.serverNow);
 function change(fn:()=>void){setPage(1);fn();}
 return <>
 <header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / {workspace} / {area}</p><h1 className="mt-2 text-3xl font-semibold">Daftar pekerjaan {area==='LOGIC'?'LOGIC / SOLVER':area}</h1></header>
 <WorkspaceCounts key={area} area={area}/>
 <NewOrder key={area+allowed.join(',')} modules={allowed}/>
 <nav aria-label="Status pekerjaan" className="flex gap-2 overflow-x-auto">{[['incoming','ORDER MASUK'],['process','PROSES CEK'],['finished','SELESAI']].map(([v,label])=><Button key={v} variant={tab===v?'default':'outline'} onClick={()=>change(()=>{setTab(v);setHd('');setMine(true);setFrom(v==='finished'?jakartaToday():'');setTo(v==='finished'?jakartaToday():'');setStatus('');})}>{label}</Button>)}</nav>
 <section aria-label="Filter pekerjaan" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
 {['TIAL','LOGIC'].includes(area)&&<label className="text-xs">Jenis perintah<select aria-label="Jenis perintah" className={field} value={command} onChange={e=>change(()=>setCommand(e.target.value))}><option value="">SEMUA</option>{(area==='TIAL'?[['order','TIAL'],['req','REQ']]:[['config_psb','LOGIC_PSB'],['mo','LOGIC_MO']]).filter(([,m])=>user?.modules?.includes(m)).map(([c])=><option key={c} value={c}>/{c==='mo'?'MO':c}</option>)}</select></label>}
 <label className="text-xs">Tanggal order mulai WIB<input aria-label="Tanggal mulai" type="date" className={field} value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label><label className="text-xs">Sampai WIB<input aria-label="Tanggal akhir" type="date" className={field} value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
 <label className="text-xs">Cari SC/IN atau INET<input aria-label="Pencarian pekerjaan" maxLength={100} className={field} value={search} onChange={e=>change(()=>setSearch(e.target.value))}/></label>
 {tab==='process'&&<label className="text-xs">Cakupan<select className={field} aria-label="Cakupan proses" value={String(mine)} onChange={e=>change(()=>setMine(e.target.value==='true'))}><option value="true">ORDER SAYA</option><option value="false">SEMUA ORDER</option></select></label>}
 {tab==='finished'&&<><People value={hd} onChange={v=>change(()=>setHd(v))}/><label className="text-xs">Status selesai<select aria-label="Status selesai" className={field} value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">SEMUA</option>{['DONE','FAILED','DUPLICATE'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label></>}
 <Button variant="ghost" onClick={()=>change(()=>{setFrom('');setTo('');setCommand('');setSearch('');setHd('');setStatus('');})}>Semua tanggal / reset filter</Button>
 </section>
 {!validDate&&<p role="alert">Isi rentang tanggal lengkap dan benar. Filter belum diterapkan.</p>}
 {arrival&&page>1&&<Button variant="outline" onClick={()=>setPage(1)}>Ada order baru</Button>}
 {tab==='finished'&&user?.role!=='SHOW_ONLY'&&validDate&&<ExportButton key={user?.id} query={query}/>}
 <Section title={tab==='incoming'?'ORDER MASUK':tab==='process'?'PROSES CEK':'SELESAI'} description="Live SSE · izin modul diverifikasi backend · tidak ada reset harian.">
 {loading&&<p role="status" className="mb-2 text-xs text-muted-foreground">{data?'Memperbarui data…':'Memuat pekerjaan…'}</p>}{error&&<div role="alert" className="mb-3 text-sm"><p>{error}</p>{data&&<p>Data terakhir belum berhasil diperbarui.</p>}<Button variant="outline" onClick={()=>void refresh()}>Coba lagi</Button></div>}
 {data&&!data.data.length?<Empty text="Tidak ada pekerjaan sesuai filter."/>:data&&<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr>{['Identifier order','Kategori','Status','Petugas','Waktu masuk','Pengerjaan'].map(s=><th key={s} className="p-2 font-medium">{s}</th>)}</tr></thead><tbody>{data.data.map(o=><tr key={o.id} className="border-b last:border-0 hover:bg-muted/40"><td className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-medium text-primary underline" to={`/orders/${o.id}`}>{o.id.slice(0,20)}…</Link>{validDate&&<Actions key={`${user?.id}:${o.id}`} compact order={o} refresh={refresh}/>}</div><p className="mt-1 text-[10px] text-muted-foreground">SC/IN: {o.scIn||'—'} · INET: {o.inetMasked||'—'}</p></td><td className="p-3 text-xs">{o.module}<span className="block text-muted-foreground">/{o.command}</span></td><td className="p-3"><Badge variant="outline">{labels[o.status]}{o.decision==='REJECT_DUPLICATE'?' DITOLAK':''}</Badge></td><td className="p-3 text-xs">{o.ownerName||'Belum PICK'}</td><td className="p-3 text-xs">{new Date(o.receivedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</td><td className="p-3 text-xs tabular-nums">{o.status==='IN_PROGRESS'?duration(o.startedAt,now):'—'}</td></tr>)}</tbody></table></div>}
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman {page}</span><div className="flex gap-2"><Button variant="outline" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><Button variant="outline" disabled={loading||!data?.hasMore||page>=10000} onClick={()=>setPage(p=>p+1)}>Berikutnya</Button></div></div>
 </Section><Link className="text-sm text-primary underline" to="/recap">Dashboard Rekap</Link>
 </>;
}
