import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {request} from './api';

export default function FormatVlanButton({id,command,disabled=false}:{id:string;command?:string;disabled?:boolean}){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 if(!['order','config_psb'].includes(command||''))return null;
 function close(){controller.current?.abort();controller.current=null;setOpen(false);setText('');setError('');setCopied(false);setBusy(false);}
 async function show(){
  controller.current?.abort();const current=new AbortController();controller.current=current;
  setOpen(true);setText('');setError('');setCopied(false);setBusy(true);
  try{const data=await request<{text:string}>(`/orders/${id}/vlan-format`,undefined,current.signal);if(!current.signal.aborted)setText(data.text);}
  catch(e){if(!current.signal.aborted)setError(e instanceof Error?e.message:'Format belum tersedia');}
  finally{if(!current.signal.aborted)setBusy(false);}
 }
 async function copy(){try{await navigator.clipboard.writeText(text);setCopied(true);setError('');}catch{setError('Tidak dapat menyalin. Pilih teks dan salin secara manual.');}}
 return <><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>void show()}>FORMAT VLAN</Button>
  <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
   <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}}>
    <DialogTitle>FORMAT VLAN</DialogTitle>
    <DialogDescription>Edit teks sesuai kebutuhan. Data order tidak berubah.</DialogDescription>
    {busy&&<p role="status">Menyiapkan format…</p>}
    <textarea aria-label="Teks FORMAT VLAN" className="mt-3 max-h-[55dvh] w-full resize-y rounded-lg border bg-background p-3 font-mono text-sm" rows={13} disabled={busy} value={text} onChange={e=>{setText(e.target.value);setCopied(false);}}/>
    {error&&<p role="alert" className="text-sm">{error}</p>}{copied&&<p role="status" className="text-sm">Tersalin.</p>}
    <DialogFooter><Button type="button" disabled={busy||!text} onClick={()=>void copy()}>SALIN</Button><Button type="button" variant="outline" onClick={close}>TUTUP</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </>;
}
