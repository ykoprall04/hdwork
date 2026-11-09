// Real built React pages in Chromium; all API responses are fixtures.
// Usage: HDWORK2_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser/role-activation.cjs --mock-only
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
async function run(){
 if(process.argv.length!==3||process.argv[2]!=='--mock-only'||!path.isAbsolute(process.env.HDWORK2_PLAYWRIGHT_MODULE||''))throw Error('Explicit mock-only mode and absolute Playwright module required');
 const {chromium}=require(process.env.HDWORK2_PLAYWRIGHT_MODULE),dist=path.resolve(__dirname,'../../frontend/dist');
 const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(dist,'.'+name);if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return;}const asset=/\.[a-z0-9]+$/i.test(name);const body=await fs.readFile(asset?file:path.join(dist,'index.html'));res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/html');res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.HDWORK2_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const modules=['TIAL','REQ','LOGIC_PSB','LOGIC_MO','ASSUREN','B2B','REPLACEMENT'],id='e0fe0345-234b-40e1-a69c-7c55fb045726';
 let assertions=0;
 for(const role of ['HD','ADMIN','SUPER_ADMIN']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],calls=[],sent=[];let anonymous=false,grants=[...modules],owner=7,systemOffline=false;
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>sessionStorage.setItem('hdwork:operational:checkin:7','ONLINE'));
  const counts={total:0,waiting:0,process:0,done:0,failed:0,averageDurationSeconds:0};
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin)return route.continue();
   if(url.origin!=='https://localhost:8443'||!url.pathname.startsWith('/api/'))throw Error('Forbidden external request: '+url.origin);
   const p=url.pathname.replace('/api','');calls.push([req.method(),p]);let status=200,body={success:true,data:[],hasMore:false};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,x-csrf-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   if(p==='/auth/me'){status=anonymous?401:200;body={success:!anonymous,data:{id:7,name:'Fixture '+role,username:'fixture',role,modules:grants,is_active:true},csrf:'a'.repeat(64)};}
   else if(p==='/auth/change-password'){sent.push({path:p,body:req.postDataJSON(),csrf:req.headers()['x-csrf-token']});anonymous=true;}
   else if(p==='/operations/system/status'){status=systemOffline?503:200;body={success:true,checkedAt:new Date().toISOString(),components:{frontend:'UNKNOWN',api:'ONLINE',mysql:'ONLINE',courier:'UNKNOWN',tunnel:'UNKNOWN',queue:'ONLINE'},queue:{pending:0},incidents:[]};}
   else if(p==='/operations/b2c/readiness')body={success:true,configured:false,readyForControlledTest:false,liveVerified:false,categories:[]};
   else if(p==='/operations/overview')body={success:true,all:counts,TIAL:counts,LOGIC:counts};
   else if(p==='/operations/recap')body={success:true,data:counts};
   else if(p==='/operations/events')return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n',headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});
   else if(p==='/operations/orders/'+id)body={success:true,data:{id,scIn:'FIXTURE-ORDER',module:'TIAL',command:'order',status:'IN_PROGRESS',version:2,ownerId:owner,ownerName:'Fixture owner',receivedAt:new Date().toISOString(),startedAt:new Date().toISOString(),finishedAt:null,duplicateOf:null},history:[],page:1,hasMore:false,serverNow:new Date().toISOString()};
   else if(p==='/operations/chat/conversations')body={success:true,data:[{id,reference:'FIXTURE-ORDER',module:'TIAL',status:'IN_PROGRESS',ownerId:owner}],hasMore:false};
   else if(p==='/operations/chat/'+id+'/messages'&&req.method()==='POST'){sent.push({path:p,body:req.postDataJSON(),csrf:req.headers()['x-csrf-token']});body={success:true,status:'ANTRE'};}
   else if(p==='/operations/chat/'+id+'/messages')body={success:true,data:[{id:'fixture-message',direction:'IN',text:'Synthetic Telegram history',userName:'Fixture sender',at:new Date().toISOString(),status:'DITERIMA',telegramMessageId:'101',replyTo:null}],hasMore:false};
   return route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(body)});
  });
  async function open(p,heading){await page.goto(origin+p);await page.getByRole('heading',{name:heading,exact:true}).waitFor();assertions++;}
  await open('/','Apa yang Anda kerjakan hari ini?');await open('/jobs','Apa yang Anda kerjakan hari ini?');const nav=page.getByRole('navigation',{name:'Navigasi operasional'});
  for(const label of ['Telegram Live Chat','Monitoring Sistem','Dashboard Rekap','Ganti Password'])assert.equal(await nav.getByRole('link',{name:label,exact:true}).count(),1);
  assert.equal(await nav.getByRole('link',{name:'Manajemen Pengguna',exact:true}).count(),role==='HD'?0:1);
  for(const category of ['B2C','ASSUREN','B2B','REPLACEMENT'])assert.equal(await page.locator('main').getByRole('link',{name:new RegExp('HD '+category)}).count(),1);
  for(const [p,h] of [['/dashboard','Dashboard Rekap'],['/recap','Dashboard Rekap'],['/work/B2C','Dashboard Pekerjaan'],['/work/B2C/TIAL','Daftar pekerjaan TIAL'],['/work/B2C/REQ','Daftar pekerjaan TIAL'],['/work/B2C/LOGIC','Daftar pekerjaan LOGIC / SOLVER'],...['ASSUREN','B2B','REPLACEMENT'].map(c=>['/work/'+c,'Daftar pekerjaan '+c]),['/orders/'+id,'Detail Order'],['/chat','Telegram Live Chat']])await open(p,h);
  await open('/admin/system','Monitoring Sistem');await page.getByText('MYSQL',{exact:true}).waitFor();
  if(role==='HD'){assert.equal(await page.getByRole('button',{name:'Simpan mapping',exact:true}).count(),0);assert.ok(await page.getByText('Mode read-only',{exact:false}).count());assert.ok(!calls.some(([,p])=>['/operations/system/mappings','/operations/system/history','/operations/system/backups','/operations/b2c/readiness','/operations/system/frontend-heartbeat'].includes(p)));}
  else await page.getByRole('button',{name:'Simpan mapping',exact:true}).waitFor();
  systemOffline=true;await page.getByRole('button',{name:'Periksa kembali',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('strong').filter({hasText:/^UNKNOWN$/}).count(),6);systemOffline=false;
  await page.goto(origin+'/b2c/staging');if(role==='SUPER_ADMIN')await page.getByRole('heading',{name:'Pratinjau integrasi order B2C',exact:true}).waitFor();else await page.getByRole('alert').filter({hasText:'Akses staging sementara terbatas untuk Super Admin.'}).waitFor();
  await page.goto(origin+'/admin/users');if(role==='HD')await page.getByText('Akses manajemen pengguna belum tersedia atau tidak diizinkan.').waitFor();else{await page.getByRole('heading',{name:'Manajemen Pengguna',exact:true}).waitFor();assert.deepEqual(await page.getByRole('combobox',{name:'Role',exact:true}).locator('option').allTextContents(),role==='ADMIN'?['HD','View Only']:['ADMIN','HD','View Only']);}
  await open('/chat/'+id,'Telegram Live Chat');await page.getByText('Synthetic Telegram history',{exact:true}).waitFor();const input=page.getByRole('textbox',{name:'Balasan',exact:true});assert.equal(await input.isEnabled(),true);await input.fill('Synthetic reply '+role);await page.getByRole('button',{name:'Kirim balasan',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');assert.equal(sent.length,1);assert.equal(sent[0].body.version,2);assert.match(sent[0].body.requestId,/^[a-f0-9-]{36}$/);assert.equal(sent[0].csrf,'a'.repeat(64));
  owner=8;await page.reload();await page.getByText('Synthetic Telegram history',{exact:true}).waitFor();assert.equal(await input.isDisabled(),true);owner=7;
  for(const [p,title] of [['/my-work','Pekerjaan Saya'],['/transfers','Transfer Order'],['/productivity','Produktivitas HD'],['/monitoring','Monitoring Publik']]){await page.goto(origin+p);await page.getByText(/Belum tersedia/).first().waitFor();assert.ok(await page.getByText(title,{exact:true}).count());}
  grants=['REQ'];await page.goto(origin+'/work/B2C/LOGIC');await page.getByText('Akses LOGIC belum diberikan',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Daftar pekerjaan LOGIC / SOLVER',exact:true}).count(),0);
  grants=[];await open('/jobs','Apa yang Anda kerjakan hari ini?');for(const [p,scope] of [['/work/B2C','B2C'],['/work/ASSUREN','ASSUREN'],['/work/B2B','B2B'],['/work/REPLACEMENT','REPLACEMENT'],['/work/B2C/TIAL','TIAL'],['/work/B2C/REQ','TIAL'],['/work/B2C/LOGIC','LOGIC']]){const start=calls.length;await page.goto(origin+p);await page.getByText('Akses '+scope+' belum diberikan',{exact:true}).waitFor();assert.equal(await page.locator('main').getByRole('heading',{name:/^(Daftar pekerjaan|Dashboard Pekerjaan)/}).count(),0);assert.equal(await page.getByRole('button',{name:/PICK|LANJUT CEK|TOLAK DUPLIKAT/}).count(),0);assert.ok(!calls.slice(start).some(([,url])=>/operations\/(orders|overview|recap|events)/.test(url)));assertions++;}
  await open('/chat/'+id,'Telegram Live Chat');await page.getByText('Synthetic Telegram history',{exact:true}).waitFor();assert.equal(await input.isDisabled(),true);
  await open('/change-password','Ganti Password');await page.getByLabel('Password lama',{exact:true}).fill('OldSynthetic123!');await page.getByLabel('Password baru',{exact:true}).fill('NewSynthetic123!');await page.getByLabel('Konfirmasi password baru',{exact:true}).fill('NewSynthetic123!');await page.getByRole('button',{name:'Simpan password',exact:true}).click();await page.waitForURL(origin+'/login');assert.equal(sent.length,2);assert.equal(sent[1].body.password,'NewSynthetic123!');assert.equal(sent[1].csrf,'a'.repeat(64));
  for(const p of ['/jobs','/admin/system','/admin/users','/chat/'+id,'/recap','/work/B2B','/orders/'+id,'/change-password']){await page.goto(origin+p);await page.waitForURL(origin+'/login');assertions++;}
  assert.deepEqual(errors,[]);await context.close();console.log(role+': menus, routes, no-module pages, monitoring, chat ownership, password and anonymous guards MOCK PASS');
 }
 const legacyContext=await browser.newContext();const legacyPage=await legacyContext.newPage(),legacyErrors=[],legacyScripts=[];legacyPage.on('pageerror',e=>legacyErrors.push(e.message));await legacyContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.endsWith('.js'))legacyScripts.push(url.pathname);return route.continue();});await legacyPage.goto(origin+'/legacy/login');await legacyPage.getByRole('heading',{name:'LOGIN',exact:true}).waitFor();await legacyPage.goto(origin+'/legacy/network-tools');await legacyPage.waitForURL(origin+'/legacy/login');await legacyPage.getByRole('heading',{name:'LOGIN',exact:true}).waitFor();assert.ok(!legacyScripts.some(p=>p.includes('NetworkToolsPage-')));assert.deepEqual(legacyErrors,[]);await legacyContext.close();console.log('Legacy lazy login and anonymous terminal route guard MOCK PASS');
 console.log('Browser role route assertions: '+assertions+'; no database, credentials or Telegram transport');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
