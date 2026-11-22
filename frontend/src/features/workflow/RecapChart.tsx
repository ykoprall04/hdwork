import { useEffect, useId, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight, FileSpreadsheet, Inbox, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cookieFetch } from '../operational/cookie-http';
import { operationsBase, request } from './api';

const periods = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' } as const;
type Period = keyof typeof periods;
type Command = 'order' | 'req' | 'mo' | 'config_psb';
type ChartData = {
  from: string;
  to: string;
  total: number;
  average: number;
  peak: number | null;
  low: number | null;
  buckets: { start: string; count: number; counts: number[] }[];
  distribution: { command: Command; count: number }[];
};

const colors: Record<Command, string> = { order: '#0284f3', req: '#06b6d4', mo: '#7c3aed', config_psb: '#b078ef' };
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const jakartaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
const localDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const panel = 'min-w-0 rounded-2xl border border-blue-100 bg-card shadow-[0_1px_2px_#24457908,0_12px_30px_-18px_#4380e264] dark:border-sky-900/65';
const iconTile = 'grid shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-current/10';

function shiftDate(date: string, period: Period, step: number) {
  const cursor = new Date(date + 'T00:00:00Z');
  if (period === 'monthly') {
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  } else {
    cursor.setUTCDate(cursor.getUTCDate() + step * (period === 'weekly' ? 7 : 1));
  }
  return cursor.toISOString().slice(0, 10);
}

function bucketLabel(start: string, period: Period, short = false) {
  const format: Intl.DateTimeFormatOptions = period === 'daily' ? { hour: '2-digit', hourCycle: 'h23' }
    : period === 'weekly' ? { weekday: short ? 'short' : 'long' }
    : short ? { day: 'numeric' } : { day: 'numeric', month: 'long' };
  const label = new Intl.DateTimeFormat('id-ID', { ...format, timeZone: 'Asia/Jakarta' }).format(new Date(start));
  return period === 'daily' && !short ? label + '.00 WIB' : label;
}

