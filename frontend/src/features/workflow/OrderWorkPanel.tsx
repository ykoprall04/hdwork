import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useWorkData } from './hooks';
import { type Detail, type Work } from './model';
import Actions from './Actions';
import OrderChat from './OrderChat';
import WorkStatusBadge from './WorkStatusBadge';
import { FeedbackStatus } from './OperationalStatus';
import { confirmChatNavigation } from './unsent-chat';
import HdNote from './HdNote';
import FormatVlanButton from './FormatVlanButton';

function OriginalTelegramMessage({ text, embedded, compactWorkflow }: { text: string; embedded: boolean; compactWorkflow: boolean }) {
  const originalMessage = useRef<HTMLElement>(null);
  const messageText = useRef<HTMLParagraphElement>(null);
  const originalMessageId = useId();
  const drag = useRef<{ pointer: number; startY: number; height: number } | null>(null);
  const [originalHeight, setOriginalHeight] = useState<number>();
  const [measuredHeight, setMeasuredHeight] = useState(96);
  useEffect(() => {
    const element = originalMessage.current;
    if (!element || !compactWorkflow) return;
    const observer = new ResizeObserver(() => setMeasuredHeight(Math.round(element.getBoundingClientRect().height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [compactWorkflow]);
  const minHeight = 44;
  const maxHeight = () => Math.max(minHeight, Math.min(320, Math.floor(window.innerHeight * 0.36)));
  function resizeOriginal(height: number) {
    setOriginalHeight(Math.round(Math.max(minHeight, Math.min(maxHeight(), height))));
  }
  return (
    <div>
      <section id={originalMessageId} ref={originalMessage} aria-label="Pesan asli Telegram" className="op-original-message"
        tabIndex={compactWorkflow ? 0 : undefined}
        onKeyDown={compactWorkflow ? event => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a' || !messageText.current) return;
          const selection = window.getSelection();
          if (!selection) return;
          event.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(messageText.current);
          selection.removeAllRanges();
          selection.addRange(range);
        } : undefined}
        data-resized={(embedded || compactWorkflow) && originalHeight !== undefined}
        style={(embedded || compactWorkflow) && originalHeight !== undefined ? { height: originalHeight } : undefined}>
        {!embedded && <h3 className="mb-3 font-semibold">Pesan asli Telegram</h3>}
        <p ref={messageText} className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{text}</p>
      </section>
      {(embedded || compactWorkflow) && <div role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Atur tinggi panel order"
        aria-controls={originalMessageId} aria-valuemin={minHeight} aria-valuemax={maxHeight()} aria-valuenow={Math.min(originalHeight ?? measuredHeight, maxHeight())}
        className="op-original-message-resize"
        title="Tarik ke atas atau ke bawah"
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary || !originalMessage.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointer: event.pointerId, startY: event.clientY, height: originalMessage.current.getBoundingClientRect().height };
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (start?.pointer === event.pointerId) resizeOriginal(start.height + event.clientY - start.startY);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          const current = originalMessage.current?.getBoundingClientRect().height ?? 96;
          switch (event.key) {
            case 'ArrowUp': resizeOriginal(current - 16); break;
            case 'ArrowDown': resizeOriginal(current + 16); break;
            case 'Home': resizeOriginal(minHeight); break;
            case 'End': resizeOriginal(maxHeight()); break;
            default: return;
          }
          event.preventDefault();
        }} />}
    </div>
  );
}

