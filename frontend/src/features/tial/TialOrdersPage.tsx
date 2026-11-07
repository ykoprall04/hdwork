import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Empty, Metric, Section } from '../operations/components';
import { useLocalCheckIn } from '../operational/local-status';
import { fetchStagingOrders, type StagingResult } from '../b2c-staging/api';
import { startRefreshLoop } from '../b2c-staging/refresh-loop';
import { jakartaToday, tialQuery, tialTabs, type TialFilters } from './query';
const field = 'mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground';
export default function TialOrdersPage() {
  const { token, user } = useAuth(); const local = useLocalCheckIn();
  const [filters, setFilters] = useState<TialFilters>(() => ({ date: jakartaToday(), status: '', sto: '', q: '' }));
  const [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [result, setResult] = useState<StagingResult | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [stoAvailable, setStoAvailable] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const capability = useRef(false);
  function change(next: Partial<TialFilters>) {
    request.current?.abort(); setResult(null); setError(''); setUpdated(null); setPage(1);
    setFilters(previous => ({ ...previous, ...next }));
  }
  useEffect(() => {
    if (!token || user?.role !== 'SUPER_ADMIN') return;
    const controller = new AbortController(); request.current = controller;
    let stop = () => {};
    // Debounce filter edits and cancel old page requests; never mix result sets.
    const debounce = setTimeout(() => {
      stop = startRefreshLoop(async () => {
        if (controller.signal.aborted) return;
        setLoading(true); setError(''); setResult(null); setUpdated(null);
        try {
          const data = await fetchStagingOrders(token, tialQuery(filters, page, capability.current), controller.signal);
          if (!controller.signal.aborted) { setResult(data); capability.current = data.stoFilterAvailable === true; setStoAvailable(capability.current); setUpdated(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })); }
        } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Gagal membaca order TIAL'); }
        finally { if (!controller.signal.aborted) setLoading(false); }
      });
    }, 350);
    return () => { clearTimeout(debounce); stop(); controller.abort(); };
  }, [token, user?.role, filters, page, reload]);
  function navigatePage(next: number) { request.current?.abort(); setResult(null); setUpdated(null); setPage(next); }
  return <>
    <header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / B2C / TIAL</p><h1 className="mt-2 text-3xl font-semibold">Daftar order TIAL</h1><p className="mt-2 text-sm text-muted-foreground">Data sumber MySQL · read-only. Tidak ada tindakan order atau pengiriman Telegram.</p></header>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">Status Anda: <strong>{local.status}</strong> · lokal, belum tersinkronisasi. PICK/CEK/RECEK/DONE/GAGAL tetap nonaktif.</div>
    <nav aria-label="Filter cepat order" className="flex gap-2 overflow-x-auto">{tialTabs.map(tab => <button key={tab} disabled title="Mapping status sumber belum diverifikasi" className="shrink-0 rounded-lg border bg-card px-4 py-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70">{tab}<span className="ml-2 opacity-70">Belum tersedia</span></button>)}</nav>
    <p className="text-xs text-muted-foreground">Tab dan jumlah per status belum tersedia sampai mapping sumber disetujui. Daftar di bawah memakai filter status sumber, bukan pengelompokan tab.</p>
    <section aria-label="Filter order" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs">Status sumber<input aria-label="Status order" maxLength={64} className={field} value={filters.status} placeholder="Semua status sumber" onChange={event => change({ status: event.target.value })} /></label>
      <label className="text-xs">Tanggal impor WIB<input aria-label="Tanggal impor" type="date" className={field} value={filters.date} onChange={event => change({ date: event.target.value })} /></label>
      <label className="text-xs">STO<input aria-label="STO" disabled={!stoAvailable} maxLength={64} className={field} value={filters.sto} placeholder={stoAvailable ? 'Semua STO' : 'Belum tersedia · mapping STO'} onChange={event => change({ sto: event.target.value })} /></label>
      <label className="text-xs">Cari SC/IN atau INET<input aria-label="Cari order" maxLength={100} className={field} value={filters.q} placeholder="SC/IN atau INET sumber" onChange={event => change({ q: event.target.value })} /></label>
      <Button variant="ghost" onClick={() => change({ date: jakartaToday(), status: '', sto: '', q: '' })}>Reset filter</Button>
    </section>
    <p className="text-xs text-muted-foreground">Tanggal adalah tanggal impor MySQL (Asia/Jakarta), bukan tanggal order asli. Kosongkan untuk semua tanggal. ID hanya identitas baris staging, belum permanen.</p>
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{['Total order', 'MENUNGGU', 'PROSES CEK', 'DONE', 'GAGAL', 'DUPLICATE'].map(label => <Metric key={label} label={label} value="Belum tersedia" detail="API belum menyediakan agregasi global" />)}</div>
    <Section title="Daftar order TIAL" description="Terbaru menurut waktu impor · read-only · status dan STO ditampilkan sesuai sumber.">
      {user?.role !== 'SUPER_ADMIN' ? <Empty text="Akses TIAL sementara terbatas untuk Super Admin." /> : error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>{error}</p><p className="text-muted-foreground">Data tidak diganti DEMO. Refresh otomatis akan mencoba kembali sekitar 60 detik.</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Coba lagi</Button></div> : loading || !result ? <p role="status" className="p-6 text-sm text-muted-foreground">Memuat order TIAL…</p> : !result.data.length ? <Empty text="Tidak ada order TIAL sesuai filter sumber." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Daftar order TIAL read-only</caption><thead className="border-b text-xs text-muted-foreground"><tr>{['Identifier staging', 'Kategori', 'Status sumber', 'Petugas', 'Waktu tunggu', 'Pengerjaan'].map(label => <th scope="col" key={label} className="px-2 pb-3 font-medium">{label}</th>)}</tr></thead><tbody>{result.data.map(order => <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40"><td className="p-3"><span className="font-medium text-primary" title={order.id}>{order.id.slice(0, 20)}…</span><p className="mt-1 text-[11px] text-muted-foreground">Impor WIB: {order.date || 'Belum tersedia'}</p><p className="mt-1 text-[10px] text-muted-foreground">SC/IN: {order.scIn || 'Belum tersedia'} · INET: {order.inet || 'Belum tersedia'} · STO: {order.sto || 'Belum tersedia'}</p></td><td className="p-3 text-xs">B2C<span className="mt-1 block text-[10px] text-muted-foreground">TIAL</span></td><td className="p-3"><Badge variant="outline">{order.status || 'Belum tersedia'}</Badge></td>{['Petugas', 'Waktu tunggu', 'Pengerjaan'].map(label => <td key={label} className="p-3 text-xs text-muted-foreground">Belum tersedia</td>)}</tr>)}</tbody></table></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">Halaman {page} · total global belum tersedia{updated && ` · diperbarui ${updated} WIB`} · refresh sekitar 60 detik</span><div className="flex gap-2"><Button variant="outline" disabled={loading || !result || page <= 1} onClick={() => navigatePage(page - 1)}>Sebelumnya</Button><Button variant="outline" disabled={loading || !result?.hasMore} onClick={() => navigatePage(page + 1)}>Berikutnya</Button></div></div>
    </Section>
    <Link className="text-xs text-muted-foreground underline" to="/b2c/staging">Alat diagnostik staging</Link>
  </>;
}
