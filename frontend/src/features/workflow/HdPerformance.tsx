import { useEffect, useState } from 'react';
import { Activity, ChartColumnIncreasing, CircleCheck, Layers, Save, Settings, TriangleAlert, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { request } from './api';

const commands = ['order', 'config_psb', 'mo', 'req'] as const;
type Command = typeof commands[number];
type Counts = { done: number; failed: number; points: number };
type Person = Counts & { id: string; name: string; commands: Record<Command, Counts> };
type Weights = Record<Command, Pick<Counts, 'done' | 'failed'>>;
type Draft = Record<Command, { done: string; failed: string }>;
type Data = {
  people: Person[]; commands: Command[]; weights?: Weights; version?: string; years: number[];
  from: string; to: string; totals: Counts & { active: number; average: number };
};
type Period = 'daily' | 'weekly' | 'monthly';

const colors: Record<Command, string> = { order: '#217be8', config_psb: '#9169df', mo: '#0d9e9f', req: '#e59a28' };
const dates = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' });
const dateLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const panel = 'min-w-0 rounded-2xl border border-blue-100 bg-card p-4 shadow-sm dark:border-border sm:p-5';
const input = 'h-10 min-w-0 rounded-lg border bg-background px-2.5 text-sm';
const periods = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (key: string) => new Date(key + 'T00:00:00Z');
const shift = (key: string, days: number) => iso(new Date(+dateAt(key) + days * 86400000));
const monday = (key: string) => shift(key, -(dateAt(key).getUTCDay() + 6) % 7);
const range = (from: string, to: string) => [from, ...(from === to ? [] : [to])].map(key => dateLabel.format(dateAt(key))).join(' – ');

function Heading({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return <div className="mb-3 flex items-start gap-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-primary"><Icon aria-hidden className="size-5" /></span>
    <div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div>
  </div>;
}

export default function HdPerformance() {
  const { user } = useAuth();
  const canManageWeights = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [area, setArea] = useState('ALL');
  const [period, setPeriod] = useState<Period>('weekly');
  const [date, setDate] = useState(() => dates.format(new Date()));
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState('');
  const [result, setResult] = useState<{ key: string; data?: Data; error?: string }>();
  const query = new URLSearchParams({ area, period, date }).toString();
  const key = query + ':' + reload;
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    request<Data>('/recap/performance?' + query, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, query]);

  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const first = date.slice(0, 7) + '-01';
  const last = iso(new Date(Date.UTC(year, month, 0)));
  const weekOptions: { start: string; anchor: string }[] = [];
  for (let start = monday(first); start <= last; start = shift(start, 7)) {
    weekOptions.push({ start, anchor: start < first ? first : start });
  }
  const years = [...new Set([year, Number(dates.format(new Date()).slice(0, 4)), ...(result?.data?.years ?? []).filter(value => value >= 2000 && value <= 2099)])].sort((a, b) => b - a);
  const selectMonth = (year: number, month: number) => setDate(iso(new Date(Date.UTC(year, month - 1, 1))));
  const update = () => setReload(value => value + 1);

  return <section aria-label="Performansi HD" className="min-w-0 space-y-4">
    <div className={panel + ' flex flex-wrap items-end gap-3'}>
      <label className="grid flex-1 gap-1 text-xs font-medium sm:flex-none">Modul
        <select aria-label="Modul performansi" className={input + ' sm:w-36'} value={area} onChange={event => setArea(event.target.value)}>
          <option>ALL</option><option>TIAL</option><option>LOGIC</option>
        </select>
      </label>
      <div className="order-3 w-full space-y-1 sm:order-0 sm:w-auto">
        <p className="text-xs font-medium">Periode</p>
        <div role="group" aria-label="Periode performansi" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
          {Object.entries(periods).map(([value, label]) => <Button key={value} size="sm" aria-pressed={value === period}
            variant={value === period ? 'default' : 'ghost'} onClick={() => setPeriod(value as Period)}>{label}</Button>)}
        </div>
      </div>
      <label className="grid flex-1 gap-1 text-xs font-medium sm:flex-none">Bulan
        <select className={input} value={month} onChange={event => selectMonth(year, Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{monthName.format(new Date(Date.UTC(2020, index, 1)))}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">Tahun
        <select className={input} value={year} onChange={event => selectMonth(Number(event.target.value), month)}>
          {years.map(year => <option key={year}>{year}</option>)}
        </select>
      </label>
      {period === 'daily' && <label className="order-4 grid w-full gap-1 text-xs font-medium sm:order-0 sm:w-auto">Tanggal WIB
        <input type="date" className={input} min={first} max={last} value={date}
          onChange={event => { if (event.target.value && event.target.value >= first && event.target.value <= last) setDate(event.target.value); }} />
      </label>}
      {period === 'weekly' && <label className="order-4 grid w-full min-w-0 gap-1 text-xs font-medium sm:order-0 sm:w-auto">Minggu WIB
        <select className={input} value={monday(date)} onChange={event => {
          const selected = weekOptions.find(week => week.start === event.target.value);
          if (selected) setDate(selected.anchor);
        }}>
          {weekOptions.map(({ start }) => <option value={start} key={start}>{range(start, shift(start, 6))}</option>)}
        </select>
      </label>}
      {data && <p className="order-5 flex h-10 items-center gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 sm:ml-auto dark:text-emerald-300">
        <Users aria-hidden className="size-4" />{number.format(data.totals.active)} HD Aktif
      </p>}
    </div>

    <article className={panel}>
      <Heading icon={ChartColumnIncreasing} title="Grafik ALL HD" description="Total poin per HD berdasarkan bobot · Urutan nama A–Z" />
      {!data && !error && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Memuat performansi…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <p>{error}</p><Button size="sm" variant="outline" onClick={update}>Coba lagi</Button>
      </div>}
      {data && <StackedChart people={data.people} selected={data.commands} />}
    </article>

    {data && <>
      <Summary totals={data.totals} />
      {canManageWeights && data.weights && data.version && <WeightCard key={data.version} weights={data.weights} version={data.version} onSaved={update} />}
      <DetailCard key={query} data={data} value={detail} onChange={setDetail} />
    </>}
    <p className="text-xs leading-relaxed text-muted-foreground">
      Periode memakai WIB dan waktu penyelesaian terakhir. Hanya penyelesaian Web dengan audit dan pelaku yang dapat diverifikasi yang dihitung. Order yang dibuka kembali masuk hitungan setelah diselesaikan kembali. Bobot aktif berlaku untuk semua periode.
    </p>
  </section>;
}

function StackedChart({ people, selected }: { people: Person[]; selected: Command[] }) {
  const [active, setActive] = useState('');
  const focused = people.find(person => person.id === active);
  const max = Math.max(4, Math.ceil(people.reduce((max, person) => Math.max(max, person.points), 0) / 4) * 4);
  if (!people.length) return <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada HD aktif.</p>;
  return <>
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
      {selected.map(command => <li className="flex items-center gap-1.5" key={command}>
        <span className="size-2.5 rounded-full" style={{ background: colors[command] }} />/{command}
      </li>)}
    </ul>
    <div role="status" className="min-h-6 text-xs text-muted-foreground">
      {focused && <><strong className="text-foreground">{focused.name} · {number.format(focused.points)} poin</strong>
        {selected.map(command => <span key={command}> · /{command} {number.format(focused.commands[command].points)}</span>)}</>}
    </div>
    <div className="flex min-w-0 gap-2">
      <div aria-hidden className="relative mt-5 h-40 w-10 shrink-0 text-right text-[10px] text-muted-foreground">
        {[4, 3, 2, 1, 0].map(tick => <span className="absolute right-0 translate-y-1/2" key={tick} style={{ bottom: tick * 25 + '%' }}>{number.format(max * tick / 4)}</span>)}
      </div>
      <div role="region" aria-label="Batang per HD, dapat digulir ke samping" tabIndex={0}
        className="min-w-0 flex-1 overflow-x-auto rounded pb-2 focus-visible:outline-2 focus-visible:outline-primary">
        <div className="relative flex w-max min-w-full pt-5">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-5 h-40">
            {[0, 1, 2, 3, 4].map(tick => <div key={tick} className="absolute inset-x-0 border-b border-dashed border-blue-200/80 dark:border-border" style={{ bottom: tick * 25 + '%' }} />)}
          </div>
          {people.map(person => <button type="button" key={person.id} onPointerEnter={() => setActive(person.id)}
            onPointerLeave={() => setActive('')} onFocus={() => setActive(person.id)} onBlur={() => setActive('')} onClick={() => setActive(person.id)}
            aria-label={person.name + ', ' + number.format(person.points) + ' poin'}
            className="z-0 grid w-[4.4rem] flex-1 shrink-0 justify-items-center gap-2 rounded-md px-1 text-xs outline-offset-[-2px] hover:bg-blue-500/5 focus-visible:outline-2 focus-visible:outline-primary">
            <span className="relative block h-40 w-full">
              <span className="absolute inset-x-0 text-center font-semibold tabular-nums" style={{ bottom: person.points / max * 100 + '%' }}>{number.format(person.points)}</span>
              <span className="absolute inset-x-[14%] bottom-0 flex flex-col-reverse overflow-hidden rounded-t-md" style={{ height: person.points / max * 100 + '%' }}>
                {selected.filter(command => person.commands[command].points > 0).map(command => <span key={command}
                  style={{ background: colors[command], flexGrow: person.commands[command].points }} className="basis-0 bg-linear-to-t from-black/8 to-white/15" />)}
              </span>
            </span>
            <span className="max-w-full wrap-break-word text-center font-medium" title={person.name}>{person.name}</span>
          </button>)}
        </div>
      </div>
    </div>
  </>;
}

function Summary({ totals }: { totals: Data['totals'] }) {
  const cards = [
    ['Total DONE', totals.done, CircleCheck, 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300'],
    ['Total GAGAL', totals.failed, TriangleAlert, 'text-amber-700 bg-amber-500/10 dark:text-amber-300'],
    ['Total Poin', totals.points, Layers, 'text-primary bg-blue-500/10'],
    ['Rata-rata per HD Aktif', totals.average, Activity, 'text-teal-700 bg-teal-500/10 dark:text-teal-300'],
  ] as const;
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {cards.map(([label, value, Icon, color]) => <div key={label} className={panel + ' flex flex-wrap items-center gap-2 sm:gap-3'}>
      <span className={color + ' grid size-9 place-items-center rounded-xl'}><Icon className="size-5" aria-hidden /></span>
      <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{number.format(value)}</dd></div>
    </div>)}
  </dl>;
}

function WeightCard({ weights, version, onSaved }: { weights: Weights; version: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(commands.map(command => [command,
    { done: String(weights[command].done), failed: String(weights[command].failed) }
  ])) as Draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const invalid = commands.some(command => Object.values(draft[command]).some(value => !/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 10000));
  const changed = commands.some(command => (['done', 'failed'] as const).some(status => Number(draft[command][status]) !== weights[command][status]));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || invalid || !changed) return;
    setBusy(true); setError('');
    try {
      const next = Object.fromEntries(commands.map(command => [command, { done: Number(draft[command].done), failed: Number(draft[command].failed) }]));
      await request('/recap/performance/weights', { version, weights: next });
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'Bobot gagal disimpan.'); }
    finally { setBusy(false); }
  }
  return <article className={panel}>
    <Heading icon={Settings} title="Pengaturan Bobot" description="Atur bobot DONE dan GAGAL per perintah, 0–10.000 dengan maksimal dua desimal." />
    <form onSubmit={save}>
      <table className="w-full table-fixed overflow-hidden rounded-lg text-sm">
        <thead className="bg-muted"><tr><th className="px-2 py-2 text-left">Perintah</th><th className="bg-emerald-500/10 px-1">Bobot DONE</th><th className="bg-amber-500/10 px-1">Bobot GAGAL</th></tr></thead>
        <tbody>{commands.map(command => <tr key={command} className="border-b">
          <th scope="row" className="px-2 py-2 text-left font-medium">/{command}</th>
          {(['done', 'failed'] as const).map(status => <td key={status} className="px-1 py-1.5 text-center">
            <input aria-label={`Bobot ${status === 'done' ? 'DONE' : 'GAGAL'} /${command}`} type="number" min="0" max="10000" step="0.01" required
              className={input + ' w-full max-w-24 text-center tabular-nums'} value={draft[command][status]} disabled={busy}
              onChange={event => setDraft({ ...draft, [command]: { ...draft[command], [status]: event.target.value } })} />
          </td>)}
        </tr>)}</tbody>
      </table>
      {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
        <p>{error}</p><Button type="button" size="sm" variant="outline" onClick={onSaved}>Muat ulang bobot</Button>
      </div>}
      <div className="mt-3 flex justify-end"><Button type="submit" disabled={busy || invalid || !changed}>
        <Save aria-hidden />{busy ? 'Menyimpan…' : 'Simpan Bobot'}
      </Button></div>
    </form>
  </article>;
}

function DetailCard({ data, value, onChange }: { data: Data; value: string; onChange: (value: string) => void }) {
  const [page, setPage] = useState(0);
  const person = data.people.find(person => person.id === value);
  const displayValue = person || value === 'ALL' ? value : '';
  const lastPage = Math.max(0, Math.ceil(data.people.length / 15) - 1);
  const currentPage = Math.min(page, lastPage);
  return <article className={panel}>
    <Heading icon={UserRound} title="Detail Performansi HD" description="Lihat jumlah pekerjaan DONE dan GAGAL per HD." />
    <select className={input + ' w-full'} aria-label="Pilih HD atau ALL" value={displayValue}
      onChange={event => { setPage(0); onChange(event.target.value); }}>
      <option value="">Pilih HD atau ALL…</option><option value="ALL">ALL — Semua HD</option>
      {data.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>
    {!displayValue && <div className="mt-3 grid place-items-center gap-1 rounded-xl bg-muted/60 p-5 text-center">
      <ChartColumnIncreasing className="mb-1 size-7 text-primary/45" aria-hidden />
      <p className="font-semibold">Belum ada HD dipilih</p><p className="text-xs text-muted-foreground">Pilih HD atau ALL untuk melihat detail.</p>
    </div>}
    {displayValue === 'ALL' && <>
      <table className="mt-3 w-full table-fixed text-xs sm:text-sm">
        <thead className="border-b"><tr><th className="w-[43%] py-2 text-left">Nama HD</th><th>DONE</th><th>GAGAL</th><th>Total Poin</th></tr></thead>
        <tbody>{data.people.slice(currentPage * 15, currentPage * 15 + 15).map(person => <tr key={person.id} className="border-b text-center tabular-nums">
          <th scope="row" className="py-2 pr-1 text-left font-medium wrap-break-word">{person.name}</th><td>{number.format(person.done)}</td><td>{number.format(person.failed)}</td><td>{number.format(person.points)}</td>
        </tr>)}</tbody>
      </table>
      {!data.people.length && <p className="py-4 text-sm text-muted-foreground">Tidak ada HD aktif.</p>}
      {lastPage > 0 && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs">Halaman {currentPage + 1} dari {lastPage + 1}</span>
        <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Sebelumnya</Button>
        <Button variant="outline" size="sm" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Berikutnya</Button>
      </div>}
    </>}
    {person && <DetailChart person={person} selected={data.commands} />}
  </article>;
}

function DetailChart({ person, selected }: { person: Person; selected: Command[] }) {
  const max = Math.max(1, ...selected.flatMap(command => [person.commands[command].done, person.commands[command].failed]));
  return <section className="mt-4">
    <h3 className="font-semibold">{person.name}</h3>
    <p className="text-sm text-muted-foreground">{number.format(person.done)} DONE · {number.format(person.failed)} GAGAL · {number.format(person.points)} poin</p>
    <p className="mt-3 text-xs font-medium"><span className="text-emerald-700 dark:text-emerald-300">● DONE</span> <span className="text-amber-700 dark:text-amber-300">● GAGAL</span></p>
    <div className="mt-5 flex items-end gap-1 border-b">
      {selected.map(command => <div key={command} className="grid min-w-0 flex-1 justify-items-center gap-2 py-2 text-center text-[10px] sm:text-xs">
        <div className="flex h-28 w-full max-w-20 items-end justify-center gap-1 px-1">
          {(['done', 'failed'] as const).map(status => {
            const count = person.commands[command][status];
            return <div role="img" aria-label={`/${command} ${status === 'done' ? 'DONE' : 'GAGAL'} ${count}`} key={status}
              className={`relative w-1/2 rounded-t ${status === 'done' ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ height: count / max * 100 + '%' }}>
              <span className="absolute inset-x-0 bottom-full text-center tabular-nums">{number.format(count)}</span>
            </div>;
          })}
        </div>
        <span className="max-w-full wrap-break-word font-medium">/{command}</span>
      </div>)}
    </div>
  </section>;
}
