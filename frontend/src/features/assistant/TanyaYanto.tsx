import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Bot, Grip, Minus, Send, Settings, X } from 'lucide-react';
import { tanyaRequest } from './api';
import TanyaSettings from './TanyaSettings';
import './tanya.css';

type Message = { role: 'user' | 'assistant'; content: string };
type Box = { x: number; y: number; width: number; height: number };
const fit = (box: Box) => {
  const width = Math.min(innerWidth - 16, Math.max(340, box.width));
  const height = Math.min(innerHeight - 16, Math.max(330, box.height));
  return { width, height, x: Math.max(8, Math.min(box.x, innerWidth - width - 8)), y: Math.max(8, Math.min(box.y, innerHeight - height - 8)) };
};

export default function TanyaYanto({ minimized, minimize, close, admin }: {
  minimized: boolean; minimize: () => void; close: () => void; admin: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [box, setBox] = useState<Box>();
  const panel = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<AbortController | null>(null);
  const gesture = useRef<{ type: 'move' | 'resize'; x: number; y: number; box: Box } | null>(null);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!minimized && !settings) input.current?.focus();
  }, [minimized, settings]);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messages, busy, minimized, settings]);
  useEffect(() => {
    const resize = () => setBox(value => value && fit(value));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function currentBox() {
    const bounds = panel.current?.getBoundingClientRect();
    return bounds && { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  }
  function start(event: PointerEvent<HTMLElement>, type: 'move' | 'resize') {
    if (!event.isPrimary || event.button !== 0 || !matchMedia('(min-width: 768px)').matches) return;
    const bounds = currentBox();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { type, box: bounds, x: event.clientX, y: event.clientY };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const value = gesture.current;
    if (!value) return;
    const dx = event.clientX - value.x, dy = event.clientY - value.y;
    const next = { ...value.box };
    if (value.type === 'move') { next.x += dx; next.y += dy; }
    else { next.width += dx; next.height += dy; }
    setBox(fit(next));
  }
  function keys(event: React.KeyboardEvent<HTMLElement>, type: 'move' | 'resize') {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    const offset = offsets[event.key], bounds = currentBox();
    if (!offset || !bounds) return;
    event.preventDefault();
    if (type === 'move') { bounds.x += offset[0]; bounds.y += offset[1]; }
    else { bounds.width += offset[0]; bounds.height += offset[1]; }
    setBox(fit(bounds));
  }
  async function send() {
    const question = draft.trim();
    if (!question || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const history = messages.slice(-6);
      while (history.length && new Blob([JSON.stringify({ question, history })]).size > 28 * 1024) history.splice(0, 2);
      const { answer } = await tanyaRequest<{answer: string}>('/chat', { question, history },
        controller.signal);
      setMessages(current => [...current, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: answer }].slice(-24));
      setDraft('');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Permintaan terlalu lama. Coba lagi.');
    } finally {
      if (!controller.signal.aborted) { setBusy(false); pending.current = null; }
    }
  }
  return <section hidden={minimized} ref={panel} role="dialog" aria-labelledby="tanya-title" className="tanya-panel"
    style={box ? { left: box.x, top: box.y, width: box.width, height: box.height, bottom: 'auto' } : undefined}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <header className="tanya-header">
      <button type="button" className="tanya-icon tanya-drag" aria-label="Geser jendela (tombol panah)" onPointerDown={event => start(event, 'move')}
        onPointerMove={move} onLostPointerCapture={() => { gesture.current = null; }} onKeyDown={event => keys(event, 'move')}><Grip /></button>
      <span className="tanya-avatar"><Bot aria-hidden /></span>
      <div className="tanya-heading"><h2 id="tanya-title">Tanya Yanto</h2><p>Asisten AI HD Work 2.0</p></div>
      {admin && <button type="button" className="tanya-icon" aria-label={settings ? 'Kembali ke chat' : 'Pengaturan Tanya Yanto'}
        aria-pressed={settings} onClick={() => setSettings(!settings)}><Settings /></button>}
      <button type="button" className="tanya-icon" aria-label="Minimalkan Tanya Yanto" onClick={minimize}><Minus /></button>
      <button type="button" className="tanya-icon" aria-label="Tutup Tanya Yanto" onClick={close}><X /></button>
    </header>
    {settings ? <TanyaSettings/> : <>
      <div className="tanya-history" ref={history} role="log" aria-label="Percakapan Tanya Yanto" tabIndex={0}>
        <p className="tanya-message" data-role="assistant">Halo! Ada yang bisa saya bantu?</p>
        {messages.map((message, index) => <p key={index} className="tanya-message" data-role={message.role}><span className="sr-only">{message.role === 'user' ? 'Anda: ' : 'Tanya Yanto: '}</span>{message.content}</p>)}
        {busy && <><p className="tanya-message" data-role="user">{draft}</p><p role="status" className="tanya-message" data-role="assistant">Sedang menjawab…</p></>}
      </div>
      <form className="tanya-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        {error && <p role="alert">{error}</p>}
        <div><textarea ref={input} rows={2} aria-label="Pertanyaan" placeholder="Tulis pertanyaan…" value={draft} maxLength={1800}
          readOnly={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
          }} /><button className="tanya-send" type="submit" aria-label="Kirim pertanyaan" disabled={busy || !draft.trim()}><Send size={20} /></button></div>
        <small>Pesan dikirim ke penyedia AI. Hindari data pelanggan dan kredensial.</small>
      </form>
    </>}
    <button type="button" className="tanya-resize" aria-label="Ubah ukuran jendela (tombol panah)" onPointerDown={event => start(event, 'resize')}
      onPointerMove={move} onLostPointerCapture={() => { gesture.current = null; }} onKeyDown={event => keys(event, 'resize')} />
  </section>;
}
