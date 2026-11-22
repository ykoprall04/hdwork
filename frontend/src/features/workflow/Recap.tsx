import { lazy, Suspense, useId, useState } from 'react';
import { ArrowRight, ChartNoAxesCombined, List, CalendarX, CircleCheck, CircleX, Clock3, Inbox, SearchCheck, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '../workspace-ui/PageHeader';
import ExportButton from './ExportButton';
import { useWorkData } from './hooks';
import People from './People';
import { formatAverage } from './statistics';

type RecapMetrics = {
  total: number;
  waiting: number;
  process: number;
  done: number;
  failed: number;
  averageDurationSeconds: number;
};

const statuses = [
  { key: 'waiting', label: 'BELUM PICK', icon: Clock3, color: 'text-amber-700 dark:text-amber-300' },
  { key: 'process', label: 'PROSES CEK', icon: SearchCheck, color: 'text-primary' },
  { key: 'done', label: 'DONE', icon: CircleCheck, color: 'text-emerald-700 dark:text-emerald-300' },
  { key: 'failed', label: 'GAGAL', icon: CircleX, color: 'text-destructive' },
] as const;

const field = 'mt-1.5 block h-11 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm';

const RecapChart = lazy(() => import('./RecapChart'));

export default function Recap() {
  const [tab, setTab] = useState<'orders' | 'chart'>('orders');

  return (
    <>
      <PageHeader title="Dashboard Rekap" description="Status terbaru berdasarkan tanggal order diterima (WIB)." />
      <div role="group" aria-label="Tampilan Dashboard Rekap" className="inline-flex w-fit max-w-full gap-1 rounded-xl border bg-card p-1">
        <Button aria-pressed={tab === 'orders'} variant={tab === 'orders' ? 'default' : 'ghost'} onClick={() => setTab('orders')}>
          <List aria-hidden /> Rekap Order
        </Button>
        <Button aria-pressed={tab === 'chart'} variant={tab === 'chart' ? 'default' : 'ghost'} onClick={() => setTab('chart')}>
          <ChartNoAxesCombined aria-hidden /> Grafik
        </Button>
      </div>
      <div hidden={tab !== 'orders'} className={tab === 'orders' ? 'min-w-0 space-y-5' : undefined}>
        <RecapOrders />
      </div>
      {tab === 'chart' && (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Memuat tab Grafik…</p>}>
          <RecapChart />
        </Suspense>
      )}
    </>
  );
}

