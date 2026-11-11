import {formatAverage} from './statistics';
import { useWorkData } from './hooks';
export default function WorkspaceCounts({ area }: { area: string }) {
  const { data, error } = useWorkData<{ data: Record<string, number> }>(`/recap?area=${area}`, { area });
  return <section aria-label="Ringkasan pekerjaan" className="op-counts"><div className="flex flex-wrap justify-between gap-2 px-4 pt-3 text-xs text-muted-foreground"><h2 className="font-medium">Ringkasan {area}</h2><span>Seluruh tanggal</span></div>{error && <p role="alert" className="px-4 pt-2 text-xs">Ringkasan belum dapat dibaca: {error}</p>}<dl className="op-counts-grid">{[['total', 'Total order'], ['waiting', 'Menunggu'], ['process', 'Proses cek'], ['done', 'Selesai'], ['failed', 'Gagal'], ['averageDurationSeconds', 'Rata-rata pengerjaan']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{data?.data[key] == null ? '—' : key==='averageDurationSeconds'?formatAverage(data.data[key]):data.data[key]}</dd></div>)}</dl></section>;
}