export default function RecapChart() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [area, setArea] = useState('ALL');
  const [period, setPeriod] = useState<Period>('weekly');
  const [date, setDate] = useState(() => jakartaDate.format(new Date()));
  const [attempt, setAttempt] = useState(0);
  const query = new URLSearchParams({ area, period, date }).toString();
  const [result, setResult] = useState<{ query: string; data?: ChartData; error?: string }>();
  const data = result?.query === query ? result.data : undefined;
  const error = result?.query === query ? result.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    request<ChartData>('/recap/chart?' + query, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ query, data }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setResult({ query, error: error.message }); });
    return () => controller.abort();
  }, [query, attempt]);

  async function exportExcel() {
    if (!data || exporting) return;
    setExportError('');
    setExporting(true);
    try {
      const response = await cookieFetch(operationsBase + '/recap/chart/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, period, date, counts: data.buckets.map(bucket => bucket.counts) }),
      });
      if (!response.ok) throw Error('Export Excel gagal. Coba lagi.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hdwork-grafik.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError('Export Excel gagal. Coba lagi.');
    } finally {
      setExporting(false);
    }
  }

  const previous = shiftDate(date, period, -1);
  const next = shiftDate(date, period, 1);
  const range = data ? [data.from, ...(data.to === data.from ? [] : [data.to])]
    .map(value => localDate.format(new Date(value + 'T00:00:00Z'))).join(' – ') : '';
  const summary = [
    { title: 'Total order masuk', value: data && number.format(data.total), icon: Inbox, color: 'text-blue-600 bg-blue-500/10 dark:text-blue-300', accent: 'from-blue-500/12' },
    { title: period === 'daily' ? 'Rata-rata per jam' : 'Rata-rata per hari', value: data && number.format(data.average), icon: Activity, color: 'text-teal-700 bg-teal-500/10 dark:text-teal-300', accent: 'from-teal-500/12' },
    { title: 'Paling ramai', value: data?.peak != null ? bucketLabel(data.buckets[data.peak].start, period) : null, icon: ArrowUp, color: 'text-amber-700 bg-amber-500/10 dark:text-amber-300', accent: 'from-amber-500/12' },
    { title: 'Paling sepi', value: data?.low != null ? bucketLabel(data.buckets[data.low].start, period) : null, icon: ArrowDown, color: 'text-violet-700 bg-violet-500/10 dark:text-violet-300', accent: 'from-violet-500/12' },
  ];

  return (
    <section aria-label="Grafik order masuk" className="min-w-0 space-y-4">
      <div className={panel + ' grid gap-x-5 gap-y-4 bg-linear-to-br from-blue-500/5 to-transparent p-4 sm:grid-cols-[9rem_minmax(0,1fr)] xl:grid-cols-[10rem_minmax(0,1fr)_auto]'}>
        <label className="grid min-w-0 content-start gap-1.5 text-xs font-semibold text-muted-foreground">
          Modul
          <select aria-label="Modul grafik" className="h-11 min-w-0 rounded-xl border border-blue-100 bg-card px-3 text-sm font-semibold text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-sky-900" value={area} onChange={event => setArea(event.target.value)}>
            <option>ALL</option><option>TIAL</option><option>LOGIC</option>
          </select>
        </label>
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Periode</p>
          <div role="group" aria-label="Periode grafik" className="grid h-11 grid-cols-3 gap-1 rounded-xl border border-blue-100 bg-blue-950/4 p-[3px] sm:w-max dark:border-sky-900 dark:bg-sky-950/40">
            {Object.entries(periods).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key as Period)}
                className="min-w-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-blue-500/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 aria-pressed:bg-linear-to-r aria-pressed:from-sky-600 aria-pressed:to-blue-700 aria-pressed:text-white aria-pressed:shadow-[0_2px_10px_#1885ef55] sm:px-4 sm:text-sm">
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1">
          <p className="text-xs font-semibold text-muted-foreground">Rentang tanggal</p>
          <div className="flex min-w-0 items-center justify-between gap-1 rounded-xl border border-blue-100 bg-card px-0.5 dark:border-sky-900">
            <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-lg text-blue-600 dark:text-sky-300" aria-label="Periode sebelumnya" disabled={!previous.startsWith('20')} onClick={() => setDate(previous)}><ChevronLeft /></Button>
            <span className="inline-flex min-w-0 items-center gap-1.5 px-1 text-center text-xs font-medium tabular-nums">
              <CalendarDays aria-hidden className="hidden size-4 shrink-0 text-sky-600 min-[420px]:block dark:text-sky-300" />
              <span>{range || 'Periode terpilih'} <span className="text-muted-foreground">WIB</span></span>
            </span>
            <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-lg text-blue-600 dark:text-sky-300" aria-label="Periode berikutnya" disabled={!next.startsWith('20')} onClick={() => setDate(next)}><ChevronRight /></Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-blue-100/80 pt-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-3 dark:border-sky-900/70">
          <p className="text-xs leading-relaxed text-muted-foreground">ALL pada tab Grafik mencakup TIAL dan LOGIC. Cakupan Rekap Order bisa lebih luas.</p>
          {user && user.role !== 'SHOW_ONLY' && (
            <Button variant="outline" className="h-11 shrink-0" disabled={!data || exporting} onClick={() => void exportExcel()}>
              <FileSpreadsheet aria-hidden /> {exporting ? 'Menyiapkan Excel…' : 'Export Excel'}
            </Button>
          )}
        </div>
        {exportError && <p role="alert" className="text-sm text-destructive sm:col-span-2 xl:col-span-3">{exportError}</p>}
      </div>

      {!data && !error && <p role="status" className="text-sm text-muted-foreground">Memuat grafik…</p>}
      {error && <div role="alert" className={panel + ' flex flex-wrap items-center gap-3 p-4 text-sm'}>
        <span>{error}</span><Button variant="outline" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>Coba lagi</Button>
      </div>}
      {data && <>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.map(({ title, value, icon: Icon, color, accent }) => (
            <div key={title} className={`${panel} ${accent} relative isolate overflow-hidden bg-linear-to-tl from-0% to-transparent to-65% p-3.5 hover:border-sky-300 hover:shadow-[0_10px_28px_-12px_#3b82f680] motion-safe:transition-[box-shadow,border-color,translate] motion-safe:hover:-translate-y-0.5 sm:p-4 dark:hover:border-sky-700`}>
              <div className="flex flex-col items-start gap-2.5 2xl:flex-row 2xl:items-center 2xl:gap-3">
                <span className={`${iconTile} ${color} size-9 sm:size-10`}><Icon aria-hidden className="size-5" /></span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium leading-tight text-muted-foreground sm:text-sm">{title}</dt>
                  <dd className="mt-1 text-[clamp(1.06rem,2vw,1.65rem)] leading-tight font-semibold tracking-tight wrap-break-word tabular-nums">{value ?? '—'}</dd>
                </div>
              </div>
            </div>
          ))}
        </dl>
        <Trend key={query} data={data} period={period} />
        <Distribution data={data} />
      </>}
    </section>
  );
}

