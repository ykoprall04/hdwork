import {cookieMode} from '../operational/cookie-http';
import { useEffect, useRef, useState } from 'react';
import {useLocation} from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import TialTable from './TialTable';
import { reconcileOrders, type OrderResult } from '../b2c-orders/model';
import { orderApi } from '../b2c-orders/api';
import { Empty, Metric, Section } from '../operations/components';
import { useLocalCheckIn } from '../operational/local-status';
import { startRefreshLoop } from '../b2c-staging/refresh-loop';
import { jakartaToday, tialQuery, tialTabs, type TialFilters } from './query';
const field = 'mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground';
export default function TialOrdersPage() {
  const { token, user } = useAuth(); const local = useLocalCheckIn();
  const location=useLocation();
  const [module,setModule]=useState(()=>cookieMode?(location.pathname.endsWith('/REQ')?'REQ':location.pathname.endsWith('/LOGIC')?(user?.modules?.find(m=>m.startsWith('LOGIC'))||'LOGIC_PSB'):(user?.modules?.[0]||'TIAL')):'TIAL');
  const allowed=!cookieMode ? user?.role==='SUPER_ADMIN' : Boolean(user?.modules?.includes(module));
  const [filters, setFilters] = useState<TialFilters>(() => ({ date: jakartaToday(), status: '', sto: '', q: '' }));
  const [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [stoAvailable, setStoAvailable] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const queryKey = JSON.stringify({...tialQuery(filters, page, stoAvailable),module:cookieMode?module:'TIAL'});
  const scope = useRef('');
  function change(next: Partial<TialFilters>) {
    const value = { ...filters, ...next };
    if (JSON.stringify({...tialQuery(value, 1, stoAvailable),module:cookieMode?module:'TIAL'}) !== queryKey) {
      request.current?.abort(); setResult(null); setError(''); setAccessDenied(false); setUpdated(null);
    }
    setPage(1); setFilters(value);
  }

  useEffect(() => {
    if (!token || !allowed) return;
    const nextScope = `${token}\n${queryKey}`;
    if (scope.current !== nextScope) { setResult(null); setError(''); setAccessDenied(false); setUpdated(null); scope.current = nextScope; }
    const controller = new AbortController(); request.current = controller;
    let stop = () => {};
    // Debounce filter edits and cancel old page requests; never mix result sets.
    const debounce = setTimeout(() => {
      stop = startRefreshLoop(async () => {
        if (controller.signal.aborted) return;
        setLoading(true);
        try {
          const data = await orderApi.list(token, JSON.parse(queryKey), controller.signal);
          if (!controller.signal.aborted) { setResult(previous => reconcileOrders(previous, data)); setError(''); setAccessDenied(false); setStoAvailable(false); setUpdated(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })); }
        } catch (cause) {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : 'Gagal membaca order TIAL');
            if ([401, 403].includes((cause as { status?: number }).status || 0)) { setResult(null); setUpdated(null); setAccessDenied(true); stop(); }
          }
        }
        finally { if (!controller.signal.aborted) setLoading(false); }
      });
    }, 350);
    return () => { clearTimeout(debounce); stop(); controller.abort(); };
  }, [token, user?.role, allowed, queryKey, reload]);
  function navigatePage(next: number) { request.current?.abort(); setResult(null); setUpdated(null); setPage(next); }
  return <>
    <header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / B2C / TIAL</p><h1 className="mt-2 text-3xl font-semibold">{cookieMode?`Daftar pekerjaan ${module}`:'Daftar order TIAL'}</h1><p className="mt-2 text-sm text-muted-foreground">Sumber hdwork2 / hd2_orders · read-only · bukan staging hd_b2c. Tidak ada tindakan order atau pengiriman Telegram.</p></header>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">Status Anda: <strong>{local.status}</strong> · lokal, belum tersinkronisasi. PICK/CEK/RECEK/DONE/GAGAL tetap nonaktif.</div>
    {cookieMode && <label>Modul<select aria-label="Modul pekerjaan" className={field} value={module} onChange={e=>{request.current?.abort();setResult(null);setPage(1);setModule(e.target.value);}}><option value="TIAL" disabled={!user?.modules?.includes('TIAL')}>TIAL</option>{user?.modules?.filter(m=>m!=='TIAL').map(m=><option key={m}>{m}</option>)}</select></label>}
    <nav aria-label="Filter cepat order" className="flex gap-2 overflow-x-auto">{tialTabs.map(tab => <button key={tab} onClick={() => change({ status: ({ MENUNGGU: 'WAITING', 'PROSES CEK': 'IN_PROGRESS', SELESAI: 'FINISHED', DUPLICATE: 'DUPLICATE' })[tab] })} className="shrink-0 rounded-lg border bg-card px-4 py-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70">{tab}</button>)}</nav>
    <p className="text-xs text-muted-foreground">Tab memfilter status workflow server. Jumlah global per status belum tersedia.</p>
    <section aria-label="Filter order" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs">Status<select aria-label="Status order" className={field} value={filters.status} onChange={event => change({ status: event.target.value })}>{[['','Semua status'],['WAITING','MENUNGGU'],['IN_PROGRESS','PROSES CEK'],['FINISHED','SELESAI'],['DONE','DONE'],['FAILED','GAGAL'],['DUPLICATE','DUPLICATE']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs">Tanggal order WIB<input aria-label="Tanggal order" type="date" className={field} value={filters.date} onChange={event => change({ date: event.target.value })} /></label>
      <label className="text-xs">STO<input aria-label="STO" disabled={!stoAvailable} maxLength={64} className={field} value={filters.sto} placeholder={stoAvailable ? 'Semua STO' : 'Belum tersedia · belum disimpan'} onChange={event => change({ sto: event.target.value })} /></label>
      <label className="text-xs">Cari SC/IN atau INET<input aria-label="Cari order" maxLength={100} className={field} value={filters.q} placeholder="SC/IN atau INET" onChange={event => change({ q: event.target.value })} /></label>
      <Button variant="ghost" onClick={() => change({ date: jakartaToday(), status: '', sto: '', q: '' })}>Reset filter</Button>
    </section>
    <p className="text-xs text-muted-foreground">Tanggal adalah hari bisnis dari timestamp pesan Telegram (Asia/Jakarta), bukan tanggal impor staging. Kosongkan untuk semua tanggal. Identifier UUID berasal dari hdwork2; INET disamarkan.</p>
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{['Total order', 'MENUNGGU', 'PROSES CEK', 'DONE', 'GAGAL', 'DUPLICATE'].map(label => <Metric key={label} label={label} value="Belum tersedia" detail="API belum menyediakan agregasi global" />)}</div>
    <Section title="Daftar order TIAL" description="Terbaru menurut waktu diterima sistem · read-only · STO belum tersedia dalam skema.">
      {!allowed ? <Empty text={cookieMode?"Anda belum memiliki akses modul ini.":"Akses TIAL sementara terbatas untuk Super Admin."} /> : <><div role="status" aria-live="polite" className="mb-3 min-h-4 text-xs text-muted-foreground">{loading && result ? "Memperbarui order TIAL… data terakhir tetap ditampilkan." : null}</div>{error && <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>{error}</p><p className="text-muted-foreground">{result ? "Data terakhir belum berhasil diperbarui; jangan anggap sebagai data terkini." : "Data tidak diganti DEMO."} {accessDenied ? "Akses ditolak; pembaruan otomatis dihentikan sampai akses diperiksa kembali." : "Refresh otomatis akan mencoba kembali sekitar 60 detik."}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Coba lagi</Button></div>}{!result && !error ? <p role="status" className="p-6 text-sm text-muted-foreground">Memuat order TIAL…</p> : result && !result.data.length ? <Empty text="Tidak ada order TIAL sesuai filter." /> : result ? <TialTable orders={result.data} /> : null}</>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman {page} · total global belum tersedia{updated && ` · terakhir berhasil ${updated} WIB`} · refresh sekitar 60 detik</span><div className="flex gap-2"><Button variant="outline" disabled={loading || !result || page <= 1} onClick={() => navigatePage(page - 1)}>Sebelumnya</Button><Button variant="outline" disabled={loading || !result?.hasMore} onClick={() => navigatePage(page + 1)}>Berikutnya</Button></div></div>
    </Section>
    {!cookieMode && <Link className="text-xs text-muted-foreground underline" to="/b2c/staging">Alat diagnostik staging</Link>}
  </>;
}
