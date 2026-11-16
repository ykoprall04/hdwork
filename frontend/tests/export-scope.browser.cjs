// Ephemeral local Vite, synthetic sessions and mocked API/download. No production.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
let vite,browser;
(async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base='http://127.0.0.1:'+port;
 // Chrome's anchor downloads bypass Playwright routing. Serve that synthetic
 // response in the same ephemeral Vite fixture; all other APIs remain mocked.
 const viteUrl=require('node:url').pathToFileURL(path.resolve(__dirname,'../node_modules/vite/dist/node/index.js')).href;
 const boot=`import {createServer} from ${JSON.stringify(viteUrl)};const server=await createServer({server:{host:'127.0.0.1',port:${port},strictPort:true},plugins:[{name:'offline-download-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.method==='GET'&&/^\\/api\\/operations\\/exports\\/[a-f0-9-]+$/.test(req.url||'')){res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="hdwork-orders.xlsx"'});res.end('synthetic-download');}else next();});}}]});await server.listen();`;
 vite=spawn(process.execPath,['--input-type=module','-e',boot],{cwd:path.resolve(__dirname,'..'),env:{...process.env,VITE_API_BASE_URL:base,VITE_HDWORK2_AUTH_COOKIE:'true',VITE_HDWORK2_OPERATIONS:'true',VITE_HDWORK2_LIVE_CHAT:'false'},windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';browser=await chromium.launch({headless:true,...(process.platform==='win32'&&fs.existsSync(chrome)?{executablePath:chrome}:{}),args:process.platform==='linux'?['--no-sandbox']:[]});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000);
 const requests=[],unexpected=[],errors=[];let role='HD',state='waiting',logged=false;page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{sessionStorage.setItem('hdwork:operational:checkin:2','ONLINE');window.EventSource=class extends EventTarget{close(){}};});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base){unexpected.push(url.origin);return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
  const reply=json=>route.fulfill({json});
  const profile={id:2,name:'Synthetic',username:'synthetic',role,modules:['TIAL','REQ','LOGIC_MO','LOGIC_PSB']};
  if(url.pathname==='/api/auth/me')return logged?reply({success:true,data:profile,csrf:'a'.repeat(64)}):route.fulfill({status:401,json:{success:false}});
  if(url.pathname==='/api/auth/login'){logged=true;return reply({success:true,data:{user:profile,csrf:'a'.repeat(64)}});}
  if(url.pathname==='/api/operations/exports'){
   assert.equal(req.method(),'POST');assert.equal(req.headers()['x-csrf-token'],'a'.repeat(64));requests.push(req.postDataJSON());state='waiting';return reply({id:'10000001-1000-4000-8000-000000000001'});
  }
  if(url.pathname.endsWith('/status')&&url.pathname.includes('/exports/'))return reply({state,rows:5});
  if(url.pathname.includes('/exports/')){state='done';return route.fulfill({headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="hdwork-orders.xlsx"'},body:Buffer.from('synthetic-download')});}
  if(url.pathname==='/api/operations/orders')return reply({data:[],page:1,hasMore:false,serverNow:new Date().toISOString()});
  if(url.pathname==='/api/operations/people')return reply({data:[],page:1,hasMore:false});
  if(url.pathname==='/api/operations/recap')return reply({data:{total:0,waiting:0,process:0,done:0,failed:0,averageDurationSeconds:0}});
  unexpected.push(url.pathname);return route.fulfill({status:503,json:{message:'Unexpected fixture request'}});
 });
 const clickDownload=async()=>{const wait=page.waitForEvent('download');await page.getByRole('button',{name:'Export Excel',exact:true}).click();const download=await wait;assert.equal(download.suggestedFilename(),'hdwork-orders.xlsx');assert.equal(await download.failure(),null);assert.equal(fs.readFileSync(await download.path()).toString(),'synthetic-download');state='done';await page.getByText(/Selesai.*5 baris/).waitFor();};
 await page.goto(base+'/login');await page.getByLabel('Username',{exact:true}).fill('synthetic');await page.getByLabel('Password',{exact:true}).fill('synthetic-password-123');await page.getByRole('button',{name:'Masuk workspace',exact:true}).click();await page.getByRole('button',{name:'Lanjutkan ke Pilih Pekerjaan'}).click();
 await page.goto(base+'/work/B2C/TIAL');await page.getByText(/Semua status; mengikuti filter/).waitFor();await clickDownload();assert.equal(requests.at(-1).tab,'incoming');
 for(const tab of ['DUPLIKAT MENUNGGU','PROSES CEK','SELESAI']){await page.getByRole('button',{name:tab,exact:true}).click();await page.getByRole('button',{name:'Export Excel',exact:true}).waitFor();}
 await page.locator('summary').filter({hasText:'Filter lanjutan'}).click();
 await page.getByLabel('Tanggal mulai',{exact:true}).fill('2026-11-01');await page.getByLabel('Tanggal akhir',{exact:true}).fill('2026-11-16');
 await page.getByLabel('Jenis perintah',{exact:true}).selectOption('req');await page.getByLabel('Status selesai',{exact:true}).selectOption('FAILED');await page.getByLabel('Pencarian pekerjaan',{exact:true}).fill('synthetic');await page.waitForTimeout(500);await clickDownload();
 const query=requests.at(-1);for(const [key,value] of Object.entries({area:'TIAL',command:'req',from:'2026-11-01',to:'2026-11-16',q:'synthetic',status:'FAILED'}))assert.equal(query[key],value);
 assert.ok(await page.getByText(/Filter status tab tidak membatasi export/).isVisible());
 await page.goto(base+'/work/B2C/LOGIC');await page.getByRole('button',{name:'Export Excel',exact:true}).waitFor();await clickDownload();assert.equal(requests.at(-1).area,'LOGIC');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.getByRole('button',{name:'Export Excel',exact:true}).isVisible());assert.ok(await page.getByText(/Semua status; mengikuti filter/).isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 for(role of ['ADMIN','SUPER_ADMIN']){await page.goto(base+'/work/B2C/TIAL');await page.getByRole('button',{name:'Export Excel',exact:true}).waitFor();}
 role='SHOW_ONLY';await page.goto(base+'/work/B2C/TIAL');await page.getByRole('button',{name:'ORDER MASUK',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Export Excel',exact:true}).count(),0);
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);console.log('EXPORT_SCOPE_BROWSER_PASS: login, tabs, all-status explanation, filters, downloads, roles, mobile; mocked API only');
 await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(vite&&vite.exitCode===null)vite.kill();});
