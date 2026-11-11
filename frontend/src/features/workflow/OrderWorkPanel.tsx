import { useEffect, useRef } from 'react';
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

export default function OrderWorkPanel({ id, orders, onSelect, onClose, onChange }: { id: string; orders: Work[]; onSelect: (id: string) => void; onClose: () => void; onChange: () => Promise<void> }) {
  const panel = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const detail = useWorkData<Detail>(`/orders/${id}`);
  const position = orders.findIndex(order => order.id === id);
  const order = detail.data?.data;
  const requestClose = () => { if (confirmChatNavigation()) onClose(); };
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
  return <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="order-panel-heading" className="op-work-panel">
    <header className="op-work-panel-header"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Ruang kerja · {order?.module || 'Order'}</p><h2 id="order-panel-heading" className="mt-1 truncate text-lg font-semibold">{order?.scIn || order?.inetMasked || 'Detail pekerjaan'}</h2></div><Button variant="ghost" className="min-h-11 min-w-11" size="icon" aria-label="Tutup panel order" onClick={requestClose}><X /></Button>
      <nav aria-label="Pindah order" className="flex w-full items-center justify-between gap-2"><Button variant="outline" disabled={position <= 0} onClick={() => move(position - 1)}><ArrowLeft />Order sebelumnya</Button><span className="text-xs text-muted-foreground">{position < 0 ? 'Order terpilih' : `${position + 1} / ${orders.length}`}</span><Button variant="outline" disabled={position < 0 || position >= orders.length - 1} onClick={() => move(position + 1)}>Order berikutnya<ArrowRight /></Button></nav>
    </header>
    <div className="op-work-panel-content">
      {detail.loading && !order && <p role="status">Memuat detail pekerjaan…</p>}
      {detail.error && <div role="alert"><p>{detail.error}</p><Button variant="outline" onClick={() => void detail.refresh()}>Coba muat detail</Button></div>}
      {order && <><div className="op-panel-summary"><div className="flex flex-wrap items-center gap-3"><WorkStatusBadge status={order.status} decision={order.decision} /><span className="text-xs text-muted-foreground">Petugas: {order.ownerName || 'Belum PICK'}</span></div>
        <section aria-label="Pesan asli Telegram" className="op-original-message"><h3 className="mb-3 font-semibold">Pesan asli Telegram</h3><p className="whitespace-pre-wrap break-words text-sm">{detail.data?.originalMessage || detail.data?.requestText || 'Pesan asli belum tersedia dari API.'}</p></section>
        <FeedbackStatus feedback={order.feedback} />
        <Link className="text-sm text-primary underline" to={`/orders/${id}`}>Buka halaman detail lengkap</Link>
        </div>
        {import.meta.env.VITE_HDWORK2_LIVE_CHAT === 'true' ? <OrderChat key={`${user?.id}:${id}`} id={id} order={detail.error ? undefined : order} onChange={refresh} actions={detail.error ? <p>Detail belum terverifikasi. Muat ulang sebelum melakukan tindakan.</p> : <Actions key={`${user?.id}:${id}`} order={order} refresh={refresh} escalationEnabled={detail.data?.capabilities?.escalate===true} />} /> : <><p>Live chat belum diaktifkan pada build ini.</p>{!detail.error && <Actions key={`${user?.id}:${id}`} order={order} refresh={refresh} escalationEnabled={detail.data?.capabilities?.escalate===true}/>}</>}

      </>}
    </div>
  </aside>;
}
