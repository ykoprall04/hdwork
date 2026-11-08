import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Section } from '../operations/components';
import { request } from './api';

export default function NewOrder({ modules }: { modules: string[] }) {
  const { user } = useAuth(), navigate = useNavigate();
  const [module, setModule] = useState(modules[0] || '');
  const [reference, setReference] = useState(''), [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), retry = useRef<{ payload: string; id: string } | null>(null);
  if (!user || !['SUPER_ADMIN', 'ADMIN', 'HD'].includes(user.role) || !modules.length) return null;
  const selected = modules.includes(module) ? module : modules[0];
  const field = 'mt-1 block w-full rounded-lg border bg-background p-2 text-sm';
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const payload = JSON.stringify({ module: selected, reference, description });
    if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await request<{ id: string }>('/orders', { requestId: retry.current!.id, module: selected, reference, description });
      navigate(`/orders/${result.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Order belum dapat dibuat'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Section title="Buat order" description="Order manual tersimpan di workspace yang dipilih."><form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <label>Modul<select className={field} value={selected} onChange={e => setModule(e.target.value)}>{modules.map(m => <option key={m}>{m}</option>)}</select></label>
    <label>Referensi order<input required maxLength={100} className={field} value={reference} onChange={e => setReference(e.target.value)} /></label>
    <label className="sm:col-span-2">Deskripsi pekerjaan<textarea required maxLength={4000} className={field} value={description} onChange={e => setDescription(e.target.value)} /></label>
    {error && <p role="alert" className="sm:col-span-2">{error}</p>}<Button disabled={busy} type="submit">{busy ? 'Menyimpan…' : 'Simpan order'}</Button>
  </form></Section>;
}
