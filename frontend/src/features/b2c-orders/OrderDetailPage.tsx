import {cookieMode} from '../operational/cookie-http';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Section, Empty } from '../operations/components';
import { orderApi } from './api';
import { statusLabels, type OrderDetail, type StatusHistory } from './model';
const time = (value: string | null) => value ? new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB' : 'Belum tersedia';
export default function OrderDetailPage() {
  const { id='' }=useParams();
  return <OrderDetailContent key={id} id={id} />;
}
function OrderDetailContent({id}: {id:string}) {
  const {token,user}=useAuth();
  const [detail,setDetail]=useState<OrderDetail|null>(null),[history,setHistory]=useState<StatusHistory|null>(null);
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    if (!token || (!cookieMode && user?.role!=='SUPER_ADMIN')) return;
    const controller=new AbortController();
    async function load() {
      // Keep state updates in the asynchronous request lifecycle.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);setError('');setHistory(null);
      try {
        const [order,events]=await Promise.all([orderApi.detail(token!,id,controller.signal),orderApi.history(token!,id,page,controller.signal)]);
        if (!controller.signal.aborted) {setDetail(order);setHistory(events);}
      } catch (cause) {
        if (!controller.signal.aborted) {setDetail(null);setError(cause instanceof Error ? cause.message : 'Tidak dapat membaca order.');}
      } finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();
    return ()=>controller.abort();
  },[id,token,user?.role,page,retry]);
  return <>
    <header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / B2C / DETAIL</p><h1 className="mt-2 text-3xl font-semibold">Detail Order</h1><p className="mt-2 text-sm text-muted-foreground">Sumber hdwork2 · read-only · terpisah dari staging hd_b2c.</p></header>
    <Link className="text-sm text-primary underline" to="/work/B2C/TIAL">Kembali ke daftar TIAL</Link>
    {(!cookieMode && user?.role!=='SUPER_ADMIN') ? <Empty text="Akses order sementara terbatas untuk Super Admin."/> : error ? <div role="alert" className="space-y-3 rounded-xl border bg-card p-4"><p>{error}</p><Button onClick={()=>setRetry(n=>n+1)}>Coba lagi</Button></div> : loading ? <p role="status">Memuat detail dan riwayat order…</p> : detail && <>
      <Section title={detail.data.scIn || 'Order B2C'} description={`Identifier order: ${detail.data.id}`}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Modul / Status</dt><dd>{detail.data.module}{detail.data.command ? ` /${detail.data.command}` : ''} · {statusLabels[detail.data.status]}</dd></div><div><dt className="text-muted-foreground">INET tersamar</dt><dd>{detail.data.inetMasked || 'Belum tersedia'}</dd></div><div><dt className="text-muted-foreground">Tanggal order WIB</dt><dd>{detail.data.date}</dd></div><div><dt className="text-muted-foreground">Diterima sistem</dt><dd>{time(detail.data.receivedAt)}</dd></div><div><dt className="text-muted-foreground">Mulai pengecekan</dt><dd>{time(detail.data.startedAt)}</dd></div><div><dt className="text-muted-foreground">Selesai</dt><dd>{time(detail.data.finishedAt)}</dd></div></dl>
        <p className="mt-4 text-xs text-muted-foreground">Petugas, STO, isi pesan, dan lampiran belum tersedia dalam kontrak web aman ini. Tanggal order berasal dari hari bisnis Telegram; waktu diterima sistem bukan waktu pesan Telegram asli.</p>
      </Section>
      {detail.previous && <Section title="Order sebelumnya" description="Duplikat bisnis sepanjang riwayat."><Link className="text-primary underline" to={`/orders/${detail.previous.id}`}>{detail.previous.id}</Link><p>{statusLabels[detail.previous.status]} · HD: {detail.previous.hd}</p><p className="mt-2 text-xs text-muted-foreground">Lanjut Cek / Tolak Duplikat belum tersedia; memerlukan otorisasi dan audit server. Tidak ada aksi yang diaktifkan.</p></Section>}
      <Section title="Riwayat status" description="Perubahan yang dicatat server · data sensitif audit tidak ditampilkan.">
        {!history?.data.length ? <Empty text="Belum ada riwayat status."/> : <ol className="divide-y">{history.data.map(event=><li key={event.id} className="py-3 text-sm"><p>{event.fromStatus ? statusLabels[event.fromStatus]+' → ' : ''}{event.toStatus ? statusLabels[event.toStatus] : 'Perubahan status'}</p><time className="text-xs text-muted-foreground">{time(event.at)}</time></li>)}</ol>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman riwayat {page}</span><div className="flex gap-2"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Riwayat sebelumnya</Button><Button variant="outline" disabled={!history?.hasMore} onClick={()=>setPage(n=>n+1)}>Riwayat berikutnya</Button></div></div>
      </Section>
      <Section title="Tindakan order" description="Belum tersedia. PICK / CEK / RECEK / DONE / GAGAL belum diaktifkan di web."><p className="text-sm text-muted-foreground">Halaman ini hanya membaca order dan riwayat. Tidak ada pengiriman Telegram.</p></Section>
    </>}
  </>;
}
