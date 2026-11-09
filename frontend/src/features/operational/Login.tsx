import {cookieMode,cookieFetch,setCsrf} from './cookie-http';
import {API_URL} from '@/config/api';
import AuthLayout from '../workspace-ui/AuthLayout';
import { Section } from '../operations/components';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { loginRequest } from '@/services/auth.service';
export default function Login() {
  const { login } = useAuth(); const navigate = useNavigate();
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if(cookieMode){const response=await cookieFetch(`${API_URL}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.trim(),password})});const result=await response.json();if(!response.ok||!result.data?.user)throw Error('Login tidak diizinkan');setCsrf(result.data.csrf);login('cookie-session',result.data.user);setPassword('');navigate('/check-in',{replace:true});return;}
      const result = await loginRequest({ username: username.trim(), password });
      if (!result.success || !result.data?.token || !result.data.user) throw new Error('Respons login tidak valid');
      login(result.data.token, result.data.user); setPassword(''); navigate('/check-in', { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Login gagal'); }
    finally { setBusy(false); }
  }
  return <AuthLayout home="/preview/login" linkLabel="Buka lingkungan DEMO" notice={<><strong className="block text-foreground">WORKSPACE OPERASIONAL</strong>Masuk untuk mengelola pekerjaan sesuai akses akun Anda. Pilih status kerja saat check-in.</>}><Section title="Selamat datang kembali" description="Masuk dengan akun HD Work 2.0."><form className="mt-6 space-y-4" onSubmit={event => { void submit(event); }}><label className="block text-sm">Username<input required autoComplete="username" className="mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2" value={username} onChange={event => setUsername(event.target.value)} /></label><label className="block text-sm">Password<input required autoComplete="current-password" type="password" className="mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full" type="submit">{busy ? 'Memverifikasi…' : 'Masuk workspace'}<ArrowRight /></Button></form><p className="mt-4 text-xs text-muted-foreground">Tidak ada registrasi publik. Hubungi Super Admin untuk akun.</p></Section></AuthLayout>;
}
