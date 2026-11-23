import { useEffect, useState } from 'react';
import { tanyaRequest } from './api';

type Article = { id?: string; title: string; tags: string; text: string; roles: string[]; modules: string[]; published: boolean };
type State = { baseUrl: string; model: string; enabled: boolean; keyConfigured: boolean; articles: Pick<Article, 'id' | 'title' | 'published'>[]; backupAvailable: boolean };
const blank: Article = { title: '', tags: '', text: '', roles: ['HD'], modules: [], published: false };

export default function TanyaSettings() {
  const [state, setState] = useState<State>();
  const [key, setKey] = useState('');
  const [item, setItem] = useState<Article>();
  const [models, setModels] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    tanyaRequest<State>('/settings', undefined, controller.signal).then(setState).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [reload]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Pengaturan belum dapat diproses.'); }
    finally { setBusy(false); }
  }
  if (!state) return <div className="tanya-settings">{error ? <><p role="alert">{error}</p><button onClick={() => { setError(''); setReload(value => value + 1); }}>Coba lagi</button><button disabled={busy} onClick={() => { if (window.confirm('Pulihkan data dari backup server?')) void run(async () => {
    setState(await tanyaRequest<State>('/restore', {})); setNotice('Backup dipulihkan.');
  }); }}>Pulihkan backup</button></> : <p role="status">Memuat pengaturan…</p>}</div>;
  return <div className="tanya-settings">
    <h3>Pengaturan penyedia AI</h3>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy}>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const { baseUrl, enabled, model } = state;
        setState(await tanyaRequest<State>('/settings', { baseUrl, enabled, model, apiKey: key }));
        setKey(''); setNotice('Pengaturan tersimpan.');
      }); }}>
        <label>Base URL<input type="url" required value={state.baseUrl} onChange={event => setState({ ...state, baseUrl: event.target.value })}/></label>
        <label>API Key<input type="password" autoComplete="off" placeholder={state.keyConfigured ? 'Tersimpan · isi untuk mengganti' : 'Masukkan API key'} value={key} onChange={event => setKey(event.target.value)}/></label>
        <label>ID model<input placeholder="Masukkan ID model" value={state.model} onChange={event => setState({ ...state, model: event.target.value })}/></label>
        {models.length > 0 && <label>Pilih dari daftar penyedia<select value={models.includes(state.model) ? state.model : ''} onChange={event => setState({ ...state, model: event.target.value })}>
          <option value="">Pilih model…</option>{models.map(model => <option value={model} key={model}>{model}</option>)}
        </select></label>}
        <label className="tanya-check"><input type="checkbox" checked={state.enabled} onChange={event => setState({ ...state, enabled: event.target.checked })}/> Aktifkan Tanya Yanto</label>
        <button type="submit">Simpan pengaturan</button>
        <button type="button" onClick={() => void run(async () => {
          const result = await tanyaRequest<{ models: string[]; modelVerified: boolean }>('/test', {});
          if (!result.modelVerified) setModels(result.models);
          setNotice(result.modelVerified ? 'Model berhasil mengembalikan jawaban teks.' : result.models.length ? `${result.models.length} ID model diterima. Pilih dan simpan model, lalu uji lagi.` : 'Daftar model kosong. Masukkan ID model secara manual.');
        })}>Uji konfigurasi tersimpan</button>
      </form>
      <h3>Knowledge Base</h3>
      <label>Artikel<select value={item?.id ?? ''} onChange={event => {
        const id = event.target.value;
        if (!id) setItem(undefined);
        else void run(async () => setItem(await tanyaRequest<Article>('/articles/' + encodeURIComponent(id))));
      }}>
        <option value="">Pilih artikel</option>{state.articles.map(article => <option value={article.id} key={article.id}>{article.title} · {article.published ? 'Terbit' : 'Draf'}</option>)}</select></label>
      <button type="button" onClick={() => setItem({ ...blank })}>Tambah artikel</button>
      {item && <form onSubmit={event => { event.preventDefault(); void run(async () => {
        setState(await tanyaRequest<State>('/articles', { ...item, operation: 'save' }));
        setItem(undefined); setNotice('Artikel tersimpan.');
      }); }}>
        <label>Judul<input required maxLength={120} value={item.title} onChange={event => setItem({ ...item, title: event.target.value })}/></label>
        <label>Tag<input maxLength={300} value={item.tags} onChange={event => setItem({ ...item, tags: event.target.value })}/></label>
        <label>Isi artikel<textarea rows={5} required maxLength={3500} value={item.text} onChange={event => setItem({ ...item, text: event.target.value })}/></label>
        <label>Role<select multiple value={item.roles} onChange={event => setItem({ ...item, roles: Array.from(event.target.selectedOptions, option => option.value) })}>
          {['HD', 'ADMIN', 'SUPER_ADMIN'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Modul (kosong untuk semua)<select multiple value={item.modules} onChange={event => setItem({ ...item, modules: Array.from(event.target.selectedOptions, option => option.value) })}>
          {['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO', 'ASSUREN', 'B2B', 'REPLACEMENT'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="tanya-check"><input type="checkbox" checked={item.published} onChange={event => setItem({ ...item, published: event.target.checked })}/> Terbitkan</label>
        <button type="submit">Simpan artikel</button>
        {item.id && <button type="button" onClick={() => { if (window.confirm('Hapus artikel ini?')) void run(async () => {
          setState(await tanyaRequest<State>('/articles', { id: item.id, operation: 'delete' }));
          setItem(undefined); setNotice('Artikel dihapus.');
        }); }}>Hapus artikel</button>}
      </form>}
      <h3>Backup dan pemulihan</h3>
      <p>Backup tersimpan terenkripsi di server dan mencakup konfigurasi serta artikel.</p>
      <button type="button" onClick={() => { if (!state.backupAvailable || window.confirm('Ganti backup yang tersimpan?')) void run(async () => {
        await tanyaRequest('/backup', {}); setState({ ...state, backupAvailable: true }); setNotice('Backup tersimpan.');
      }); }}>Buat backup</button>
      <button type="button" disabled={!state.backupAvailable} onClick={() => { if (window.confirm('Pulihkan konfigurasi dan artikel dari backup?')) void run(async () => {
        setState(await tanyaRequest<State>('/restore', {})); setKey(''); setItem(undefined); setModels([]); setNotice('Backup dipulihkan.');
      }); }}>Pulihkan backup</button>
    </fieldset>
  </div>;
}