export default function OrderWorkPanel({ id, orders, onSelect, onClose, onChange, embedded = false, compactWorkflow = false, onMobileBack }: { id: string; orders: Work[]; onSelect: (id: string) => void; onClose: () => void; onChange: () => Promise<void>; embedded?: boolean; compactWorkflow?: boolean; onMobileBack?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const detail = useWorkData<Detail>(`/orders/${id}`);
  const position = orders.findIndex(order => order.id === id);
  const order = detail.data?.data;
  const requestClose = () => { if (confirmChatNavigation()) onClose(); };
  const requestMobileBack = () => { if (confirmChatNavigation()) onMobileBack?.(); };
  useEffect(() => { panel.current?.focus(); }, [id]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && panel.current?.contains(document.activeElement) && !document.querySelector('dialog[open]')) { event.preventDefault(); if (confirmChatNavigation()) onClose(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  async function refresh() { await Promise.all([detail.refresh(), onChange()]); }
  function move(index: number) { if (orders[index] && confirmChatNavigation()) onSelect(orders[index].id); }
  return <aside ref={panel} data-workflow-detail={compactWorkflow || undefined} tabIndex={-1} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'false'} aria-labelledby="order-panel-heading" className={embedded ? 'op-work-panel op-process-detail' : 'op-work-panel'}>
    <header className="op-work-panel-header">{embedded ? <><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h2 id="order-panel-heading" className="text-sm font-semibold">Detail Pekerjaan</h2>{order && <WorkStatusBadge status={order.status} decision={order.decision}/>}</div><div className="flex items-center gap-1"><FormatVlanButton key={`${user?.id}:${id}`} id={id} command={order?.command} disabled={!!detail.error}/><Button variant="ghost" className="min-h-11 min-w-11 md:hidden" size="icon" aria-label="Kembali ke daftar pekerjaan" onClick={requestMobileBack}><ArrowLeft/></Button><Button variant="ghost" className="min-h-11 min-w-11" size="icon" aria-label="Tutup ruang kerja" onClick={requestClose}><X /></Button></div></> : <><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Ruang kerja · {order?.module || 'Order'}</p><h2 id="order-panel-heading" className="mt-1 truncate text-lg font-semibold">{order?.scIn || order?.inetMasked || 'Detail pekerjaan'}</h2></div><FormatVlanButton key={`${user?.id}:${id}`} id={id} command={order?.command} disabled={!!detail.error}/><Button variant="ghost" className="min-h-11 min-w-11" size="icon" aria-label="Tutup panel order" onClick={requestClose}><X /></Button>
      <nav aria-label="Pindah order" className="flex w-full items-center justify-between gap-2"><Button variant="outline" disabled={position <= 0} onClick={() => move(position - 1)}><ArrowLeft />Order sebelumnya</Button><span className="text-xs text-muted-foreground">{position < 0 ? 'Order terpilih' : `${position + 1} / ${orders.length}`}</span><Button variant="outline" disabled={position < 0 || position >= orders.length - 1} onClick={() => move(position + 1)}>Order berikutnya<ArrowRight /></Button></nav></>}
    </header>
    <div className="op-work-panel-content">
      {detail.loading && !order && <p role="status">Memuat detail pekerjaan…</p>}
      {detail.error && <div role="alert"><p>{detail.error}</p><Button variant="outline" onClick={() => void detail.refresh()}>Coba muat detail</Button></div>}
      {order && <><div className="op-panel-summary">{!embedded && <div className="flex flex-wrap items-center gap-3"><WorkStatusBadge status={order.status} decision={order.decision} /><span className="text-xs text-muted-foreground">Petugas: {order.ownerName || 'Belum PICK'}</span></div>}
        <OriginalTelegramMessage key={id} embedded={embedded} compactWorkflow={compactWorkflow} text={detail.data?.originalMessage || detail.data?.requestText || 'Pesan asli belum tersedia dari API.'} />
        <FeedbackStatus feedback={order.feedback} />
        {user?.role==='HD'&&user.username!=='trial_yanto'&&<HdNote key={`${user.id}:${id}`} order={order} verified={!detail.error} compact={compactWorkflow}/>}
        {!embedded && <Link className="text-sm text-primary underline" to={`/orders/${id}`}>Buka halaman detail lengkap</Link>}
        </div>
        {import.meta.env.VITE_HDWORK2_LIVE_CHAT === 'true' ? <OrderChat key={`${user?.id}:${id}`} id={id} order={detail.error ? undefined : order} onChange={refresh} originalMessage={detail.data?.originalMessage||detail.data?.requestText||undefined} hideHeading={embedded} scrollHistory={compactWorkflow} actions={detail.error ? <p>Detail belum terverifikasi. Muat ulang sebelum melakukan tindakan.</p> : <Actions key={`${user?.id}:${id}`} order={order} refresh={refresh} escalationEnabled={detail.data?.capabilities?.escalate===true} />} /> : <><p>Live chat belum diaktifkan pada build ini.</p>{!detail.error && <Actions key={`${user?.id}:${id}`} order={order} refresh={refresh} escalationEnabled={detail.data?.capabilities?.escalate===true}/>}</>}

      </>}
    </div>
  </aside>;
}
