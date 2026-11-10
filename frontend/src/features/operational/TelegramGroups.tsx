import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Section} from '../operations/components';
import {request} from '../workflow/api';
export type Mapping={id:string;botId:string;category:string;profile:string;chatId:string;threadId:string|null;enabled:boolean|number;verified:boolean|number;version:number;name?:string};
const blank=(botId=''):Mapping=>({id:crypto.randomUUID(),botId,category:'ALL',profile:'ALL',name:'',chatId:'',threadId:null,enabled:false,verified:false,version:0});
export default function TelegramGroups({rows,available,botIds,refresh}:{rows:Mapping[];available:boolean;botIds:string[];refresh:()=>Promise<void>}){
 const [editing,setEditing]=useState(false),[value,setValue]=useState<Mapping>(()=>blank()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const knownBots=[...new Set([...botIds,...rows.map(row=>row.botId)])];
 const field='mt-1 block w-full rounded-lg border bg-background p-2';
 const edit=(row:Mapping)=>{setValue({...row,name:row.name||row.chatId,category:'ALL',profile:'ALL'});setEditing(true);setError('');};
 async function save(){setBusy(true);setError('');try{await request('/system/mappings',{...value,category:'ALL',profile:'ALL',enabled:Boolean(value.enabled),verified:Boolean(value.verified),requestId:crypto.randomUUID()});setEditing(false);await refresh();}catch(e){setError(e instanceof Error?e.message:'Grup gagal disimpan');}finally{setBusy(false);}}
 return <Section title="Manajemen Grup Telegram" description="Grup bersama menerima semua jenis order yang sudah didukung: TIAL, REQ, LOGIC/SOLVER, ASSUREN, B2B, dan REPLACEMENT. Hak akses dan penugasan order tetap berlaku.">
  {!available&&<p role="status">Grup bersama belum tersedia pada runtime. Migrasi dan aktivasi backend/Courier harus disetujui sebelum pengaturan dapat diubah.</p>}
  {available&&!knownBots.length&&<p role="status">Belum ada bot Courier terdaftar. Formulir ini hanya menggunakan bot yang sudah tersedia.</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Nama grup</th><th>Tujuan</th><th>Konfigurasi</th><th/></tr></thead><tbody>{rows.map(row=><tr key={row.id}>
   <td>{row.name||row.chatId}{row.category!=='ALL'&&<p className="text-xs text-muted-foreground">Mapping lama · {row.category}</p>}</td><td>{row.botId} · {row.chatId} · {row.threadId||'non-topic'}</td>
   <td>{!row.verified?'Belum terverifikasi':row.enabled?'Diizinkan · terverifikasi operator':'Nonaktif'}</td><td><Button variant="outline" disabled={!available||busy} onClick={()=>edit(row)}>Edit</Button></td>
  </tr>)}</tbody></table></div>
  <p className="mt-2 text-xs text-muted-foreground">Status di atas adalah konfigurasi tersimpan, bukan bukti Courier sudah menerapkan atau pesan berhasil terkirim.</p>
  <Button className="mt-4" disabled={!available||busy||!knownBots.length} onClick={()=>{setValue(blank(knownBots.length===1?knownBots[0]:''));setEditing(true);setError('');}}>Tambah grup</Button>
  {editing&&<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void save();}}>
   <label>Nama grup<input required maxLength={100} className={field} value={value.name||''} onChange={e=>setValue({...value,name:e.target.value})}/></label>
   <label>Bot Courier<select required disabled={rows.some(r=>r.id===value.id)} className={field} value={value.botId} onChange={e=>setValue({...value,botId:e.target.value})}><option value="">Pilih bot yang tersedia</option>{knownBots.map(bot=><option key={bot} value={bot}>{bot}</option>)}</select><span className="text-xs text-muted-foreground">Gunakan identitas bot Courier yang sudah tersedia; formulir ini tidak membuat bot baru.</span></label>
   <label>Chat ID<input required disabled={rows.some(r=>r.id===value.id)} className={field} value={value.chatId} onChange={e=>setValue({...value,chatId:e.target.value})}/></label>
   <label>Topic ID (kosong untuk non-topic)<input disabled={rows.some(r=>r.id===value.id)} className={field} value={value.threadId||''} onChange={e=>setValue({...value,threadId:e.target.value||null})}/></label>
   <p className="sm:col-span-2">Semua jenis order yang didukung langsung diizinkan. Jenis order dikenali dari format/perintah pesan.</p>
   <label><input type="checkbox" checked={Boolean(value.verified)} onChange={e=>setValue({...value,verified:e.target.checked,enabled:e.target.checked&&Boolean(value.enabled)})}/> Operator telah memverifikasi keanggotaan, izin bot dan tujuan grup/topic. Pemeriksaan Telegram otomatis belum tersedia di formulir ini.</label>
   <label><input type="checkbox" disabled={!value.verified} checked={Boolean(value.enabled)} onChange={e=>setValue({...value,enabled:e.target.checked})}/> Grup diizinkan</label>
   <p className="text-sm sm:col-span-2">Menonaktifkan grup menghentikan penerimaan dan pengiriman, termasuk chat order lama. Riwayat tetap tersimpan. Antrean tertahan tidak dikirim otomatis saat grup diaktifkan kembali. Pesan yang sudah dalam pengiriman ke Telegram tidak dapat ditarik kembali.</p>
   <div className="flex gap-2"><Button type="submit" disabled={busy}>Simpan grup</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(false)}>Batal</Button></div>
  </form>}
 </Section>;
}
