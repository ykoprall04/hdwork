import {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {useWorkData} from '../workflow/hooks';
import {request} from '../workflow/api';

type Fields={ip_olt:string;wilayah:string;vlan_inet:string;vlan_voip:string};
type Row=Fields&{id:string};
const blank:Fields={ip_olt:'',wilayah:'SBU',vlan_inet:'',vlan_voip:''};
export default function VlanManagement(){
 const {user}=useAuth();
 if(!user||!['ADMIN','SUPER_ADMIN'].includes(user.role))return <p role="alert">Manajemen VLAN hanya untuk ADMIN dan SUPER_ADMIN.</p>;
 return <Management key={user.id}/>;
}
function Management(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[form,setForm]=useState<Fields>({...blank}),[id,setId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const list=useWorkData<{data:Row[];hasMore:boolean}>(`/vlan?q=${encodeURIComponent(query)}&page=${page}`);
 async function mutate(action:'save'|'delete',row?:Row){
  if(busy)return;if(action==='delete'&&!window.confirm(`Hapus referensi VLAN ${row?.ip_olt} / ${row?.wilayah}?`))return;
  setBusy(true);setError('');setNotice('');
  try{await request(action==='delete'?`/vlan/${row?.id}/delete`:id?`/vlan/${id}/update`:'/vlan',action==='delete'?{}:form);
   setNotice(action==='delete'?'Referensi dihapus.':'Referensi tersimpan.');if(action==='save'){setId(null);setForm({...blank});}await list.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Perubahan belum tersimpan');}finally{setBusy(false);}
 }
 return <div className="space-y-5"><header><h1 className="text-2xl font-semibold">Manajemen VLAN</h1><p className="text-sm text-muted-foreground">Referensi IP OLT dan wilayah. Nilai rentang dan 0 disimpan sebagai teks.</p></header>
  <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1);}}><input aria-label="Cari referensi VLAN" className="min-w-0 flex-1 rounded-lg border bg-background p-2" maxLength={128} value={search} onChange={e=>setSearch(e.target.value)} placeholder="IP OLT, wilayah, atau VLAN"/><Button type="submit">Cari</Button></form>
  {(error||list.error)&&<p role="alert">{error||list.error}</p>}{notice&&<p role="status">{notice}</p>}
  <section className="rounded-xl border p-4"><h2 className="mb-3 font-semibold">{id?'Edit referensi':'Tambah referensi'}</h2><form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void mutate('save');}}>
   <label>IP OLT<input required aria-label="IP OLT" className="mt-1 w-full rounded border bg-background p-2" value={form.ip_olt} onChange={e=>setForm({...form,ip_olt:e.target.value})}/></label>
   <label>Wilayah<select aria-label="Wilayah" className="mt-1 w-full rounded border bg-background p-2" value={form.wilayah} onChange={e=>setForm({...form,wilayah:e.target.value})}>{['SBU','SBS','MDR'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>VLAN INET<input required aria-label="VLAN INET" maxLength={128} className="mt-1 w-full rounded border bg-background p-2" value={form.vlan_inet} onChange={e=>setForm({...form,vlan_inet:e.target.value})}/></label>
   <label>VLAN VOIP<input required aria-label="VLAN VOIP" maxLength={128} className="mt-1 w-full rounded border bg-background p-2" value={form.vlan_voip} onChange={e=>setForm({...form,vlan_voip:e.target.value})}/></label>
   <div className="flex gap-2 sm:col-span-2"><Button disabled={busy} type="submit">{id?'Simpan perubahan':'Tambah data'}</Button>{id&&<Button variant="outline" type="button" disabled={busy} onClick={()=>{setId(null);setForm({...blank});}}>Batal edit</Button>}</div>
  </form></section>
  {list.loading&&!list.data&&<p role="status">Memuat referensi…</p>}
  <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead><tr>{['IP OLT','Wilayah','VLAN INET','VLAN VOIP','Tindakan'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{list.data?.data.map(row=><tr key={row.id} className="border-t"><td className="p-3">{row.ip_olt}</td><td className="p-3">{row.wilayah}</td><td className="p-3 whitespace-pre-wrap">{row.vlan_inet}</td><td className="p-3 whitespace-pre-wrap">{row.vlan_voip}</td><td className="flex gap-2 p-3"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setId(row.id);setForm({ip_olt:row.ip_olt,wilayah:row.wilayah,vlan_inet:row.vlan_inet,vlan_voip:row.vlan_voip});}}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void mutate('delete',row)}>Hapus</Button></td></tr>)}</tbody></table>{list.data&&!list.data.data.length&&<p className="p-3">Tidak ada referensi.</p>}</div>
  <div className="flex items-center gap-3"><Button variant="outline" disabled={page===1||list.loading} onClick={()=>setPage(page-1)}>Sebelumnya</Button><span>Halaman {page}</span><Button variant="outline" disabled={!list.data?.hasMore||list.loading} onClick={()=>setPage(page+1)}>Berikutnya</Button></div>
 </div>;
}
