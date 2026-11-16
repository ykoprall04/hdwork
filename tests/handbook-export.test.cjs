const test=require('node:test'),assert=require('node:assert/strict');
const {Writable}=require('node:stream');
const Excel=require('exceljs');
const {createExporter,exportFields}=require('../src/operations/export');
const user={id:7,name:'Synthetic',role:'HD',is_active:1,modules:['TIAL','REQ','LOGIC_MO','LOGIC_PSB']};
function fixture(rows,{maxRows=1048576,authenticate=async()=>user}={}){
 const queries=[];let released=0,committed=0,rolledBack=0;
 const c={async query(sql){assert.equal(sql,'SET TRANSACTION READ ONLY');},async beginTransaction(){},async commit(){committed++;},async rollback(){rolledBack++;},release(){released++;},
  async execute(sql,args){queries.push({sql,args});assert.doesNotMatch(sql,/o\.status\s*(?:=|IN)/);assert.match(sql,/LIMIT 500/);
   const module=args.find(a=>user.modules.includes(a));const day=args.at(-3),id=args.at(-1);return [rows.filter(r=>r.access_module===module&&(r.cursor_day>day||r.cursor_day===day&&r.id>id)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,500)];}};
 const exporter=createExporter({pool:{async getConnection(){return c;}},authenticate,maxRows});
 return {exporter,queries,stats:()=>({released,committed,rolledBack})};
}
function row(module,n,status='WAITING'){return {id:String(n).padStart(5,'0'),access_module:module,command:({TIAL:'order',REQ:'req',LOGIC_MO:'mo',LOGIC_PSB:'config_psb'})[module],status,sc_in:'TEST-AO1',command_fields:{'SN ONT BARU':'SN1','ORDER ID':'TEST-AO1',KETERANGAN:'fixture','IP OLT':'NETWORK-MUST-NOT-EXPORT',odp:'NETWORK-MUST-NOT-EXPORT'},telegram_timestamp:1700000000,cursor_day:'2026-11-16',request_text:module==='REQ'?'/req@SyntheticBot =dangerous\nsecond line':null};}
async function download(f,query={},identity=user){const buffers=[];const res=new Writable({write(chunk,encoding,callback){buffers.push(Buffer.from(chunk));callback();}});res.set=()=>{};const job=f.exporter.ticket(query,identity,'synthetic-session');await f.exporter.download(job.id,identity,'synthetic-session',res);const wb=new Excel.Workbook();await wb.xlsx.load(Buffer.concat(buffers));return {wb,job};}
test('actual XLSX roundtrip exports every status, req body, latest headers and no original/network columns',async()=>{
 const statuses=['WAITING','IN_PROGRESS','DONE','FAILED','DUPLICATE'];const rows=statuses.map((s,i)=>row('TIAL',i+1,s));rows.push(row('REQ',8),row('LOGIC_MO',9),row('LOGIC_PSB',10));
 const f=fixture(rows);const {wb,job}=await download(f,{tab:'finished',status:'DONE'});
 assert.deepEqual(wb.worksheets.map(s=>s.name),['TIAL','REQ','LOGIC MO','LOGIC PSB']);
 assert.deepEqual(wb.getWorksheet('TIAL').getColumn(4).values.slice(2),statuses);
 for(const sheet of wb.worksheets){const header=sheet.getRow(1).values.slice(1);assert.ok(header.includes('Isi permintaan /req'));assert.ok(!header.some(h=>/raw_text|pesan asli|ODP|OLT|GPON|SLOT|PORT|DOMAIN|VALINS|PANEL/i.test(h)));sheet.eachRow(r=>r.eachCell(c=>{assert.notEqual(c.type,Excel.ValueType.Formula);assert.ok(!String(c.value).includes('NETWORK-MUST-NOT-EXPORT'));}));}
 const req=wb.getWorksheet('REQ');assert.equal(req.getRow(2).getCell(9).value,"' =dangerous\nsecond line");assert.doesNotMatch(req.getRow(2).getCell(9).value,/\/req/);
 const psb=wb.getWorksheet('LOGIC PSB').getRow(1).values;for(const name of ['Order ID DSC','No SN ONT','Keperluan'])assert.ok(psb.includes(name));
 assert.equal(f.exporter.status(job.id,user,'synthetic-session').state,'done');assert.equal(f.exporter.slots.count,0);assert.deepEqual(f.stats(),{released:1,committed:1,rolledBack:0});
});
test('streamed workbook keeps keyset pagination, rollover and empty headers',async()=>{
 const f=fixture(Array.from({length:501},(_,i)=>row('TIAL',i+1)),{maxRows:400});const {wb}=await download(f);
 assert.equal(f.queries.filter(q=>q.args.includes('TIAL')).length,2);assert.equal(wb.getWorksheet('TIAL').rowCount,400);assert.equal(wb.getWorksheet('TIAL 2').rowCount,103);assert.equal(wb.getWorksheet('REQ').rowCount,1);
});
test('export scope and session ownership remain enforced; cancellation and permission revocation release slots',async()=>{
 const f=fixture([]);assert.throws(()=>f.exporter.ticket({}, {...user,role:'SHOW_ONLY'},'s'),{statusCode:403});
 const job=f.exporter.ticket({},user,'s');assert.throws(()=>f.exporter.status(job.id,{...user,id:8},'s'),{statusCode:404});assert.throws(()=>f.exporter.cancel(job.id,user,'other'),{statusCode:404});f.exporter.cancel(job.id,user,'s');assert.equal(f.exporter.slots.count,0);
 const revoked=fixture([],{authenticate:async()=>({...user,role:'SHOW_ONLY'})});await assert.rejects(download(revoked),{statusCode:403});assert.equal(revoked.exporter.slots.count,0);
 assert.equal(exportFields('REQ').length,0);assert.ok(!exportFields('LOGIC_PSB').includes('_formats'));
});
test('HD, ADMIN and SUPER_ADMIN exports stay inside assigned modules and preserve existing operational description',async()=>{
 for(const role of ['HD','ADMIN','SUPER_ADMIN']){
  const identity={...user,role,modules:['TIAL']};const record=row('TIAL',1);record.command_fields.description='existing operational description';
  const f=fixture([record,row('LOGIC_PSB',2)],{authenticate:async()=>identity});const {wb}=await download(f,{},identity);
  assert.deepEqual(wb.worksheets.map(s=>s.name),['TIAL']);const sheet=wb.getWorksheet('TIAL'),index=sheet.getRow(1).values.indexOf('description');assert.ok(index>0);assert.equal(sheet.getRow(2).getCell(index).value,'existing operational description');
 }
});
