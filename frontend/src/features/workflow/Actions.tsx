import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { request } from './api';
import { visibleActions, labels, type Work } from './model';
import { readDraft, saveDraft, removeDraft } from './drafts';
import { readPendingAction, savePendingAction, type ActionPayload } from './pending-action';

function Confirmation({ action, note, busy, error, change, confirm, cancel }: { action: string; note: string; busy: boolean; error: string; change: (value: string) => void; confirm: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const required = ['FAILED', 'ESCALATE'].includes(action);
  const label = action === 'DONE' ? 'Pesan DONE (opsional)' : action === 'FAILED' ? 'Alasan kegagalan (wajib)' : 'Pesan eskalasi (wajib)';
  return <dialog ref={dialog} aria-labelledby="action-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }} className="op-action-confirm w-[calc(100%-2rem)] max-w-sm rounded-xl border bg-card p-6 text-foreground backdrop:bg-black/40">
    <form onSubmit={event => { event.preventDefault(); if (!busy && (!required || note.trim())) confirm(); }}>
      <h2 id="action-confirm-title" className="font-semibold">{action === 'ESCALATE' ? 'Eskalasi order' : `Konfirmasi ${labels[action]}`}</h2>
      <p className="my-3 text-sm">{action === 'REOPEN' ? 'Yakin ingin membuka kembali order ini?' : action === 'ESCALATE' ? 'Alasan dicatat dan dikirim melalui Courier. Order tetap PROSES CEK.' : 'Status berubah setelah backend berhasil memproses tindakan.'}</p>
      {action !== 'REOPEN' && <label className="op-action-fields">{label}<textarea aria-label={label} autoFocus maxLength={2000} required={required} disabled={busy} value={note} onChange={event => change(event.target.value)} /></label>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><Button type="button" disabled={busy} variant="outline" onClick={cancel}>Batal</Button><Button type="submit" variant={action === 'FAILED' ? 'destructive' : 'default'} disabled={busy || (required && !note.trim())}>{busy ? 'Menyimpan…' : action === 'ESCALATE' ? 'Kirim Eskalasi' : action === 'REOPEN' ? labels[action] : `Konfirmasi ${labels[action]}`}</Button></div>
    </form>
  </dialog>;
}
export default function Actions({ order, refresh, compact = false, escalationEnabled = false }: { order: Work; refresh: () => Promise<void>; compact?: boolean; escalationEnabled?: boolean }) {
  const { user } = useAuth();
  const account = String(user?.id);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(() => readPendingAction(account, order.id));
  const [draft, setDraft] = useState(() => readDraft(account, order.id));
  const [escalation, setEscalation] = useState('');
  const pending = useRef(false);
  const actions = user ? visibleActions(order, user) : [];
  const confirmationAllowed = !confirmation || actions.includes(confirmation);
  useEffect(() => {
    if (busy || confirmationAllowed) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) setConfirmation(null); });
    return () => { active = false; };
  }, [busy, confirmationAllowed]);
  function change(key: 'done' | 'failed', value: string) { const next = { ...draft, [key]: value }; setDraft(next); saveDraft(account, order.id, next); }
  async function submit(body: ActionPayload) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    savePendingAction(account, order.id, body);
    try {
      await request(`/orders/${order.id}/actions`, body);
      savePendingAction(account, order.id, null); setUncertain(null);
      if (['DONE', 'FAILED'].includes(body.action)) { removeDraft(order.id); setDraft({ done: '', failed: '' }); }
      if (body.action === 'ESCALATE') setEscalation('');
      setConfirmation(null);
      setNotice(body.action === 'ESCALATE' ? 'Eskalasi dicatat. Order tetap PROSES CEK; balasan masuk antrean Courier.' : 'Tindakan berhasil disimpan.');
      await Promise.allSettled([refresh()]);
    } catch (cause) {
      if ([400, 401, 403, 404, 409].includes((cause as { status?: number }).status || 0)) { savePendingAction(account, order.id, null); setUncertain(null); }
      else { setUncertain(body); setConfirmation(null); }
      if ([401, 403, 404, 409].includes((cause as { status?: number }).status || 0)) setConfirmation(null);
      setError(cause instanceof Error ? cause.message : 'Tindakan gagal'); await Promise.allSettled([refresh()]);
    } finally { pending.current = false; setBusy(false); }
  }
  const note = confirmation === 'DONE' ? draft.done : confirmation === 'FAILED' ? draft.failed : escalation;
  function act(action: string, confirmed = false) {
    if (pending.current || uncertain || !actions.includes(action) || (action === 'ESCALATE' && !escalationEnabled)) return;
    if (['DONE', 'FAILED', 'ESCALATE', 'REOPEN'].includes(action) && !confirmed) { setError(''); setConfirmation(action); return; }
    if (['FAILED', 'ESCALATE'].includes(action) && !note.trim()) return;
    const body: ActionPayload = { requestId: crypto.randomUUID(), version: order.version, action,
      ...(['DONE', 'FAILED', 'ESCALATE'].includes(action) ? { note: note.trim() } : {}),
      ...(['DONE', 'FAILED', 'REOPEN'].includes(action) ? { confirm: true } : {}),
    };
    void submit(body);
  }
  return <div className={compact ? 'space-y-1' : 'space-y-3'}>
    {!compact && (draft.done || draft.failed) && !actions.includes('DONE') && <p role="status" className="text-xs text-muted-foreground">Pemilik atau status order telah berubah. Draft tetap lokal dan tidak dikirim otomatis.</p>}
    <div className="flex flex-wrap gap-2">{actions.filter(action => !compact || !['DONE', 'FAILED', 'ESCALATE', 'REOPEN'].includes(action)).map(action => <Button key={action} size="sm" disabled={busy || Boolean(uncertain) || (action === 'ESCALATE' && !escalationEnabled)} variant={action === 'FAILED' ? 'destructive' : action === 'ESCALATE' || action === 'REJECT_DUPLICATE' ? 'outline' : 'default'} onClick={() => act(action)}>{labels[action]}</Button>)}</div>
    {!compact && actions.includes('ESCALATE') && !escalationEnabled && <p className="text-xs text-muted-foreground">ESKALASI memerlukan backend B2C terbaru. Tindakan belum tersedia pada server ini.</p>}
    {uncertain && <div role="alert" className="space-y-2 text-xs"><p>Hasil {labels[uncertain.action]} belum pasti. Periksa ulang dengan identitas permintaan yang sama agar tindakan tidak digandakan.</p><Button disabled={busy} variant="outline" onClick={() => void submit(uncertain)}>Periksa / ulangi {labels[uncertain.action]}</Button></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {confirmation && <Confirmation action={confirmation} note={note} error={error} busy={busy || Boolean(uncertain)} change={value => confirmation === 'DONE' ? change('done', value) : confirmation === 'FAILED' ? change('failed', value) : setEscalation(value)} confirm={() => act(confirmation, true)} cancel={() => setConfirmation(null)} />}
  </div>;
}
