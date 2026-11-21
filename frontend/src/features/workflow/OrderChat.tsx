import { useEffect, useRef, useState, type ReactNode, type ChangeEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useWorkData } from './hooks';
import { cookieFetch } from '../operational/cookie-http';
import { operationsBase, request } from './api';
import { readChatDraft, saveChatDraft, type PendingReply } from './chat-draft';
import { useUnsentChatWarning } from './unsent-chat';
import type { Work } from './model';
import {saveCursor,validSequence} from './incoming-cursor';
export type ChatMessage = { id: string; sequence?:string; direction: string; text: string; userName: string; at: string; status: string; telegramMessageId: string | null; replyTo: string | null; attempts: number; hasPhoto?: boolean };

function ChatPhoto({ orderId, message }: { orderId: string; message: ChatMessage }) {
  const path = `/chat/${orderId}/messages/${message.id}/photo`;
  const src = operationsBase + path;
  const [thumb, setThumb] = useState<string | null>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    active.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  useEffect(() => {
    const button = previewButton.current;
    if (message.direction !== 'IN' || !button) return;
    const controller = new AbortController();
    let url: string | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        for (let attempt = 0; attempt < 6 && !controller.signal.aborted; attempt++) {
          const response = await cookieFetch(src + '?variant=thumb', { signal: controller.signal });
          if (response.status === 200) {
            const blob = await response.blob();
            if (!controller.signal.aborted) {
              url = URL.createObjectURL(blob);
              setThumb(url);
            }
            return;
          }
          if (response.status !== 202) return;
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      })().catch(() => { /* The full-photo action stays available. */ });
    });
    observer.observe(button);
    return () => {
      observer.disconnect();
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [message.direction, src]);

  function close() {
    active.current?.abort();
    active.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setFull(null);
    setError('');
  }

  async function openPhoto() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError('');
    if (!dialog.current?.open) dialog.current?.showModal();
    try {
      if (message.direction === 'IN') await request(path, {}, controller.signal);
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await cookieFetch(src, { signal: controller.signal });
        if (response.ok) {
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          objectUrl.current = url;
          setFull({ url, name: blob.type === 'image/png' ? 'foto.png' : 'foto.jpg' });
          return;
        }
        if (response.status !== 404 || message.direction !== 'IN') break;
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (controller.signal.aborted) return;
      }
      setError('Foto belum tersedia. Coba lagi.');
    } catch {
      if (!controller.signal.aborted) setError('Foto gagal diunduh. Coba lagi.');
    }
  }
  return <>
    <button ref={previewButton} type="button" className="mt-2 block rounded-lg border p-1.5 text-xs" aria-label="Buka foto percakapan" onClick={() => void openPhoto()}>
      {thumb
        ? <img src={thumb} alt="Thumbnail foto" width={96} height={72} className="h-[72px] w-24 rounded object-contain" />
        : 'Buka foto'}
    </button>
    <dialog ref={dialog} onClose={close} aria-label="Foto percakapan" className="m-auto max-h-[90dvh] max-w-[min(92vw,60rem)] overflow-auto rounded-xl border bg-card p-4 text-foreground backdrop:bg-black/70">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {full && <a className="text-sm text-primary underline" href={full.url} download={full.name}>Simpan gambar</a>}
        <Button size="sm" variant="outline" onClick={() => dialog.current?.close()}>Tutup</Button>
      </div>
      {full ? <img src={full.url} alt="Foto percakapan" className="max-h-[75dvh] max-w-full object-contain" />
        : error ? <div role="alert"><p>{error}</p><Button size="sm" className="mt-2" onClick={() => void openPhoto()}>Coba lagi</Button></div>
        : <p role="status">Mengunduh foto…</p>}
    </dialog>
  </>;
}

