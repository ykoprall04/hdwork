// Local Vite + fresh browser context. Every API is mocked; external traffic denied.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let vite,browser;
(async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
 const base='http://127.0.0.1:'+port;
 vite=spawn(process.execPath,[path.resolve(__dirname,'../node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,VITE_API_BASE_URL:base,VITE_HDWORK2_AUTH_COOKIE:'true',VITE_HDWORK2_OPERATIONS:'true',VITE_HDWORK2_LIVE_CHAT:'false'},windowsHide:true,stdio:'ignore'});
 let started=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){started=true;break;}}catch{}if(vite.exitCode!==null)break;await sleep(100);}assert.ok(started,'local fixture server started');
 const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';browser=await chromium.launch({headless:true,...(process.platform==='win32'&&fs.existsSync(chrome)?{executablePath:chrome}:{}),args:process.platform==='linux'?['--no-sandbox']:[]});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[],unexpected=[],mutations=[];page.on('pageerror',e=>errors.push(e.message));
 let role='HD',reference=[{id:'1',ip_olt:'192.0.2.1',wilayah:'SBU',vlan_inet:'1035',vlan_voip:'0'}];
 const id='10000001-1000-4000-8000-000000000001';
 const work={id,command:'config_psb',module:'LOGIC_PSB',status:'IN_PROGRESS',decision:null,duplicateOf:null,ownerId:2,ownerName:'Fixture',finalName:null,version:1,scIn:'DGPS-AO123',inetMasked:'••••0123',receivedAt:'2026-11-15T00:00:00Z',startedAt:'2026-11-15T00:00:00Z',finishedAt:null,note:null,feedback:null};
 const template='#PELURUSAN #PSB\nINET / POTS : 000123 / -\nSTO : BBA\nODP : ODP-TEST/04\nIP OLT : 192.0.2.1\nSLOT / PORT : 2 / 3\nID VALINS : VALINS1\nPESAN : 1P INET\nDGPS-AO123\nDATA VLAN INET 1035\nDATA VLAN VOIP 0';
 await context.addInitScript(()=>{
  sessionStorage.setItem('hdwork:operational:checkin:2','ONLINE');window.EventSource=class extends EventTarget{close(){}};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__vlanCopied=text;}}});
 });
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base){unexpected.push(url.origin);return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
  const reply=(json,status=200)=>route.fulfill({json,status});
  if(req.method()==='POST')mutations.push(url.pathname);
  if(url.pathname==='/api/auth/me')return reply({success:true,data:{id:2,name:'Fixture',username:'fixture',role,city_id:null,modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO']},csrf:'a'.repeat(64)});
  if(url.pathname.endsWith('/vlan-format'))return reply({success:true,text:template,lookup:{status:'found',wilayah:'SBU',vlan_inet:'1035',vlan_voip:'0'}});
  if(url.pathname==='/api/operations/orders/'+id)return reply({data:work,fields:{STO:'BBA'},originalMessage:'/config_psb\nORDER ID:DGPS-AO123',history:[],previous:null,page:1,hasMore:false,serverNow:'2026-11-15T00:00:00Z',capabilities:{escalate:false}});
  if(url.pathname==='/api/operations/orders')return reply({data:[work],page:1,hasMore:false,serverNow:'2026-11-15T00:00:00Z'});
  if(url.pathname==='/api/operations/order-notes')return reply({data:[{id,text:'',updatedBy:null,updatedAt:null}]});
  if(url.pathname==='/api/operations/people')return reply({data:[],page:1,hasMore:false});
  if(url.pathname==='/api/operations/recap')return reply({data:{total:1,waiting:0,process:1,done:0,failed:0,averageDurationSeconds:0}});
  if(url.pathname==='/api/operations/vlan'&&req.method()==='GET'){const q=url.searchParams.get('q')||'';return reply({data:reference.filter(r=>Object.values(r).some(v=>v.includes(q))),page:1,hasMore:false});}
  if(url.pathname==='/api/operations/vlan'&&req.method()==='POST'){reference.push({id:'2',...req.postDataJSON()});return reply({success:true,id:'2'},201);}
  if(url.pathname.endsWith('/vlan/2/update')){reference=reference.map(r=>r.id==='2'?{id:'2',...req.postDataJSON()}:r);return reply({success:true,id:'2'});}
  if(url.pathname.endsWith('/vlan/2/delete')){reference=reference.filter(r=>r.id!=='2');return reply({success:true,id:'2'});}
  unexpected.push(url.pathname);return reply({message:'Unexpected fixture API'},503);
 });
 await page.goto(base+'/orders/'+id);await page.getByRole('button',{name:'FORMAT VLAN',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'FORMAT VLAN',exact:true}),text=page.getByLabel('Teks FORMAT VLAN');await popup.waitFor();
 for(let i=0;i<60&&(await text.inputValue())!==template;i++)await sleep(50);assert.equal(await text.inputValue(),template);
 const edited=template.replace('PESAN : 1P INET','PESAN : EDITABLE')+'\ncatatan lokal';await text.fill(edited);await popup.getByRole('button',{name:'SALIN',exact:true}).click();assert.equal(await page.evaluate(()=>window.__vlanCopied),edited);
 assert.equal(await popup.getByRole('button').count(),2);await popup.getByRole('button',{name:'TUTUP',exact:true}).click();await popup.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'FORMAT VLAN',exact:true}).click();await popup.waitFor();for(let i=0;i<60&&(await text.inputValue())!==template;i++)await sleep(50);assert.equal(await text.inputValue(),template);await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'});
 assert.equal(mutations.length,0);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/vlan/i.test(k)).length+Object.keys(sessionStorage).filter(k=>/vlan/i.test(k)).length),0);
 // Embedded Detail Pekerjaan and mobile popup; Escape must not close the order panel.
 await page.goto(base+'/work/B2C/LOGIC');await page.getByRole('button',{name:'PROSES CEK',exact:true}).click();await page.locator('a[data-order-id="'+id+'"]').first().click();await page.getByRole('heading',{name:'Detail Pekerjaan',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'FORMAT VLAN',exact:true}).click();await popup.waitFor();const rect=await popup.boundingBox();assert.ok(rect.width<=390&&rect.x>=0);await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'});await page.getByRole('heading',{name:'Detail Pekerjaan',exact:true}).waitFor();assert.equal(mutations.length,0);
 // Ordinary users cannot see the menu or use the page.
 await page.goto(base+'/admin/vlan');await page.getByRole('alert').filter({hasText:'ADMIN dan SUPER_ADMIN'}).waitFor();assert.equal(await page.getByRole('link',{name:'Manajemen VLAN',exact:true}).count(),0);
 role='ADMIN';await page.setViewportSize({width:1280,height:900});await page.goto(base+'/admin/vlan');await page.getByRole('heading',{name:'Manajemen VLAN',exact:true}).waitFor();await page.getByRole('link',{name:'Manajemen VLAN',exact:true}).first().waitFor();
 await page.getByLabel('IP OLT',{exact:true}).fill('192.0.2.99');await page.getByLabel('VLAN INET',{exact:true}).fill('1000');await page.getByLabel('VLAN VOIP',{exact:true}).fill('500-504 507 509');await page.getByRole('button',{name:'Tambah data',exact:true}).click();
 let row=page.getByRole('row').filter({hasText:'192.0.2.99'});await row.waitFor();await row.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('VLAN VOIP',{exact:true}).fill('0');await page.getByRole('button',{name:'Simpan perubahan',exact:true}).click();await page.getByRole('status').filter({hasText:'Referensi tersimpan'}).waitFor();
 await page.getByLabel('Cari referensi VLAN').fill('192.0.2.99');await page.getByRole('button',{name:'Cari',exact:true}).click();await row.waitFor();
 const before=mutations.length;page.once('dialog',d=>d.dismiss());await row.getByRole('button',{name:'Hapus',exact:true}).click();assert.equal(mutations.length,before);
 page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Hapus',exact:true}).click();await row.waitFor({state:'hidden'});assert.equal(mutations.length,before+1);
 role='SUPER_ADMIN';await page.goto(base+'/admin/vlan');await page.getByRole('button',{name:'Tambah data',exact:true}).waitFor();
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);console.log('FORMAT_VLAN_BROWSER_PASS: edit/copy/reset, desktop/mobile/embedded, read-only popup, ADMIN/SUPER_ADMIN CRUD UI and HD denial; all APIs mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(vite&&vite.exitCode===null){vite.kill();await new Promise(resolve=>{const timeout=setTimeout(resolve,5000);vite.once('exit',()=>{clearTimeout(timeout);resolve();});});}});
