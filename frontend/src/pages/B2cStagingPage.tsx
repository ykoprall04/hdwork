import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { fetchStagingOrders, type StagingFilters, type StagingModule, type StagingResult } from '@/features/b2c-staging/api';

export default function B2cStagingPage() {
  const { token, user } = useAuth();
  const [filters, setFilters] = useState<StagingFilters>({ module: 'TIAL', date: '', status: '', sto: '', q: '', page: 1 });
  const [result, setResult] = useState<StagingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function change(next: Partial<StagingFilters>) {
    request.current?.abort(); setLoading(false); setError(''); setResult(null);
    setFilters(previous => ({ ...previous, ...next, page: 1 }));
  }
  async function load(page = 1) {
    if (!token) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setResult(null);
    try { const data = await fetchStagingOrders(token, { ...filters, page }, controller.signal); if (!controller.signal.aborted) setResult(data); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Gagal membaca staging'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  if (user?.role !== 'SUPER_ADMIN') return <p role="alert">Akses staging sementara terbatas untuk Super Admin.</p>;
  const field = 'rounded-md border bg-background px-3 py-2 text-sm';
  return <section className="space-y-5">
    <header><p className="text-xs font-semibold text-primary">B2C / MYSQL STAGING / READ-ONLY</p><h1 className="mt-2 text-2xl font-semibold">Pratinjau integrasi order B2C</h1><p className="mt-2 text-sm text-muted-foreground">Data staging terpisah dari DEMO. Tidak ada PICK, penyelesaian, atau pengiriman Telegram.</p><Link className="text-sm underline" to="/dashboard">Kembali ke dashboard</Link></header>
    <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => { event.preventDefault(); void load(); }}>
      <label className="grid gap-1 text-sm">Modul<select className={field} value={filters.module} onChange={event => change({ module: event.target.value as StagingModule })}><option value="TIAL">TIAL — Orders</option><option value="LOGIC_PSB">LOGIC PSB — solver</option><option value="LOGIC_MO">LOGIC MO — MO</option></select></label>
      <label className="grid gap-1 text-sm">Tanggal {filters.module === 'TIAL' ? 'impor' : 'order'} (Asia/Jakarta)<input type="date" className={field} value={filters.date} onChange={event => change({ date: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Status sumber<input maxLength={64} className={field} value={filters.status} onChange={event => change({ status: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">STO<input maxLength={64} className={field} value={filters.sto} onChange={event => change({ sto: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">SC/IN atau INET<input maxLength={100} className={field} value={filters.q} onChange={event => change({ q: event.target.value })} /></label>
      <Button className="self-end" disabled={loading} type="submit">{loading ? 'Memuat…' : 'Baca staging'}</Button>
    </form>
    {loading && <p role="status">Memuat data staging…</p>}
    {error && <p role="alert" className="rounded-md border p-4">{error} Data demo tidak digunakan sebagai pengganti.</p>}
    {!result && !loading && !error && <p className="text-sm text-muted-foreground">Pilih filter lalu tekan Baca staging. Belum ada koneksi yang diminta.</p>}
    {result && <><p className="text-sm">Sumber: MySQL staging · Halaman {result.page}{filters.module === 'TIAL' && ' · ID baris staging, bukan identitas bisnis permanen · Tanggal impor, bukan tanggal order'}</p>{result.data.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr>{['ID staging', 'Modul', 'Tanggal', 'Status', 'STO', 'SC/IN', 'INET', 'Referensi Telegram'].map(title => <th className="p-3" key={title}>{title}</th>)}</tr></thead><tbody>{result.data.map(order => <tr className="border-t" key={order.id}><td className="p-3" title={order.id}>{order.id.slice(0, 16)}…</td>{[order.module, order.date, order.status, order.sto, order.scIn, order.inet].map((value, index) => <td className="p-3" key={index}>{value || '—'}</td>)}<td className="p-3"><span>Belum diverifikasi</span><span className="block text-xs text-muted-foreground">Topik belum diketahui</span></td></tr>)}</tbody></table></div> : <p role="status">Tidak ada order sesuai filter.</p>}<div className="flex gap-3"><Button disabled={loading || result.page <= 1} onClick={() => void load(result.page - 1)}>Sebelumnya</Button><Button disabled={loading || !result.hasMore} onClick={() => void load(result.page + 1)}>Berikutnya</Button></div></>}
  </section>;
}