function RecapOrders() {
  const { user } = useAuth();
  const [area, setArea] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hd, setHd] = useState('');
  const dateErrorId = useId();
  const valid = (!from && !to) || Boolean(from && to && from <= to);
  const query = new URLSearchParams({ area, from: valid ? from : '', to: valid ? to : '', hd });
  const { data, loading, error, refresh } = useWorkData<{ data: RecapMetrics }>(`/recap?${query}`, { area });
  const metrics = data?.data;

  return (
    <>
      <section aria-labelledby="recap-summary" className="min-w-0">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3.5 sm:px-6">
            <h2 id="recap-summary" className="text-sm font-semibold">Ringkasan order</h2>
            {loading && <p role="status" className="text-xs text-muted-foreground">Memperbarui rekap…</p>}
          </CardHeader>

          <div aria-busy={loading} className="grid lg:grid-cols-[minmax(15rem,1fr)_minmax(0,1.65fr)]">
            <dl className="grid min-w-0 grid-cols-2 divide-x divide-border border-b bg-muted/40 lg:grid-cols-1 lg:grid-rows-2 lg:divide-x-0 lg:divide-y lg:border-r lg:border-b-0">
              <div className="min-w-0 px-4 py-4 sm:px-6">
                <dt className="flex items-start gap-2 text-xs font-semibold text-muted-foreground">
                  <Inbox aria-hidden className="size-4 shrink-0 text-primary" /> TOTAL ORDER MASUK
                </dt>
                <dd className="mt-2 [overflow-wrap:anywhere] text-4xl font-semibold tracking-tight text-primary tabular-nums sm:text-5xl">{metrics?.total ?? '—'}</dd>
              </div>
              <div className="min-w-0 px-4 py-4 sm:px-6">
                <dt className="flex items-start gap-2 text-xs font-semibold text-muted-foreground">
                  <Timer aria-hidden className="size-4 shrink-0" /> RATA-RATA PENGERJAAN
                </dt>
                <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="min-w-0 [overflow-wrap:anywhere] text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{metrics ? formatAverage(metrics.averageDurationSeconds) : '—'}</span>
                  <span className="text-xs text-muted-foreground">jam:menit</span>
                </dd>
              </div>
            </dl>

            <dl className="grid min-w-0 grid-cols-2">
              {statuses.map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="min-w-0 px-4 py-3.5 odd:border-r nth-[-n+2]:border-b sm:px-6 lg:grid lg:content-center">
                  <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Icon aria-hidden className={`size-4 shrink-0 ${color}`} /> {label}
                  </dt>
                  <dd className="mt-1.5 [overflow-wrap:anywhere] text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{metrics?.[key] ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <CardFooter className="block px-4 py-3.5 text-xs leading-relaxed text-muted-foreground sm:px-6">
            Total Order Masuk dan Belum Pick mengikuti modul dan tanggal. Gagal juga mencakup duplikat yang ditolak dari semua HD. Rekap memakai status terbaru setelah order dibuka kembali.
          </CardFooter>
        </Card>
      </section>

      <Card>
        <CardHeader className="px-4 sm:px-6">
          <h2 className="text-sm font-semibold">Filter rekap</h2>
        </CardHeader>
        <CardContent className="space-y-3 px-4 sm:px-6">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-medium">
                Modul
                <select aria-label="Modul rekap" className={field} value={area} onChange={event => setArea(event.target.value)}>
                  <option value="ALL">SEMUA</option>
                  {user?.modules?.some(module => ['TIAL', 'REQ'].includes(module)) && <option>TIAL</option>}
                  {user?.modules?.some(module => module.startsWith('LOGIC')) && <option>LOGIC</option>}
                  {['ASSUREN', 'B2B', 'REPLACEMENT'].filter(module => user?.modules?.includes(module)).map(module => <option key={module}>{module}</option>)}
                </select>
              </label>
              <People value={hd} onChange={setHd} selectClassName={field} compactPagination />
            </div>
            <div className="grid min-w-0 items-start gap-x-3 gap-y-3 min-[375px]:grid-cols-2 lg:gap-y-1">
              <label className="min-w-0 text-sm font-medium">
                Tanggal awal WIB
                <input aria-label="Rekap mulai" aria-invalid={!valid} aria-describedby={!valid ? dateErrorId : undefined} type="date" className={field} value={from} onChange={event => setFrom(event.target.value)} />
              </label>
              <label className="min-w-0 text-sm font-medium">
                Tanggal akhir WIB
                <input aria-label="Rekap akhir" aria-invalid={!valid} aria-describedby={!valid ? dateErrorId : undefined} type="date" className={field} value={to} onChange={event => setTo(event.target.value)} />
              </label>
              <Button className="h-11 justify-self-start min-[375px]:col-span-2" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>
                <CalendarX aria-hidden /> Semua tanggal
              </Button>
            </div>
          </div>
          {!valid && <p id={dateErrorId} role="alert" className="text-sm text-destructive">{!from || !to ? 'Isi kedua tanggal untuk memakai rentang ini.' : 'Tanggal awal harus sama dengan atau sebelum tanggal akhir.'}</p>}
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <p>{error}</p>
              <Button className="min-h-11" variant="outline" onClick={() => void refresh()}>Coba lagi</Button>
            </div>
          )}
        </CardContent>
        {user && user.role !== 'SHOW_ONLY' && (
          <CardFooter className="block px-4 sm:px-6">
            <ExportButton
              key={user.id}
              query={{ area, from, to, hd }}
              disabled={!valid}
              prominent
              description="Unduh semua status order sesuai filter yang dipilih."
            />
          </CardFooter>
        )}
      </Card>

      <Link className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline" to="/work/B2C">
        Dashboard Pekerjaan <ArrowRight aria-hidden className="size-4" />
      </Link>
    </>
  );
}
