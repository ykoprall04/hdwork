import {useState, type MouseEvent} from 'react';
import OrderWorkPanel from './OrderWorkPanel';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import WorkStatusBadge from './WorkStatusBadge';
import PageHeader from '../workspace-ui/PageHeader';
import { Search, SlidersHorizontal } from 'lucide-react';
import {Section,Empty} from '../operations/components';
import {jakartaToday} from '../tial/query';
import {useWorkData,useServerClock} from './hooks';
import {labels,type WorkList as Data} from './model';
import Actions from './Actions';
import People from './People';
import ExportButton from './ExportButton';
import OrderNotifications from './OrderNotifications';
import {FeedbackStatus,WorkTimer} from './OperationalStatus';
import {useEffect} from 'react';
import WorkspaceCounts from './WorkspaceCounts';
const field='mt-1 block w-full rounded-lg border bg-background p-2 text-sm';
export default function WorkList(){
 const [selectedOrder,setSelectedOrder]=useState<string|null>(null);
 const {user}=useAuth();const location=useLocation();const workspace=location.pathname.split('/')[2]||'B2C';const area=workspace==='B2C'?(location.pathname.includes('LOGIC')?'LOGIC':'TIAL'):workspace;
 const [tab,setTab]=useState('incoming'),[command,setCommand]=useState(''),[mine,setMine]=useState(true),[from,setFrom]=useState(''),[to,setTo]=useState(''),[hd,setHd]=useState(''),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [debouncedSearch,setDebouncedSearch]=useState('');useEffect(()=>{if(search===debouncedSearch)return;const timer=setTimeout(()=>{setDebouncedSearch(search);setPage(1);},350);return()=>clearTimeout(timer);},[search,debouncedSearch]);
 const query={area,command,tab,mine:String(mine),from,to,hd,status,q:debouncedSearch.trim(),page:String(page)};const validDate=(!from&&!to)||(Boolean(from&&to)&&from<=to);
 const path='/orders?'+new URLSearchParams({...query,...(!validDate?{from:'',to:''}:{})});
 const {data,loading,error,arrival,refresh}=useWorkData<Data>(path,{area,page});const now=useServerClock(data?.serverNow);
 function openOrder(event:MouseEvent<HTMLAnchorElement>,id:string){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();setSelectedOrder(id);
 }
 function closePanel(){const id=selectedOrder;setSelectedOrder(null);requestAnimationFrame(()=>{const target=id?document.querySelector<HTMLAnchorElement>(`a[data-order-id="${CSS.escape(id)}"]`):null;(target||document.getElementById('operational-main'))?.focus();});}
 function change(fn:()=>void){setPage(1);fn();}
 return <>
 <PageHeader eyebrow={`Ruang kerja · ${workspace}`} title={`Daftar pekerjaan ${area==='LOGIC'?'LOGIC / SOLVER':area}`} actions={<OrderNotifications area={area}/>} />
 <WorkspaceCounts key={area} area={area}/>
 <nav aria-label="Status pekerjaan" className="op-work-tabs">{[['incoming','ORDER MASUK'],['duplicates','DUPLIKAT MENUNGGU'],['process','PROSES CEK'],['finished','SELESAI']].map(([v,label])=><Button key={v} aria-pressed={tab===v} variant={tab===v?'default':'ghost'} onClick={()=>change(()=>{setTab(v);setHd('');setMine(true);setFrom(v==='finished'?jakartaToday():'');setTo(v==='finished'?jakartaToday():'');setStatus('');})}>{label}</Button>)}</nav>
 <section aria-label="Filter pekerjaan" className="op-filter-bar">
 <label className="op-search"><Search aria-hidden="true"/><span className="sr-only">Cari SC/IN, INET/TELP atau STO</span><input aria-label="Pencarian pekerjaan" placeholder="Cari SC/IN, INET/TELP atau STO…" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <details className="op-advanced-filters"><summary><SlidersHorizontal aria-hidden="true"/>Filter lanjutan{Boolean(command||from||to||hd||status||!mine)&&<span className="op-filter-indicator">Aktif</span>}</summary><div className="op-filter-fields">

 {['TIAL','LOGIC'].includes(area)&&<label className="text-xs">Jenis perintah<select aria-label="Jenis perintah" className={field} value={command} onChange={e=>change(()=>setCommand(e.target.value))}><option value="">SEMUA</option>{(area==='TIAL'?[['order','TIAL'],['req','REQ']]:[['config_psb','LOGIC_PSB'],['mo','LOGIC_MO']]).filter(([,m])=>user?.modules?.includes(m)).map(([c])=><option key={c} value={c}>/{c==='mo'?'MO':c}</option>)}</select></label>}
 <label className="text-xs">Tanggal order mulai WIB<input aria-label="Tanggal mulai" type="date" className={field} value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label><label className="text-xs">Sampai WIB<input aria-label="Tanggal akhir" type="date" className={field} value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
 {tab==='process'&&<label className="text-xs">Cakupan<select className={field} aria-label="Cakupan proses" value={String(mine)} onChange={e=>change(()=>{setMine(e.target.value==='true');setHd('');})}><option value="true">ORDER SAYA</option><option value="false">SEMUA ORDER</option></select></label>}
 {['process','finished'].includes(tab)&&<People value={hd} onChange={v=>change(()=>{setHd(v);if(v)setMine(false);})}/>}
 {tab==='finished'&&<><label className="text-xs">Status selesai<select aria-label="Status selesai" className={field} value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">SEMUA</option>{['DONE','FAILED','DUPLICATE'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label></>}
 <Button variant="ghost" onClick={()=>change(()=>{setFrom('');setTo('');setCommand('');setSearch('');setHd('');setStatus('');setMine(true);})}>Semua tanggal / reset filter</Button>
 </div></details>
 {(from||to)&&<p className="w-full text-xs text-muted-foreground">Tanggal order: {from||'…'} — {to||'…'} WIB</p>}
 </section>
 {!validDate&&<p role="alert">Isi rentang tanggal lengkap dan benar. Filter belum diterapkan.</p>}
 {arrival&&page>1&&<Button variant="outline" onClick={()=>setPage(1)}>Ada order baru</Button>}
 {tab==='finished'&&user?.role!=='SHOW_ONLY'&&validDate&&search===debouncedSearch&&<ExportButton key={user?.id} query={query}/>}
 <Section title={tab==='incoming'?'ORDER MASUK':tab==='duplicates'?'DUPLIKAT MENUNGGU':tab==='process'?'PROSES CEK':'SELESAI'} description="Data diperbarui otomatis · sesuai filter dan akses modul Anda.">
 {loading&&<p role="status" className="mb-2 text-xs text-muted-foreground">{data?'Memperbarui data…':'Memuat pekerjaan…'}</p>}{error&&<div role="alert" className="mb-3 text-sm"><p>{error}</p>{data&&<p>Data terakhir belum berhasil diperbarui.</p>}<Button variant="outline" onClick={()=>void refresh()}>Coba lagi</Button></div>}
 {data&&!data.data.length?<Empty text="Tidak ada pekerjaan sesuai filter."/>:data&&<div className="op-order-table-wrap"><table data-process={tab==='process'} className="op-order-table w-full text-left text-sm"><caption className="sr-only">Daftar pekerjaan {area}</caption>
 <thead className="border-b text-xs text-muted-foreground"><tr>{(tab==='process'?['Order','Petugas','Durasi']:['Identifier order','Kategori','Status','Petugas','Waktu masuk','Pengerjaan']).map(label=><th key={label} scope="col" className="p-2 font-medium">{label}</th>)}</tr></thead>
 <tbody>{data.data.map(order=><tr key={order.id} data-selected={selectedOrder===order.id} className="border-b last:border-0 hover:bg-muted/40">
 <td className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Link data-order-id={order.id} aria-haspopup="dialog" className="font-medium text-primary underline" to={`/orders/${order.id}`} onClick={event=>openOrder(event,order.id)}>{order.scIn||order.inetMasked||'Order /'+order.command}</Link>{validDate&&tab!=='process'&&<Actions key={`${user?.id}:${order.id}`} compact order={order} refresh={refresh}/>}</div><p className="mt-1 text-[10px] text-muted-foreground">{tab==='process'?`${order.module} · /${order.command}`:`SC/IN: ${order.scIn||'—'} · INET: ${order.inetMasked||'—'}`}</p></td>
 {tab!=='process'&&<><td data-label="Kategori" className="p-3 text-xs">{order.module}<span className="block text-muted-foreground">/{order.command}</span></td><td data-label="Status" className="p-3"><WorkStatusBadge status={order.status} decision={order.decision}/></td></>}
 <td data-label="Petugas" className="p-3 text-xs">{order.ownerName||'Belum PICK'}</td>
 {tab!=='process'&&<td data-label="Waktu masuk" className="p-3 text-xs">{new Date(order.receivedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</td>}
 <td data-label="Pengerjaan" className="p-3 text-xs tabular-nums"><WorkTimer order={order} now={now}/>{tab!=='process'&&<FeedbackStatus feedback={order.feedback}/>}</td></tr>)}</tbody></table></div>}
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman {page}</span><div className="flex gap-2"><Button variant="outline" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><Button variant="outline" disabled={loading||!data?.hasMore||page>=10000} onClick={()=>setPage(p=>p+1)}>Berikutnya</Button></div></div>
 </Section>
 {selectedOrder&&<OrderWorkPanel id={selectedOrder} orders={data?.data||[]} onSelect={setSelectedOrder} onClose={closePanel} onChange={refresh}/>}
 <Link className="text-sm text-primary underline" to="/recap">Dashboard Rekap</Link>
 </>;
}
