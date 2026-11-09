import {useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {API_URL} from '@/config/api';
import {Button} from '@/components/ui/button';
import AuthLayout from '../workspace-ui/AuthLayout';
import {Section} from '../operations/components';
import {cookieMode} from './cookie-http';
export default function Register(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const form=event.currentTarget,fields=new FormData(form);
  const body={name:String(fields.get('name')||'').trim(),username:String(fields.get('username')||'').trim(),password:String(fields.get('password')||''),confirmPassword:String(fields.get('confirmPassword')||'')};
  if(body.password!==body.confirmPassword){setError('Konfirmasi password tidak cocok');return;}
  setBusy(true);setError('');
  try{
   const tokenResponse=await fetch(`${API_URL}/auth/registration-token`,{credentials:'include'});
   const token=await tokenResponse.json();if(!tokenResponse.ok||!token.csrf)throw Error(token.message||'Pendaftaran belum tersedia');
   const response=await fetch(`${API_URL}/auth/register`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':token.csrf},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok)throw Error(result.message||'Pendaftaran gagal');form.reset();setComplete(true);
  }catch(cause){setError(cause instanceof Error?cause.message:'Pendaftaran gagal');}finally{setBusy(false);}
 }
 const field='mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2';
 return <AuthLayout home="/login" linkLabel="Kembali ke login" notice={<>Akun baru menunggu persetujuan Super Admin. Role dan akses modul ditetapkan saat persetujuan.</>}><Section title="Daftar Akun" description="Gunakan identitas Anda untuk mendaftar HD Work 2.0.">{!cookieMode?<p>Pendaftaran belum tersedia pada mode autentikasi ini.</p>:complete?<p role="status">Pendaftaran tersimpan. Tunggu persetujuan Super Admin sebelum masuk.</p>:<form className="mt-6 space-y-4" onSubmit={event=>void submit(event)}><label className="block text-sm">Nama<input name="name" autoComplete="name" required maxLength={100} className={field}/></label><label className="block text-sm">Username<input name="username" autoComplete="username" required pattern="[a-zA-Z0-9._\-]{3,64}" minLength={3} maxLength={64} className={field}/></label><label className="block text-sm">Password<input name="password" autoComplete="new-password" type="password" required minLength={12} className={field}/></label><label className="block text-sm">Konfirmasi password<input name="confirmPassword" autoComplete="new-password" type="password" required minLength={12} className={field}/></label>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Menyimpan…':'Daftar Akun'}</Button></form>}<Link className="mt-4 block text-primary underline" to="/login">Kembali ke login</Link></Section></AuthLayout>;
}
