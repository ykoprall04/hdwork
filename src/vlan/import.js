const {input}=require('./reference');
async function workbookRows(file){
 const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.readFile(file);
 const sheet=book.getWorksheet('VLAN');if(!sheet)throw Error('VLAN_SHEET_REQUIRED');
 const headers=[1,2,3,4,5].map(c=>String(sheet.getRow(1).getCell(c).value||'').trim().toLowerCase());
 if(headers.join('|')!=='no|ip|vlan inet|vlan voip|wilayah')throw Error('VLAN_HEADERS_INVALID');
 const rows=[];sheet.eachRow((row,n)=>{
  if(n===1)return;const cells=[2,3,4,5].map(c=>row.getCell(c).value);
  if(cells.every(v=>v==null||v===''))return;
  if(cells.some(v=>v==null||typeof v==='object'))throw Error('VLAN_CELL_INVALID_ROW_'+n);
  try{rows.push(input({ip_olt:String(cells[0]),vlan_inet:String(cells[1]),vlan_voip:String(cells[2]),wilayah:String(cells[3])}));}
  catch{throw Error('VLAN_DATA_INVALID_ROW_'+n);}
 });if(!rows.length)throw Error('VLAN_DATA_EMPTY');return rows;
}
async function importRows(pool,rows){
 const validated=rows.map(input),c=await pool.getConnection();
 try{await c.beginTransaction();
  for(const r of validated)await c.execute('INSERT INTO hd2_vlan_reference(ip_olt,wilayah,vlan_inet,vlan_voip) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[r.ip_olt,r.wilayah,r.vlan_inet,r.vlan_voip]);
  await c.commit();return {rows:validated.length};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={workbookRows,importRows};