function Trend({ data, period }: { data: ChartData; period: Period }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const selected = active ?? data.peak;
  const width = 800, height = 200;
  const max = Math.max(4, Math.ceil((data.peak == null ? 0 : data.buckets[data.peak].count) / 4) * 4);
  const position = (index: number) => (index + 0.5) / data.buckets.length;
  const y = (count: number) => height - 12 - count / max * (height - 24);
  const points = data.buckets.map((bucket, index) => ({ x: position(index) * width, y: y(bucket.count) }));
  const curve = points.map((point, index) => {
    if (index === 0) return `M ${point.x},${point.y}`;
    const prior = points[index - 1];
    // Horizontal control points keep the curve between the adjacent order counts.
    const middle = (prior.x + point.x) / 2;
    return `C ${middle},${prior.y} ${middle},${point.y} ${point.x},${point.y}`;
  }).join(' ');
  const area = `${curve} L ${points[points.length - 1].x},${y(0)} L ${points[0].x},${y(0)} Z`;
  const percentY = (index: number) => points[index].y / height * 100;
  const labels = period === 'weekly' ? 1 : period === 'daily' ? 4 : 5;
  return (
    <article className={panel + ' overflow-hidden p-4 sm:p-5'}>
      <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className={iconTile + ' size-9 bg-blue-500/10 text-blue-600 dark:text-sky-300'}><ChartNoAxesCombined className="size-5" aria-hidden /></span> Tren Order Masuk</h2>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground sm:text-sm" role="status">
        {selected == null ? 'Tidak ada order dalam periode ini.' : `${bucketLabel(data.buckets[selected].start, period)} · ${number.format(data.buckets[selected].count)} order${selected === data.peak ? ' · Paling ramai' : ''}`}
      </p>
      <div className="mt-4 flex gap-2">
        <div aria-hidden className="relative h-44 w-9 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums sm:h-56">
          {[4, 3, 2, 1, 0].map(tick => <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: y(max * tick / 4) / height * 100 + '%' }}>{number.format(max * tick / 4)}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44 sm:h-56">
            <svg aria-hidden viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id={id + '-area'} x2="0" y2="1">
                  <stop stopColor="#008cff" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity=".025" />
                </linearGradient>
                <linearGradient id={id + '-line'} gradientUnits="userSpaceOnUse" x2={width}>
                  <stop stopColor="#00a9ed" />
                  <stop offset="58%" stopColor="#007bff" />
                  <stop offset="100%" stopColor="#2548ec" />
                </linearGradient>
              </defs>
              {[4, 3, 2, 1, 0].map(tick => <line key={tick} x2={width} y1={y(max * tick / 4)} y2={y(max * tick / 4)} className="stroke-blue-200/65 dark:stroke-sky-900/75" strokeDasharray={tick ? '3 5' : undefined} vectorEffect="non-scaling-stroke" />)}
              <path d={area} fill={`url(#${id}-area)`} />
              {selected !== null && <line x1={points[selected].x} x2={points[selected].x} y1={points[selected].y} y2={y(0)} className="stroke-cyan-400/55" vectorEffect="non-scaling-stroke" />}
              <path d={curve} fill="none" stroke={`url(#${id}-line)`} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute inset-0 flex" onPointerLeave={() => setActive(null)}>
              {data.buckets.map(({ start, count }, index) => (
                <button key={start} type="button" aria-label={`${bucketLabel(start, period)}: ${number.format(count)} order`}
                  className="relative min-w-0 flex-1 focus-visible:z-10 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-sky-500"
                  onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                  onPointerEnter={() => setActive(index)} onClick={() => setActive(index)}>
                  <span aria-hidden
                    className={`absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-500 bg-card motion-safe:transition-transform ${data.peak === index || selected === index ? 'scale-[1.65] border-cyan-400 shadow-[0_0_0_3px_#22d3ee32,0_0_9px_#22d3ee98]' : ''}`}
                    style={{ top: percentY(index) + '%' }} />
                </button>
              ))}
            </div>
            {active !== null && (
              <span role="tooltip" className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-sky-400/40 bg-linear-to-r from-sky-700 to-blue-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_5px_12px_#185dd954] tabular-nums"
                style={{ left: `clamp(3.25rem, ${position(active) * 100}%, calc(100% - 3.25rem))`, top: Math.max(0, percentY(active) - 17) + '%' }}>
                {number.format(data.buckets[active].count)} order
              </span>
            )}
          </div>
          <div aria-hidden className="flex text-center text-[10px] text-muted-foreground sm:text-xs">
            {data.buckets.map(({ start }, index) => <span key={start} className="min-w-0 flex-1 whitespace-nowrap">{index % labels === 0 ? bucketLabel(start, period, true) : ''}</span>)}
          </div>
        </div>
      </div>
    </article>
  );
}

