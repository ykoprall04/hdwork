import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { loginRequest } from '@/services/auth.service';
export default function Login() {
  const { login } = useAuth(); const navigate = useNavigate();
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const result = await loginRequest({ username: username.trim(), password });
      if (!result.success || !result.data?.token || !result.data.user) throw new Error('Respons login tidak valid');
      login(result.data.token, result.data.user); setPassword(''); navigate('/jobs', { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Login gagal'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-muted/40 p-4 sm:p-8"><header className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/login" className="font-semibold">HD Work <span className="text-primary">2.0</span></Link><ThemeToggle compact /></header><main className="mx-auto grid max-w-6xl items-center gap-10 py-10 lg:min-h-[80vh] lg:grid-cols-2"><div><span className="text-xs font-semibold tracking-[.2em] text-primary">OPERATIONS, REIMAGINED.</span><h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Satu workspace.<br />Setiap pekerjaan<br /><span className="text-primary">lebih terarah.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">Pilih pekerjaan, kendalikan antrean, dan kolaborasikan pengecekan dalam satu ruang kerja modern.</p><div className="mt-8 flex items-start gap-3 rounded-xl border bg-card p-5"><ShieldCheck className="size-6 shrink-0 text-primary" /><p className="text-xs leading-6 text-muted-foreground">Workspace operasional · sesi diverifikasi melalui API. TIAL tersedia read-only sesuai hak akses.</p></div><Link to="/preview/login" className="mt-6 inline-flex items-center gap-2 text-sm text-primary">Buka lingkungan DEMO <ArrowRight className="size-4" /></Link></div><section className="rounded-xl border bg-card p-6 shadow-sm"><h2 className="text-xl font-semibold">Selamat datang kembali</h2><p className="mt-2 text-sm text-muted-foreground">Masuk dengan akun HD Work 2.0.</p><form className="mt-6 space-y-4" onSubmit={event => { void submit(event); }}><label className="block text-sm">Username<input required autoComplete="username" className="mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2" value={username} onChange={event => setUsername(event.target.value)} /></label><label className="block text-sm">Password<input required autoComplete="current-password" type="password" className="mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full" type="submit">{busy ? 'Memverifikasi…' : 'Masuk workspace'}<ArrowRight /></Button></form><p className="mt-4 text-xs text-muted-foreground">Registrasi mandiri belum tersedia.</p></section></main></div>;
}
