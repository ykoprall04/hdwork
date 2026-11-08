const fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {pipeline}=require('node:stream/promises');const {randomUUID}=require('node:crypto');
const {digest}=require('../access/service');const {filters,where,fail}=require('./policy');
function createSlots(max=2){let count=0;return {take(){if(count>=max)throw fail(429,'Dua export sedang berjalan. Coba lagi setelah selesai.');count++;let released=false;return()=>{if(!released){released=true;count--;}};},get count(){return count;}};}
const text=value=>{if(value==null)return '';let s=typeof value==='object'?JSON.stringify(value):String(value);s=s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');return (/^[\s]*[=+\-@\t\r]/.test(s)?"'":'')+s.slice(0,32000);};
function createExporter({pool,authenticate,maxRows=1048576}){
 const slots=createSlots(),jobs=new Map();
 const owned=(id,user,token)=>{const job=jobs.get(id);if(!job||String(job.uid)!==String(user.id)||job.tokenHash!==digest(token))throw fail(404);return job;};
 function ticket(query,user,token){if(user.role==='SHOW_ONLY')throw fail(403);const f=filters({...query,tab:'finished',mine:'false'},user);if(!f.allowed.length)throw fail(403);const release=slots.take();const id=randomUUID(),controller=new AbortController();const job={id,uid:user.id,tokenHash:digest(token),query:{...query,tab:'finished',mine:'false'},f,user,release,controller,state:'waiting',rows:0,started:false};
 job.timer=setTimeout(()=>{controller.abort();release();jobs.delete(id);},60000);job.timer.unref?.();jobs.set(id,job);return {id};}
 async function download(id,user,token,res){const job=owned(id,user,token);if(job.started)throw fail(409);job.started=true;clearTimeout(job.timer);job.state='running';job.deadline=setTimeout(()=>job.controller.abort(),10*60*1000);job.deadline.unref?.();let dir,c,writer,readStream;
 const signal=job.controller.signal;const close=()=>{if(!res.writableFinished)job.controller.abort();};res.on('close',close);
 const abort=()=>{c?.destroy();writer?.zip?.abort();writer?.stream?.destroy();readStream?.destroy();};signal.addEventListener('abort',abort,{once:true});
 try{
 dir=await fsp.mkdtemp(path.join(os.tmpdir(),'hdwork-export-'));await fsp.chmod(dir,0o700);const filename=path.join(dir,'orders.xlsx');
 const Excel=require('exceljs');writer=new Excel.stream.xlsx.WorkbookWriter({filename,useStyles:false,useSharedStrings:false});writer.stream.on('error',()=>{});writer.zip.on('error',()=>{});
 c=await pool.getConnection();await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();
 const current=await authenticate(token);if(current.role==='SHOW_ONLY')throw fail(403);
 const f=filters(job.query,current);const sheets=new Map();
 const specs=require('../../contracts/b2c-commands.json');const fieldNames=[...new Set(Object.values(specs).flatMap(s=>[...s.required,...s.optional]))];
 const headings=['SC/IN hasil ekstraksi','ID','Command','Status asli','HD penyelesaian','Order masuk WIB','Selesai WIB','Catatan / alasan',...fieldNames];
 function add(row){const module=row.access_module;let item=sheets.get(module);if(!item||item.count>=maxRows){if(item)item.sheet.commit();const part=(item?.part||0)+1;const label=({TIAL:'TIAL',REQ:'REQ',LOGIC_PSB:'LOGIC PSB',LOGIC_MO:'LOGIC MO'})[module];const sheet=writer.addWorksheet(label+(part>1?' '+part:''));sheet.addRow(headings).commit();item={sheet,count:1,part};sheets.set(module,item);}
 const fields=typeof row.command_fields==='string'?JSON.parse(row.command_fields):row.command_fields;
 const date=value=>value?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'';
 item.sheet.addRow([row.sc_in,row.id,row.command,row.status,row.final_name,date(Number(row.telegram_timestamp)*1000),date(row.finished),row.completion_note,...fieldNames.map(name=>fields?.[name]??null)].map(text)).commit();item.count++;job.rows++;}
 for(const module of f.allowed){const w=where({...f,allowed:[module]},current);let cursor='',cursorDay='1000-01-01';
 while(true){if(signal.aborted)throw fail(499);const fresh=await authenticate(token);if(fresh.role==='SHOW_ONLY'||f.allowed.some(m=>!fresh.modules.includes(m)))throw fail(403);
 const [rows]=await c.execute(`SELECT o.id,o.sc_in,o.access_module,o.command,o.status,o.command_fields,o.telegram_timestamp,o.completion_note,DATE_FORMAT(o.business_day,'%Y-%m-%d') AS cursor_day,DATE_FORMAT(o.finished_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS finished,u.name AS final_name FROM hd2_orders o LEFT JOIN users u ON u.id=o.final_user_id WHERE ${w.sql} AND (o.business_day>? OR (o.business_day=? AND o.id>?)) ORDER BY o.business_day,o.id LIMIT 500`,[...w.values,cursorDay,cursorDay,cursor]);
 for(const row of rows)add(row);if(rows.length<500)break;cursor=rows.at(-1).id;cursorDay=rows.at(-1).cursor_day;await new Promise(r=>setImmediate(r));}}
 for(const module of f.allowed.filter(m=>!sheets.has(m))){const label=({TIAL:'TIAL',REQ:'REQ',LOGIC_PSB:'LOGIC PSB',LOGIC_MO:'LOGIC MO'})[module];const sheet=writer.addWorksheet(label);sheet.addRow(headings).commit();}
 for(const item of sheets.values())item.sheet.commit();await writer.commit();await c.commit();c.release();c=null;
 if(signal.aborted)throw fail(499);const fresh=await authenticate(token);if(fresh.role==='SHOW_ONLY'||f.allowed.some(m=>!fresh.modules.includes(m)))throw fail(403);
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="hdwork-orders.xlsx"');res.set('Content-Length',String((await fsp.stat(filename)).size));readStream=fs.createReadStream(filename);await pipeline(readStream,res,{signal});job.state='done';
 }catch(error){job.state=signal.aborted?'cancelled':'failed';if(!res.headersSent)throw error;res.destroy();}
 finally{clearTimeout(job.deadline);signal.removeEventListener('abort',abort);res.off('close',close);if(c){try{await c.rollback();}catch{/* destroyed */}c.release();}try{if(writer?.stream&&!writer.stream.closed){writer.zip?.abort();await new Promise(resolve=>{writer.stream.once('close',resolve);writer.stream.destroy();});}if(dir)await fsp.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});}finally{job.release();job.timer=setTimeout(()=>jobs.delete(id),60000);job.timer.unref?.();}}
 }
 return {ticket,download,status(id,u,t){const j=owned(id,u,t);return {state:j.state,rows:j.rows};},cancel(id,u,t){const j=owned(id,u,t);j.controller.abort();if(!j.started){clearTimeout(j.timer);j.release();j.state='cancelled';j.timer=setTimeout(()=>jobs.delete(id),60000);j.timer.unref?.();}},slots};
}
module.exports={createExporter,createSlots,text};
