import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {useWorkData} from './hooks';
import {request} from './api';

export type HdNoteData={id:string;text:string;updatedBy:number|null;updatedAt:string|null};
export default function HdNote({id}:{id:string}){
 const notes=useWorkData<{data:HdNoteData[]}>('/order-notes?ids='+encodeURIComponent(id));
 const [draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const note=notes.data?.data.find(row=>row.id===id);
 async function save(){
  if(!note||busy)return;setBusy(true);setError('');setSaved(false);
  try{await request(`/orders/${id}/hd-note`,{text:draft??note.text});setDraft(null);setSaved(true);await notes.refresh();}
  catch(cause){setError(cause instanceof Error?cause.message:'Catatan belum tersimpan');}
  finally{setBusy(false);}
 }
 return <details aria-label="Catatan HD" className="space-y-2 rounded-lg border p-3">
  <summary className="cursor-pointer text-sm font-semibold">CATATAN HD <span className="font-normal">· Edit catatan</span></summary>
  <label className="block text-sm font-semibold">CATATAN HD<textarea aria-label="Isi Catatan HD" rows={3} maxLength={2000} disabled={!note||busy} className="mt-1 w-full rounded-lg border bg-background p-2 font-normal" value={draft??note?.text??''} onChange={e=>{setDraft(e.target.value);setSaved(false);}}/></label>
  <p className="text-xs text-muted-foreground">Catatan internal bersama · maksimal 2.000 karakter · penyimpanan terakhir berlaku.</p>
  <Button size="sm" disabled={!note||busy||draft===null} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan Catatan'}</Button>
  {saved&&<p role="status" className="text-xs">Catatan tersimpan.</p>}
  {(error||notes.error)&&<p role="alert">{error||notes.error}<Button variant="ghost" onClick={()=>void notes.refresh()}>Muat ulang catatan</Button></p>}
 </details>;
}
