import {useState, type MouseEvent} from 'react';
import OrderWorkPanel from './OrderWorkPanel';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import WorkStatusBadge from './WorkStatusBadge';
import { Search, SlidersHorizontal } from 'lucide-react';
import {Section,Empty} from '../operations/components';
import {jakartaToday} from '../tial/query';
import {useWorkData,useServerClock} from './hooks';
import {labels,ownsActiveOrder,type WorkList as Data} from './model';
import Actions from './Actions';
import People from './People';
import ExportButton from './ExportButton';
import OrderNotifications from './OrderNotifications';
import {FeedbackStatus,WorkTimer} from './OperationalStatus';
import {useEffect} from 'react';
import {useMyActiveWork} from './hooks';
import {confirmChatNavigation} from './unsent-chat';
import {useIncoming} from './use-incoming';
import {sortUnread} from './incoming-cursor';
import {HdNoteField,type HdNoteData} from './HdNote';
const field='mt-1 block w-full rounded-lg border bg-background p-2 text-sm';
export default function WorkList(){
 const [selectedOrder,setSelectedOrder]=useState<string|null>(null),[inlineWorkspace,setInlineWorkspace]=useState(false),[workspaceOpen,setWorkspaceOpen]=useState(false),[mySearch,setMySearch]=useState('');
 const {user}=useAuth();const location=useLocation();const workspace=location.pathname.split('/')[2]||'B2C';const area=workspace==='B2C'?(location.pathname.includes('LOGIC')?'LOGIC':'TIAL'):workspace;
 const [tab,setTab]=useState('incoming'),[command,setCommand]=useState(''),[mine,setMine]=useState(true),[from,setFrom]=useState(''),[to,setTo]=useState(''),[hd,setHd]=useState(''),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [debouncedSearch,setDebouncedSearch]=useState('');useEffect(()=>{if(search===debouncedSearch)return;const timer=setTimeout(()=>{setDebouncedSearch(search);setPage(1);},350);return()=>clearTimeout(timer);},[search,debouncedSearch]);
 const query={area,command,tab,mine:String(mine),from,to,hd,status,q:debouncedSearch.trim(),page:String(page)};const validDate=(!from&&!to)||(Boolean(from&&to)&&from<=to);
 const path='/orders?'+new URLSearchParams({...query,...(!validDate?{from:'',to:''}:{})});
 const {data,loading,error,arrival,refresh}=useWorkData<Data>(path,{area,page});const mineWork=useMyActiveWork(area,tab==='process'&&workspaceOpen&&inlineWorkspace);const now=useServerClock(data?.serverNow);
 const processWorkspaceVisible=tab==='process'&&workspaceOpen&&inlineWorkspace;
 const incoming=useIncoming(String(user?.id),area,import.meta.env.VITE_HDWORK2_LIVE_CHAT==='true'&&user?.username!=='trial_yanto'&&tab==='process');
 const tableOrders=tab==='process'?sortUnread(data?.data||[],incoming.isUnread):data?.data||[];
 const canReadNotes=user?.role==='HD'&&user.username!=='trial_yanto';
 const noteIds=(data?.data||[]).map(order=>order.id).join(',');
 const tableNotes=useWorkData<{data:HdNoteData[]}>('/order-notes?ids='+encodeURIComponent(noteIds),{area,enabled:Boolean(noteIds)&&canReadNotes});
 const notesById=new Map(tableNotes.data?.data.map(note=>[note.id,note]));
 const privateOrders=sortUnread(mineWork.data||[],incoming.isUnread).filter(order=>`${order.scIn||''} ${order.inetMasked||''} ${order.module} ${order.command}`.toLowerCase().includes(mySearch.trim().toLowerCase()));
 useEffect(()=>{if(inlineWorkspace&&selectedOrder&&mineWork.loaded&&!mineWork.data.some(order=>order.id===selectedOrder)){setSelectedOrder(null);}},[inlineWorkspace,selectedOrder,mineWork.loaded,mineWork.data]);
 function openOrder(event:MouseEvent<HTMLAnchorElement>,id:string){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();const row=data?.data.find(order=>order.id===id);setSelectedOrder(id);setInlineWorkspace(tab==='process'&&String(row?.ownerId)===String(user?.id));setWorkspaceOpen(true);
 }
 function closePanel(){const id=selectedOrder;setSelectedOrder(null);setWorkspaceOpen(false);setInlineWorkspace(false);requestAnimationFrame(()=>{const target=id?document.querySelector<HTMLAnchorElement>(`a[data-order-id="${CSS.escape(id)}"]`):null;(target||document.getElementById('operational-main'))?.focus();});}
 function selectPrivate(id:string){if(!confirmChatNavigation())return;setSelectedOrder(id);setInlineWorkspace(true);setWorkspaceOpen(true);}
 function change(fn:()=>void){setPage(1);fn();}
 return <>
 {!processWorkspaceVisible&&<>
 <nav aria-label="Status pekerjaan" className="op-work-tabs">{[['incoming','ORDER MASUK'],['duplicates','DUPLIKAT MENUNGGU'],['process','PROSES CEK'],['finished','SELESAI']].map(([v,label])=><Button key={v} aria-pressed={tab===v} variant={tab===v?'default':'ghost'} onClick={()=>change(()=>{setTab(v);setSelectedOrder(null);setWorkspaceOpen(false);setInlineWorkspace(false);setHd('');setMine(true);setFrom(v==='finished'?jakartaToday():'');setTo(v==='finished'?jakartaToday():'');setStatus('');})}>{label}</Button>)}</nav>
 <section aria-label="Filter pekerjaan" className="op-filter-bar">
 <label className="op-search"><Search aria-hidden="true"/><span className="sr-only">Cari SC/IN, INET/TELP atau STO</span><input aria-label="Pencarian pekerjaan" placeholder="Cari SC/IN, INET/TELP atau STO…" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <details className="op-advanced-filters"><summary><SlidersHorizontal aria-hidden="true"/>Filter lanjutan{Boolean(command||(tab==='process'?!mine:from||to||hd||status))&&<span className="op-filter-indicator">Aktif</span>}</summary><div className="op-filter-fields">

 {['TIAL','LOGIC'].includes(area)&&<label className="text-xs">Jenis perintah<select aria-label="Jenis perintah" className={field} value={command} onChange={e=>change(()=>setCommand(e.target.value))}><option value="">SEMUA</option>{(area==='TIAL'?[['order','TIAL'],['req','REQ']]:[['config_psb','LOGIC_PSB'],['mo','LOGIC_MO']]).filter(([,m])=>user?.modules?.includes(m)).map(([c])=><option key={c} value={c}>/{c==='mo'?'MO':c}</option>)}</select></label>}
 {tab!=='process'&&<><label className="text-xs">Tanggal order mulai WIB<input aria-label="Tanggal mulai" type="date" className={field} value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label><label className="text-xs">Sampai WIB<input aria-label="Tanggal akhir" type="date" className={field} value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label></>}
 {tab==='process'&&<label className="text-xs">Cakupan<select className={field} aria-label="Cakupan proses" value={String(mine)} onChange={e=>change(()=>{setMine(e.target.value==='true');setHd('');})}><option value="true">ORDER SAYA</option><option value="false">SEMUA ORDER</option></select></label>}
 {tab==='finished'&&<People value={hd} onChange={v=>change(()=>{setHd(v);if(v)setMine(false);})}/>}
 {tab==='finished'&&<><label className="text-xs">Status selesai<select aria-label="Status selesai" className={field} value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">SEMUA</option>{['DONE','FAILED','DUPLICATE'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label></>}
 {tab!=='process'&&<Button variant="ghost" onClick={()=>change(()=>{setFrom('');setTo('');setCommand('');setSearch('');setHd('');setStatus('');setMine(true);})}>Semua tanggal / reset filter</Button>}
 </div></details>
 {tab!=='process'&&(from||to)&&<p className="w-full text-xs text-muted-foreground">Tanggal order: {from||'…'} — {to||'…'} WIB</p>}
 </section>
 {!validDate&&<p role="alert">Isi rentang tanggal lengkap dan benar. Filter belum diterapkan.</p>}
 {arrival&&page>1&&<Button variant="outline" onClick={()=>setPage(1)}>Ada order baru</Button>}
 {user?.role!=='SHOW_ONLY'&&validDate&&search===debouncedSearch&&<ExportButton key={user?.id} query={query}/>}
 </>}
 {tab==='process'&&incoming.error&&<p role="status" className="text-xs">Indikator pesan belum berhasil diperbarui.</p>}
 {incoming.storageWarning&&<p role="status" className="text-xs">Status baca hanya tersimpan selama sesi ini karena penyimpanan browser tidak tersedia.</p>}
 <Section title={tab==='incoming'?'ORDER MASUK':tab==='duplicates'?'DUPLIKAT MENUNGGU':tab==='process'?'PROSES CEK':'SELESAI'} description="Data diperbarui otomatis · sesuai filter dan akses modul Anda." hideHeader={processWorkspaceVisible} className={processWorkspaceVisible?'op-process-workspace-card':''} contentClassName={processWorkspaceVisible?'op-process-workspace-card-content':''}>
 {processWorkspaceVisible?<div className="op-process-workspace" data-selected={Boolean(selectedOrder)}>
  <aside className="op-process-work-list" aria-label="Pekerjaan Saya"><header className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Pekerjaan Saya</h2><p className="text-xs text-muted-foreground">Order aktif milik Anda</p></div><Button variant="ghost" size="sm" onClick={closePanel}>Kembali ke tabel</Button></header><input aria-label="Cari pekerjaan saya" className="w-full rounded-lg border bg-background p-2 text-sm" placeholder="Cari order…" value={mySearch} onChange={event=>setMySearch(event.target.value)}/>
   {mineWork.loading&&!mineWork.data.length&&<p role="status" className="text-xs">Memuat pekerjaan…</p>}{mineWork.error&&<p role="alert" className="text-xs">{mineWork.error}<Button variant="outline" onClick={()=>void mineWork.refresh()}>Coba lagi</Button></p>}
   <ul className="op-process-work-items">{privateOrders.map(order=><li key={order.id}><button type="button" data-selected={selectedOrder===order.id} aria-current={selectedOrder===order.id?'true':undefined} onClick={()=>selectPrivate(order.id)}><span className="block break-all font-medium">{order.scIn||order.inetMasked||'Order /'+order.command}</span>{incoming.isUnread(order.id)&&<span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">PESAN BARU</span>}<span className="mt-1 block text-xs text-muted-foreground">{order.module} /{order.command} · <WorkTimer order={order} now={now}/></span></button></li>)}</ul>
   {!mineWork.loading&&!mineWork.error&&!privateOrders.length&&<Empty text={mySearch?'Tidak ada order yang cocok.':'Tidak ada pekerjaan aktif.'}/>}
  </aside>
  {selectedOrder?<OrderWorkPanel embedded id={selectedOrder} orders={mineWork.data} onSelect={selectPrivate} onClose={closePanel} onMobileBack={()=>setSelectedOrder(null)} onChange={async()=>{await Promise.all([refresh(),mineWork.refresh()]);}}/>:<div className="op-process-work-empty"><p>Pilih pekerjaan untuk melihat detail.</p><Button variant="outline" onClick={closePanel}>Kembali ke tabel PROSES CEK</Button></div>}
 </div>:<>
 {loading&&<p role="status" className="mb-2 text-xs text-muted-foreground">{data?'Memperbarui data…':'Memuat pekerjaan…'}</p>}{error&&<div role="alert" className="mb-3 text-sm"><p>{error}</p>{data&&<p>Data terakhir belum berhasil diperbarui.</p>}<Button variant="outline" onClick={()=>void refresh()}>Coba lagi</Button></div>}
 {data&&!data.data.length?<Empty text="Tidak ada pekerjaan sesuai filter."/>:data&&<div className="op-order-table-wrap"><table data-process={tab==='process'} className="op-order-table w-full text-left text-sm"><caption className="sr-only">Daftar pekerjaan {area}</caption>
 <thead className="border-b text-xs text-muted-foreground"><tr>{(tab==='process'?(mine?['Identifier Order','Kategori','Durasi']:['Identifier Order','Kategori','Petugas','Durasi','Aksi']):['Identifier order','Kategori','Status','Petugas','Waktu masuk','Pengerjaan']).concat(canReadNotes?['CATATAN HD']:[]).map(label=><th key={label} scope="col" className="p-2 font-medium">{label}</th>)}</tr></thead>
 <tbody>{tableOrders.map(order=>{
  const inProcess=tab==='process';
  const editable=inProcess&&!error&&ownsActiveOrder(order,user?.id);
  const purpose=inProcess&&order.command==='config_psb'?order.purpose?.trim():undefined;
  const note=notesById.get(order.id);
  return <tr key={order.id} data-selected={selectedOrder===order.id} className="border-b last:border-0 hover:bg-muted/40">
 <td className="p-2 align-top">
  <div className={inProcess?'grid min-w-0 gap-2 lg:grid-cols-2 lg:gap-4':undefined}>
   <div className="min-w-0">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
     <Link data-order-id={order.id} aria-haspopup={inProcess&&String(order.ownerId)===String(user?.id)?undefined:'dialog'} className="max-w-full break-all font-medium text-primary underline" to={`/orders/${order.id}`} onClick={event=>openOrder(event,order.id)}>{order.scIn||order.inetMasked||'Order /'+order.command}</Link>
     {incoming.isUnread(order.id)&&<span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">PESAN BARU</span>}
     {validDate&&!inProcess&&<Actions key={`${user?.id}:${order.id}`} compact order={order} refresh={refresh}/>}
    </div>
    {inProcess?order.inetMasked&&<p className="mt-1 text-xs text-muted-foreground">INET/TELP: <span className="tabular-nums">{order.inetMasked}</span></p>:<p className="mt-1 text-[10px] text-muted-foreground">SC/IN: {order.scIn||'—'} &middot; INET: {order.inetMasked||'—'}</p>}
   </div>
   {purpose&&<dl className="min-w-0 text-xs"><dt className="font-medium text-muted-foreground">Keperluan</dt><dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{purpose}</dd></dl>}
  </div>
 </td>
 {tab==='process'?<><td data-label="Kategori" className="p-2 text-xs">{order.module}<span className="block text-muted-foreground">/{order.command}</span></td>{!mine&&<td data-label="Petugas" className="p-2 text-xs">{order.ownerName||'Belum PICK'}</td>}<td data-label="Durasi" className="p-2 text-xs tabular-nums"><WorkTimer order={order} now={now}/></td>{!mine&&<td data-label="Aksi" className="p-2"><Actions key={`${user?.id}:${order.id}`} compact takeoverOnly order={order} refresh={refresh}/></td>}</>:<><td data-label="Kategori" className="p-3 text-xs">{order.module}<span className="block text-muted-foreground">/{order.command}</span></td><td data-label="Status" className="p-3"><WorkStatusBadge status={order.status} decision={order.decision}/></td><td data-label="Petugas" className="p-3 text-xs">{order.ownerName||'Belum PICK'}</td><td data-label="Waktu masuk" className="p-3 text-xs">{new Date(order.receivedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</td><td data-label="Pengerjaan" className="p-3 text-xs tabular-nums"><WorkTimer order={order} now={now}/><FeedbackStatus feedback={order.feedback}/></td></>}{canReadNotes&&<td data-label="CATATAN HD" className="max-w-64 p-2 align-top text-xs max-sm:col-span-full max-sm:max-w-none">
 {inProcess?<HdNoteField key={`${user?.id}:${editable}`} id={order.id} note={note} editable={editable} readError={tableNotes.error} refresh={()=>{void tableNotes.refresh();void refresh();}}/>:<p className="line-clamp-2 whitespace-pre-wrap break-words" title={note?.text}>{tableNotes.error?'Catatan belum tersedia':note?.text||'—'}</p>}
 </td>}</tr>;})}</tbody></table></div>}
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman {page}</span><div className="flex gap-2"><Button variant="outline" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><Button variant="outline" disabled={loading||!data?.hasMore||page>=10000} onClick={()=>setPage(p=>p+1)}>Berikutnya</Button></div></div>
 </>}
 </Section>
 {!processWorkspaceVisible&&<OrderNotifications area={area} showSoundControl={false}/>}
 {selectedOrder&&!inlineWorkspace&&<OrderWorkPanel id={selectedOrder} orders={data?.data||[]} onSelect={setSelectedOrder} onClose={closePanel} onChange={refresh}/>}
 {!processWorkspaceVisible&&<Link className="text-sm text-primary underline" to="/recap">Dashboard Rekap</Link>}
 </>;
}
