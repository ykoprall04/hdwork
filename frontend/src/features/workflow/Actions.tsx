import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { request } from './api';
import { visibleActions, labels, type Work } from './model';
import { readDraft, saveDraft, removeDraft } from './drafts';
import { readPendingAction, savePendingAction, type ActionPayload } from './pending-action';

function Confirmation({ body, busy, confirm, cancel }: { body: ActionPayload; busy: boolean; confirm: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="action-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }} className="op-action-confirm max-w-sm rounded-xl border bg-card p-6 text-foreground backdrop:bg-black/40">
    <h2 id="action-confirm-title" className="font-semibold">Konfirmasi {labels[body.action]}</h2>
    <p className="mt-3 text-sm">{body.action === 'REOPEN' ? 'Yakin ingin membuka kembali order ini?' : `Yakin menandai order ini sebagai ${labels[body.action]}? Tindakan akan dicatat dan balasan masuk antrean Telegram.`}</p>
    {body.note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{body.note}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={confirm}>{busy ? 'Menyimpan…' : labels[body.action]}</Button><Button disabled={busy} variant="outline" autoFocus onClick={cancel}>BATAL</Button></div>
  </dialog>;
}
export default function Actions({ order, refresh, compact = false, escalationEnabled = false }: { order: Work; refresh: () => Promise<void>; compact?: boolean; escalationEnabled?: boolean }) {
  const { user } = useAuth();
  const account = String(user?.id);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<ActionPayload | null>(null);
  const [uncertain, setUncertain] = useState(() => readPendingAction(account, order.id));
  const [draft, setDraft] = useState(() => readDraft(account, order.id));
  const [escalation, setEscalation] = useState('');
  const pending = useRef(false);
  const actions = user ? visibleActions(order, user) : [];
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
      setNotice(body.action === 'ESCALATE' ? 'Eskalasi dicatat. Order tetap PROSES CEK; balasan masuk antrean Courier.' : 'Tindakan berhasil disimpan.');
      await refresh();
    } catch (cause) {
      if ([400, 401, 403, 404, 409].includes((cause as { status?: number }).status || 0)) { savePendingAction(account, order.id, null); setUncertain(null); }
      else setUncertain(body);
      setError(cause instanceof Error ? cause.message : 'Tindakan gagal'); await refresh();
    } finally { pending.current = false; setBusy(false); setConfirmation(null); }
  }
  function act(action: string) {
    if (pending.current || uncertain || (action === 'ESCALATE' && !escalationEnabled)) return;
    const note = action === 'DONE' ? draft.done : action === 'FAILED' ? draft.failed : escalation;
    if (['FAILED', 'ESCALATE'].includes(action) && !note.trim()) return;
    const body: ActionPayload = { requestId: crypto.randomUUID(), version: order.version, action,
      ...(['DONE', 'FAILED', 'ESCALATE'].includes(action) ? { note } : {}),
      ...(['DONE', 'FAILED', 'REOPEN'].includes(action) ? { confirm: true } : {}),
    };
    if (['DONE', 'FAILED', 'REOPEN'].includes(action)) setConfirmation(body); else void submit(body);
  }
  return <div className={compact ? 'space-y-1' : 'space-y-3'}>
    {!compact && actions.includes('DONE') && <div className="op-action-fields">
      <label>Catatan DONE (opsional)<textarea aria-label="Catatan DONE" maxLength={2000} disabled={busy || Boolean(uncertain)} value={draft.done} onChange={event => change('done', event.target.value)} /></label>
      <label>Alasan ESKALASI (wajib)<textarea aria-label="Alasan ESKALASI" maxLength={2000} disabled={busy || Boolean(uncertain) || !escalationEnabled} value={escalation} onChange={event => setEscalation(event.target.value)} /></label>
      <label>Alasan GAGAL (wajib)<textarea aria-label="Alasan GAGAL" maxLength={2000} disabled={busy || Boolean(uncertain)} value={draft.failed} onChange={event => change('failed', event.target.value)} /></label>
    </div>}
    {!compact && (draft.done || draft.failed) && !actions.includes('DONE') && <p role="status" className="text-xs text-muted-foreground">Pemilik atau status order telah berubah. Draft tetap lokal dan tidak dikirim otomatis.</p>}
    <div className="flex flex-wrap gap-2">{actions.filter(action => !compact || !['DONE', 'FAILED', 'ESCALATE', 'REOPEN'].includes(action)).map(action => <Button key={action} size="sm" disabled={busy || Boolean(uncertain) || (action === 'FAILED' && !draft.failed.trim()) || (action === 'ESCALATE' && (!escalation.trim() || !escalationEnabled))} variant={action === 'FAILED' ? 'destructive' : action === 'ESCALATE' || action === 'REJECT_DUPLICATE' ? 'outline' : 'default'} onClick={() => act(action)}>{labels[action]}</Button>)}</div>
    {!compact && actions.includes('ESCALATE') && !escalationEnabled && <p className="text-xs text-muted-foreground">ESKALASI memerlukan backend B2C terbaru. Tindakan belum tersedia pada server ini.</p>}
    {uncertain && <div role="alert" className="space-y-2 text-xs"><p>Hasil {labels[uncertain.action]} belum pasti. Periksa ulang dengan identitas permintaan yang sama agar tindakan tidak digandakan.</p><Button disabled={busy} variant="outline" onClick={() => void submit(uncertain)}>Periksa / ulangi {labels[uncertain.action]}</Button></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {confirmation && <Confirmation body={confirmation} busy={busy} confirm={() => void submit(confirmation)} cancel={() => setConfirmation(null)} />}
  </div>;
}
