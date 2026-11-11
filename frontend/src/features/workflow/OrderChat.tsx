import { useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useWorkData } from './hooks';
import { request } from './api';
import { readChatDraft, saveChatDraft, type PendingReply } from './chat-draft';
import { useUnsentChatWarning } from './unsent-chat';
import type { Work } from './model';
export type ChatMessage = { id: string; direction: string; text: string; userName: string; at: string; status: string; telegramMessageId: string | null; replyTo: string | null; attempts: number };

export default function OrderChat({ id, order, onChange, actions }: { id: string; order?: Work; onChange: () => Promise<void>; actions?: ReactNode }) {
  const { user } = useAuth();
  const account = String(user?.id);
  const [page, setPage] = useState(1), [text, setText] = useState(() => readChatDraft(account, id).text);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingReply | null>(() => readChatDraft(account, id).pending);
  const sending = useRef(false);
  const messages = useWorkData<{ data: ChatMessage[]; hasMore: boolean; routeActive?: boolean }>(`/chat/${id}/messages?page=${page}`, { page });
  const allowed = messages.data?.routeActive !== false && !messages.error && Boolean(messages.data) && ['HD', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && user?.username !== 'trial_yanto' && order?.status === 'IN_PROGRESS' && String(order.ownerId) === String(user?.id) && user?.modules?.includes(order.module);
  useUnsentChatWarning(text, busy);
  async function send() {
    if (!text.trim() || sending.current || !order || (!allowed && !pending)) return;
    sending.current = true; setBusy(true); setError(''); setNotice('');
    const body = pending && pending.text === text.trim() ? pending : { text: text.trim(), requestId: crypto.randomUUID(), version: order.version };
    setPending(body); saveChatDraft(account, id, { text, pending: body });
    try {
      await request(`/chat/${id}/messages`, body);
      setPending(null); saveChatDraft(account, id, { text: '', pending: null }); setText(''); setPage(1);
      setNotice('Pesan tersimpan dalam antrean Courier. Status pengiriman akan diperbarui.');
      await Promise.allSettled([messages.refresh(), onChange()]);
    } catch (cause) {
      if ([400, 401, 403, 404, 409].includes((cause as { status: number }).status)) { setPending(null); saveChatDraft(account, id, { text, pending: null }); }
      setError(cause instanceof Error ? cause.message : 'Pesan belum dapat dikirim'); await Promise.allSettled([onChange()]);
    } finally { sending.current = false; setBusy(false); }
  }
  return <section aria-label="Live chat order" className="op-order-chat">
    <div className="op-chat-history">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Live chat order</h3><p className="mt-1 text-xs text-muted-foreground">Balasan menuju pesan dan topic Telegram asli. ANTRE belum berarti terkirim.</p></div></div>
    {messages.loading && <p role="status" className="text-xs text-muted-foreground">{messages.data ? 'Memperbarui percakapan…' : 'Memuat percakapan…'}</p>}
    {messages.error && <div role="alert"><p>{messages.error}</p><Button variant="outline" onClick={() => void messages.refresh()}>Coba muat percakapan</Button></div>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={messages.loading || !messages.data?.hasMore} onClick={() => setPage(value => value + 1)}>Pesan lebih lama</Button><Button variant="outline" disabled={messages.loading || page <= 1} onClick={() => setPage(value => value - 1)}>Pesan lebih baru</Button></div>
    <ol className="op-chat-messages" aria-label="Pesan percakapan">{messages.data?.data.map(message => <li key={message.id} className={message.direction === 'OUT' ? 'op-chat-out' : 'op-chat-in'}><p className="text-xs font-semibold">{message.userName}</p><p className="whitespace-pre-wrap break-words text-sm">{message.text || '[Pesan dengan lampiran]'}</p><p className="mt-2 text-[10px] text-muted-foreground">{new Date(message.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB · {message.status}{message.attempts > 0 ? ` · percobaan ${message.attempts}` : ''}{message.replyTo ? ` · Reply ${message.replyTo}` : ' · Pesan order'}{message.telegramMessageId ? ` · Telegram #${message.telegramMessageId}` : ''}</p></li>)}</ol>
    {messages.data && !messages.data.data.length && <p className="text-sm text-muted-foreground">Belum ada pesan chat tersimpan untuk order ini.</p>}
    {messages.data?.routeActive === false && <p role="status">Grup nonaktif atau belum terverifikasi. Riwayat tetap tersedia; percakapan tidak dapat dilanjutkan.</p>}
    </div>
    <div className="op-chat-composer">
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="block text-sm">Balasan<textarea aria-label="Balasan" rows={3} maxLength={4096} disabled={!allowed || busy} className="mt-1 w-full rounded-lg border bg-background p-3" value={text} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault(); void send();
        }
      }} onChange={event => {
        // Unknown submissions keep their request identity until a confirmed result;
        // editing is possible once a definitive error clears pending.
        if (pending) return;
        setText(event.target.value); saveChatDraft(account, id, { text: event.target.value, pending: null });
      }} readOnly={Boolean(pending)} /></label>
      <p className="text-xs text-muted-foreground">Enter untuk kirim · Shift + Enter untuk baris baru</p>
      {text.trim() && <p className="text-xs text-muted-foreground">Draft belum dikirim · tersimpan khusus order ini pada tab ini.</p>}
      {pending && !busy && <p role="status" className="text-xs">Hasil pengiriman belum pasti. Kirim ulang memakai identitas permintaan yang sama; pesan tidak dikirim otomatis.</p>}
      {!allowed && <p className="text-xs text-muted-foreground">Hanya petugas berizin pemilik order PROSES CEK yang dapat membalas.</p>}
      <Button type="submit" disabled={(!allowed && !pending) || busy || !text.trim()}>{busy ? 'Menyimpan ke antrean…' : pending ? 'Periksa / ulangi balasan' : 'Kirim Balasan'}</Button>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p role="alert">{error} · Isi pesan dipertahankan untuk pengecekan.</p>}
    </form>
    {actions && <section aria-label="Tindakan pekerjaan" className="op-chat-action-bar">{actions}</section>}
    </div>
  </section>;
}
