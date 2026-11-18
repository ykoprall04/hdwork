import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Section} from '../operations/components';
import {request} from '../workflow/api';

const commands=['order','req','config_psb','mo'] as const;
type Command=typeof commands[number];
type Settings={commands:Record<Command,{enabled:boolean;version:number}>;capability?:{supported:boolean;ready:boolean;reason:string};effective?:Record<Command,{state:string;enabled:boolean|null;version:number|null}>};

export default function GlobalCommands(){
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{setSettings(await request<Settings>('/system/commands'));setError('');}catch{setError('Pengaturan belum tersedia. Status terakhir mungkin kedaluwarsa.');}},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[refresh]);
 async function toggle(command:Command){
  if(!settings||busy||error)return;
  setBusy(true);
  try{
   const row=await request<{command:Command;enabled:boolean;version:number}>('/system/commands',{command,enabled:!settings.commands[command].enabled,version:settings.commands[command].version,requestId:crypto.randomUUID()});
   setSettings(previous=>previous?{...previous,commands:{...previous.commands,[command]:{enabled:row.enabled,version:row.version}},effective:undefined}:previous);
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Perubahan gagal. Muat ulang pengaturan.');}
  finally{setBusy(false);}
 }
 return <Section title="Command Telegram global" description="Berlaku untuk order baru di seluruh grup HD Work. Order yang sudah diterima tetap diproses. Sinkronisasi normal maksimal 5 detik.">
  {error&&<p role="alert">{error}</p>}
  {!settings&&!error&&<p role="status">Memuat pengaturan…</p>}
  {settings&&!settings.capability?.ready&&<p role="status">Courier belum mendukung atau cache belum siap. OFF belum dapat diterapkan.</p>}
  <div className="grid gap-3 sm:grid-cols-2">{commands.map(command=><div key={command} className="rounded-lg border p-3" data-command={command}><div className="flex items-center justify-between"><span>/{command==='mo'?'MO':command}</span><Button role="switch" aria-label={`Aktifkan /${command==='mo'?'MO':command} secara global`} aria-checked={settings?.commands[command].enabled??false} disabled={!settings||busy||Boolean(error)||(settings.commands[command].enabled&&!settings.capability?.ready)} variant={settings?.commands[command].enabled?'default':'outline'} onClick={()=>void toggle(command)}>{settings?(settings.commands[command].enabled?'ON':'OFF'):'Belum diketahui'}</Button></div><p className="text-sm">TERSIMPAN: {settings?(settings.commands[command].enabled?'ON':'OFF'):'BELUM DIKETAHUI'}</p><p className="text-sm">EFEKTIF: {!error&&settings?.effective?.[command]?.state==='EFFECTIVE'?(settings.effective[command].enabled?'ON':'OFF'):'BELUM TERVERIFIKASI'}</p></div>)}</div>
  <p className="mt-3 text-sm">Command OFF diabaikan tanpa balasan Telegram. Saat koneksi gagal, Courier memakai cache valid terakhir.</p>
  <Button className="mt-3" variant="outline" disabled={busy} onClick={()=>void refresh()}>Muat ulang pengaturan</Button>
 </Section>;
}
