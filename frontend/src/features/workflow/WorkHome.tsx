import {Link} from 'react-router-dom';
import {ArrowUpRight,ClipboardList,Clock3,CircleCheck,CircleX,Timer,ListTodo} from 'lucide-react';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import PageHeader from '../workspace-ui/PageHeader';
import {useWorkData} from './hooks';
import OrderNotifications from './OrderNotifications';
import {formatAverage} from './statistics';
import {canOpenWorkspace} from './workspace-access';
type Counts={averageDurationSeconds:number;total:number;waiting:number;process:number;done:number;failed:number};
const metrics=[['total','TOTAL ORDER MASUK',ClipboardList],['waiting','BELUM PICK',Clock3],['process','PROSES CEK',ListTodo],['done','DONE',CircleCheck],['failed','GAGAL',CircleX],['averageDurationSeconds','RATA-RATA PENGERJAAN',Timer]] as const;
export default function WorkHome(){
 const {user}=useAuth();const areas=(['TIAL','LOGIC'] as const).filter(area=>canOpenWorkspace(area,user?.modules));
 const {data,loading,error,refresh}=useWorkData<{all:Counts;TIAL:Counts;LOGIC:Counts}>('/overview');
 return <>
 <PageHeader eyebrow="Ruang kerja · B2C" title="Dashboard Pekerjaan" description="Pantau antrean dan buka pekerjaan sesuai akses modul Anda." actions={<Button variant="outline" nativeButton={false} render={<Link to="/recap"/>}>Dashboard Rekap<ArrowUpRight/></Button>}/>
 {error&&<div role="alert" className="op-error"><p>{error}</p>{data&&<p>Data terakhir belum berhasil diperbarui.</p>}<Button variant="outline" onClick={()=>void refresh()}>Coba lagi</Button></div>}
 {loading&&!data&&<p role="status" className="text-xs text-muted-foreground">Memuat ringkasan pekerjaan…</p>}
 <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Status terbaru · seluruh tanggal</p><OrderNotifications area="B2C"/></div>
 <div className="op-dashboard-metrics">{metrics.map(([key,label,Icon])=><section key={key} className="op-dashboard-metric" data-metric={key}><div className="flex items-center justify-between gap-2"><h2>{label}</h2><Icon aria-hidden="true"/></div><p>{data?key==='averageDurationSeconds'?formatAverage(data.all[key]):data.all[key]:'—'}</p><small>{key==='averageDurationSeconds'?'Rata-rata durasi pengerjaan':'Dalam cakupan modul Anda'}</small></section>)}</div>
 <div className="grid gap-4 lg:grid-cols-2">{areas.map(area=><section key={area} className="op-queue-card"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Antrean pekerjaan</p><h2 className="mt-2 text-xl font-semibold">{area==='TIAL'?'TIAL / REQ':'LOGIC / SOLVER'}</h2></div><span className="op-queue-icon"><ClipboardList aria-hidden="true"/></span></div><dl className="my-6 grid grid-cols-3 gap-3">{([['total','Total'],['waiting','Menunggu'],['process','Proses']] as const).map(([key,label])=><div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{data?data[area][key]:'—'}</dd></div>)}</dl><Button nativeButton={false} className="min-h-11 w-full justify-between" variant="outline" render={<Link to={`/work/B2C/${area}`}/>}>Buka antrean {area}<ArrowUpRight/></Button></section>)}</div>
 </>;
}
