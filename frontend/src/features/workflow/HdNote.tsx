import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkData } from './hooks';
import { request } from './api';
import { ownsActiveOrder, type Work } from './model';

export type HdNoteData = { id: string; text: string; updatedBy: number | null; updatedAt: string | null };

export function HdNoteField({ id, note, editable, readError, refresh, compact = false }: {
  id: string;
  note?: HdNoteData;
  editable: boolean;
  readError: string;
  refresh: () => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ source?: HdNoteData; text: string } | null>(null);
  const text = saved && saved.source === note ? saved.text : note?.text;
  const buttonClass = compact ? 'px-2 text-xs' : 'min-h-11';
  const canEdit = editable && Boolean(note) && !readError;

  async function save() {
    if (!canEdit || busy || draft === null) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ text: string }>(`/orders/${id}/hd-note`, { text: draft });
      setSaved({ source: note, text: result.text });
      setDraft(null);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catatan belum tersimpan');
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-1">
      {canEdit && draft !== null ? (
        <div className="space-y-2">
          <textarea aria-label="Isi Catatan HD" rows={compact ? 2 : 3} maxLength={2000} disabled={busy} className={compact ? "block w-full rounded-lg border bg-background p-1.5 text-base sm:text-xs" : "block w-full rounded-lg border bg-background p-2 text-base sm:text-sm"} value={draft} onChange={event => setDraft(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className={buttonClass} disabled={busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan Catatan'}</Button>
            <Button size="sm" className={buttonClass} variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Batal</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{readError ? 'Catatan belum tersedia' : text || '—'}</p>
          {canEdit && <Button size="sm" variant="outline" className={buttonClass} onClick={() => { setDraft(text ?? ''); setSaved(null); setError(''); }}>{text ? 'Edit catatan' : 'Tambah catatan'}</Button>}
        </>
      )}
      {saved && <p role="status">Catatan tersimpan.</p>}
      {error && <p role="alert">{error}</p>}
      {readError && <Button variant="ghost" size="sm" onClick={refresh}>Muat ulang catatan</Button>}
    </div>
  );
}

export default function HdNote({ order, verified }: { order: Work; verified: boolean }) {
  const { user } = useAuth();
  const notes = useWorkData<{ data: HdNoteData[] }>('/order-notes?ids=' + encodeURIComponent(order.id));
  const editable = verified && ownsActiveOrder(order, user?.id);
  return (
    <details aria-label="Catatan HD" className="space-y-2 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">CATATAN HD</summary>
      <HdNoteField key={String(editable)} id={order.id} note={notes.data?.data.find(row => row.id === order.id)} editable={editable} readError={notes.error} refresh={() => void notes.refresh()} />
    </details>
  );
}