function Distribution({ data }: { data: ChartData }) {
  let offset = 0;
  const gradient = data.distribution.filter(item => item.count > 0).map(({ command, count }) => {
    const start = offset;
    offset += count / data.total * 100;
    return `${colors[command]} ${start}% ${Math.min(100, offset)}%`;
  }).join(', ');
  return (
    <article className={panel + ' p-4 sm:p-5'}>
      <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className={iconTile + ' size-9 bg-blue-500/10 text-blue-600 dark:text-sky-300'}><PieChart className="size-5" aria-hidden /></span> Distribusi Jenis Order</h2>
      <div className="mt-4 grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8 lg:gap-10">
        <div aria-hidden className="mx-auto grid size-44 place-items-center rounded-full bg-muted p-[1.2rem] ring-4 ring-blue-500/8 shadow-[0_6px_25px_-7px_#2886f980] sm:mx-1 sm:size-48 lg:size-52 lg:p-6"
          style={gradient ? { backgroundImage: `conic-gradient(${gradient}, transparent ${offset >= 100 - 1e-8 ? 100 : offset}%, transparent 100%)` } : undefined}>
          <div className="grid size-full place-content-center rounded-full bg-card bg-linear-to-b from-blue-500/7 to-transparent text-center ring-1 ring-inset ring-blue-500/15">
            <strong className="text-3xl leading-tight tracking-tight tabular-nums">{number.format(data.total)}</strong><span className="text-xs text-muted-foreground">Total order</span>
          </div>
        </div>
        <ul className={`grid gap-2.5 ${data.distribution.length === 4 ? 'lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-2' : ''}`}>
          {data.distribution.map(({ command, count }) => (
            <li key={command} className="flex items-center justify-between gap-2 rounded-xl border border-blue-100/80 bg-linear-to-r from-blue-500/5 to-transparent px-3 py-2.5 text-sm dark:border-sky-900/70">
              <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ backgroundColor: colors[command] }} />/{command}</span>
              <span className="text-right font-semibold tabular-nums">{number.format(count)} <span className="font-normal text-muted-foreground">({number.format(data.total ? count / data.total * 100 : 0)}%)</span></span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
