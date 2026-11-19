import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { request } from './api';

export default function People({
  value,
  onChange,
  selectClassName,
  compactPagination = false,
}: {
  value: string;
  onChange: (value: string) => void;
  selectClassName?: string;
  compactPagination?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ id: number; name: string }[]>([]);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void request<{ data: { id: number; name: string }[]; hasMore: boolean }>(
      `/people?page=${page}`, undefined, controller.signal,
    ).then(result => {
      setData(result.data);
      setMore(result.hasMore);
    }).catch(() => {});
    return () => controller.abort();
  }, [page]);

  const controls = [
    { label: 'HD sebelumnya', icon: ChevronLeft, disabled: page === 1, offset: -1 },
    { label: 'HD berikutnya', icon: ChevronRight, disabled: !more, offset: 1 },
  ];

  return (
    <div className="min-w-0">
      <label className={selectClassName ? 'text-sm font-medium' : 'text-xs'}>
        Nama HD
        <select
          aria-label="Nama HD"
          className={selectClassName ?? 'mt-1 block w-full rounded-lg border bg-background p-2 text-sm'}
          value={value}
          onChange={event => onChange(event.target.value)}
        >
          <option value="">SEMUA HD</option>
          {value && !data.some(person => String(person.id) === value) && <option value={value}>HD #{value}</option>}
          {data.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <div className="mt-1 flex flex-wrap gap-x-2">
        {controls.map(({ label, icon: Icon, disabled, offset }) => (
          <Button
            key={label}
            size={compactPagination ? 'icon' : 'sm'}
            className={compactPagination ? 'size-11' : undefined}
            variant="ghost"
            aria-label={label}
            title={compactPagination ? label : undefined}
            disabled={disabled}
            onClick={() => setPage(current => current + offset)}
          >
            {compactPagination ? <Icon aria-hidden /> : label}
          </Button>
        ))}
      </div>
    </div>
  );
}