function SelectedPhoto({ file, remove }: { file: File; remove?: () => void }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = preview.current;
    if (!image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <li className="flex min-w-0 items-center gap-2 rounded border p-1.5">
    <img ref={preview} alt="" loading="lazy" width={40} height={40} className="size-10 rounded object-cover" />
    <span className="max-w-36 truncate" title={file.name}>{file.name}</span>
    {remove && <Button size="sm" type="button" variant="ghost" aria-label={`Hapus ${file.name}`} onClick={remove}>Hapus</Button>}
  </li>;
}

async function encodePhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OrderChat({ id, order, onChange, actions, originalMessage, hideHeading = false }: { id: string; order?: Work; onChange: () => Promise<void>; actions?: ReactNode; originalMessage?: string; hideHeading?: boolean }) {
  const { user } = useAuth();
  const account = String(user?.id);
  const [page, setPage] = useState(1), [text, setText] = useState(() => readChatDraft(account, id).text);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingReply | null>(() => readChatDraft(account, id).pending);
  const [files, setFiles] = useState<File[]>([]);
  const [asDocument, setAsDocument] = useState(false);
  const [photoPending, setPhotoPending] = useState<{ file: File; body: PendingReply } | null>(null);
  const sending = useRef(false);
  const messages = useWorkData<{ data: ChatMessage[]; hasMore: boolean; routeActive?: boolean; photosEnabled?: boolean }>(`/chat/${id}/messages?page=${page}`, { page });
  const allowed = messages.data?.routeActive !== false && !messages.error && Boolean(messages.data) && ['HD', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && user?.username !== 'trial_yanto' && order?.status === 'IN_PROGRESS' && String(order.ownerId) === String(user?.id) && user?.modules?.includes(order.module);
  const photosEnabled = messages.data?.photosEnabled === true;
  useUnsentChatWarning(text || (files.length ? 'Foto terlampir' : ''), busy);
  const originalIndex = messages.data?.data.findIndex(message => originalMessage && message.direction === 'IN' && !message.replyTo && !message.hasPhoto && message.text === originalMessage) ?? -1;
  const chatMessages = messages.data?.data.filter((_message, index) => index !== originalIndex);
  const history=useRef<HTMLOListElement>(null);
  const [cursorWarning,setCursorWarning]=useState(false);
  useEffect(()=>{
    if(messages.loading||messages.error||!messages.data||order?.status!=='IN_PROGRESS'||String(order.ownerId)!==account)return;
    const root=history.current;if(!root)return;
    const visible=new Set<Element>();
    const mark=()=>{if(document.visibilityState!=='visible'||document.querySelector('dialog[open]'))return;for(const element of visible){const sequence=element.getAttribute('data-incoming-sequence');if(validSequence(sequence)&&!saveCursor(account,id,sequence))setCursorWarning(true);}};
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);}mark();},{threshold:0.1});
    root.querySelectorAll('[data-incoming-sequence]').forEach(element=>observer.observe(element));
    document.addEventListener('visibilitychange',mark);
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',mark);};
  },[account,id,page,messages.data,messages.loading,messages.error,order?.status,order?.ownerId]);
  function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (selected.length + files.length > 10) {
      setError('Pilih maksimal 10 foto per kiriman.');
      return;
    }
    if (selected.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size)) {
      setError('Gunakan foto JPG atau PNG maksimal 5 MB per foto.');
      return;
    }
    setError('');
    setFiles([...files, ...selected]);
  }
  async function send() {
    if ((!text.trim() && !files.length) || (files.length && (!photosEnabled || text.trim().length > 1024)) ||
      sending.current || !order || (!allowed && !pending && !photoPending)) return;
    sending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (files.length) {
        let caption = text.trim();
        for (const [index, file] of files.entries()) {
          let attempt = photoPending?.file === file ? photoPending : null;
          if (!attempt) {
            const photo = await encodePhoto(file);
            attempt = { file, body: { text: caption, photo, asDocument, requestId: crypto.randomUUID(), version: order.version } };
          }
          setPhotoPending(attempt);
          await request(`/chat/${id}/photos`, attempt.body);
          setPhotoPending(null);
          setFiles(files.slice(index + 1));
          setPage(1);
          caption = '';
          setText('');
          saveChatDraft(account, id, { text: '', pending: null });
        }
      } else {
        const body = pending && pending.text === text.trim() ? pending : { text: text.trim(), requestId: crypto.randomUUID(), version: order.version };
        setPending(body); saveChatDraft(account, id, { text, pending: body });
        await request(`/chat/${id}/messages`, body);
        setPending(null); saveChatDraft(account, id, { text: '', pending: null }); setText('');
      }
      setPage(1);
      setNotice('Pesan tersimpan dalam antrean Courier. Status pengiriman akan diperbarui.');
    } catch (cause) {
      if ([400, 401, 403, 404, 409, 413, 507].includes((cause as { status: number }).status)) {
        setPhotoPending(null);
        setPending(null);
        if (!files.length) saveChatDraft(account, id, { text, pending: null });
      }
      setError(cause instanceof Error ? cause.message : 'Pesan belum dapat dikirim');
    } finally {
      await Promise.allSettled([messages.refresh(), onChange()]);
      sending.current = false; setBusy(false);
    }
  }
  return <section aria-label="Live chat order" className="op-order-chat">
    <div className="op-chat-history">
    {!hideHeading && <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Live chat order</h3><p className="mt-1 text-xs text-muted-foreground">Balasan menuju pesan dan topic Telegram asli. ANTRE menunggu giliran; MENGIRIM mencakup proses kirim atau menunggu ACK. TERKIRIM setelah backend mengonfirmasi.</p></div></div>}
    {messages.loading && <p role="status" className="text-xs text-muted-foreground">{messages.data ? 'Memperbarui percakapan…' : 'Memuat percakapan…'}</p>}
    {messages.error && <div role="alert"><p>{messages.error}</p><Button variant="outline" onClick={() => void messages.refresh()}>Coba muat percakapan</Button></div>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={messages.loading || !messages.data?.hasMore} onClick={() => setPage(value => value + 1)}>Pesan lebih lama</Button><Button variant="outline" disabled={messages.loading || page <= 1} onClick={() => setPage(value => value - 1)}>Pesan lebih baru</Button></div>
    <ol ref={history} className="op-chat-messages" aria-label="Pesan percakapan">{chatMessages?.map(message => <li key={message.id} data-incoming-sequence={message.direction==='IN'&&message.replyTo?message.sequence:undefined} className={message.direction === 'OUT' ? 'op-chat-out' : 'op-chat-in'}><p className="text-xs font-semibold">{message.userName}</p><p className="whitespace-pre-wrap break-words text-sm">{message.text || (!message.hasPhoto && '[Pesan dengan lampiran]')}</p>{message.hasPhoto && <ChatPhoto orderId={id} message={message} />}<p className="mt-2 text-[10px] text-muted-foreground">{new Date(message.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB · {message.status}{message.attempts > 0 ? ` · percobaan ${message.attempts}` : ''}{message.replyTo ? ` · Reply ${message.replyTo}` : ' · Pesan order'}{message.telegramMessageId ? ` · Telegram #${message.telegramMessageId}` : ''}</p></li>)}</ol>
    {cursorWarning&&<p role="status" className="text-xs">Status baca hanya tersimpan selama sesi ini karena penyimpanan browser tidak tersedia.</p>}
    {messages.data && !chatMessages?.length && <p className="text-sm text-muted-foreground">Belum ada pesan chat tersimpan untuk order ini.</p>}
    {messages.data?.routeActive === false && <p role="status">Grup nonaktif atau belum terverifikasi. Riwayat tetap tersedia; percakapan tidak dapat dilanjutkan.</p>}
    </div>
    <div className="op-chat-composer">
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="block text-sm">Balasan<textarea aria-label="Balasan" rows={2} maxLength={files.length ? 1024 : 4096} disabled={!allowed || busy} className="mt-1 w-full rounded-lg border bg-background p-3" value={text} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault(); void send();
        }
      }} onChange={event => {
        // Unknown submissions keep their request identity until a confirmed result;
        // editing is possible once a definitive error clears pending.
        if (pending || photoPending) return;
        setText(event.target.value); saveChatDraft(account, id, { text: event.target.value, pending: null });
      }} readOnly={Boolean(pending || photoPending)} /></label>
      {photosEnabled && <div className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border px-3 font-medium has-[:focus-visible]:outline-2 has-[:disabled]:opacity-50">
            Pilih foto
            <input type="file" aria-label="Pilih foto" accept="image/jpeg,image/png" multiple className="sr-only" disabled={!allowed || busy || Boolean(pending || photoPending)} onChange={selectPhotos} />
          </label>
          <span>JPG/PNG · 5 MB per foto</span>
          {files.length > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={asDocument} disabled={busy || Boolean(photoPending)} onChange={event => setAsDocument(event.target.checked)} /> Kirim sebagai file asli</label>}
        </div>
        {files.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Foto terpilih">{files.map((file, index) =>
          <SelectedPhoto key={`${file.name}:${file.lastModified}:${index}`} file={file} remove={!busy && !photoPending ? () => setFiles(files.filter((_item, i) => i !== index)) : undefined} />
        )}</ul>}
      </div>}
      {files.length > 0 && text.trim().length > 1024 && <p role="alert" className="text-xs text-destructive">Caption foto maksimal 1.024 karakter.</p>}
      <p className="text-xs text-muted-foreground">Enter untuk kirim · Shift + Enter untuk baris baru</p>
      {text.trim() && <p className="text-xs text-muted-foreground">Draft belum dikirim · tersimpan khusus order ini pada tab ini.</p>}
      {(pending || photoPending) && !busy && <p role="status" className="text-xs">Hasil pengiriman belum pasti. Kirim ulang memakai identitas permintaan yang sama; pesan tidak dikirim otomatis.</p>}
      {photoPending && !busy && <Button type="button" size="sm" variant="outline" onClick={() => {
        setPhotoPending(null); setFiles([]); setText(''); setError('');
        saveChatDraft(account, id, { text: '', pending: null });
        setNotice('Lampiran dilepas dari draft. Jika sudah masuk antrean, statusnya tampil di riwayat chat.');
        void messages.refresh();
      }}>Lanjut tanpa lampiran</Button>}
      {!allowed && <p className="text-xs text-muted-foreground">Hanya petugas berizin pemilik order PROSES CEK yang dapat membalas.</p>}
      <Button type="submit" disabled={(!allowed && !pending && !photoPending) || busy || (!text.trim() && !files.length) || (files.length > 0 && (!photosEnabled || text.trim().length > 1024))}>{busy ? 'Menyimpan ke antrean…' : pending || photoPending ? 'Periksa / ulangi balasan' : files.length ? `Kirim ${files.length} foto` : 'Kirim Balasan'}</Button>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p role="alert">{error} · Isi pesan dipertahankan untuk pengecekan.</p>}
    </form>
    {actions && <section aria-label="Tindakan pekerjaan" className="op-chat-action-bar">{actions}</section>}
    </div>
  </section>;
}
