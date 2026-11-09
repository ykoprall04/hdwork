import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {API_URL} from '@/config/api';
import {Button} from '@/components/ui/button';
import {cookieFetch} from './cookie-http';

export default function ChangePassword(){
 const [currentPassword,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const navigate=useNavigate();
 async function submit(){if(busy)return;setError('');if(password!==confirm){setError('Konfirmasi password tidak sama');return;}setBusy(true);try{const res=await cookieFetch(`${API_URL}/auth/change-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,password})});if(!res.ok)throw Error('Password lama salah atau password baru tidak memenuhi syarat.');navigate('/login',{replace:true});}catch(e){setError(e instanceof Error?e.message:'Gagal mengganti password');}finally{setBusy(false);}}
 return <><h1 className="text-3xl font-semibold">Ganti Password</h1><p>Password minimal 12 karakter, maksimal 72 byte. Setelah berhasil, masuk kembali dengan password baru.</p><form className="grid max-w-md gap-4" onSubmit={e=>{e.preventDefault();void submit();}}>{[['Password lama',currentPassword,setCurrent],['Password baru',password,setPassword],['Konfirmasi password baru',confirm,setConfirm]].map(([label,value,set])=><label key={String(label)}>{String(label)}<input required type="password" autoComplete={label==='Password lama'?'current-password':'new-password'} className="mt-1 block w-full rounded-lg border bg-background p-2" value={value as string} onChange={e=>(set as (value:string)=>void)(e.target.value)}/></label>)}{error&&<p role="alert">{error}</p>}<Button disabled={busy}>Simpan password</Button></form></>;
}
