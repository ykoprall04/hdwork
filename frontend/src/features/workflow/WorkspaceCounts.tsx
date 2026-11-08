import { Metric } from '../operations/components';
import { useWorkData } from './hooks';
export default function WorkspaceCounts({ area }: { area: string }) {
  const { data, error } = useWorkData<{ data: Record<string, number> }>(`/recap?area=${area}`, { area });
  return <>{error && <p role="alert">Ringkasan belum dapat dibaca: {error}</p>}<div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{[['total', 'Total order'], ['waiting', 'Menunggu'], ['process', 'Proses cek'], ['done', 'Selesai'], ['failed', 'Gagal']].map(([key, label]) => <Metric key={key} label={label} value={data ? data.data[key] : '—'} detail="Seluruh tanggal" />)}</div></>;
}
