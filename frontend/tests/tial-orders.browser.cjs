const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {orderId,metadata,order,list}=require('./b2c-orders.helpers.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HD_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const directory='/tmp/hdwork-batch6';fs.mkdirSync(directory,{recursive:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
  let failure=false,empty=false,historyEmpty=false,historyPage=1;const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('hdwork:operational:auth:v1','dummy');sessionStorage.setItem('hdwork:operational:checkin:1','ONLINE');});
  await context.route('**/api/**',route=>{
   const request=route.request(),url=new URL(request.url());const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer dummy');
   if(url.pathname==='/api/auth/me')return route.fulfill({headers,json:{success:true,data:{id:1,name:'Petugas Uji',username:'dummy',role:'SUPER_ADMIN',city_id:null}}});
   calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams)});
   if(failure)return route.fulfill({status:503,headers,json:{message:'must not echo raw backend error'}});
   if(url.pathname.endsWith('/history')){historyPage=Number(url.searchParams.get('page'));return route.fulfill({headers,json:{...metadata,page:historyPage,pageSize:25,hasMore:historyPage===1,data:historyEmpty?[]:[{id:'safe-audit-id',action:'ORDER_RECEIVED',fromStatus:null,toStatus:'WAITING',at:'2026-11-08T00:00:00Z'}]}});}
   if(url.pathname===`/api/b2c/orders/${orderId()}`)return route.fulfill({headers,json:{...metadata,data:order()}});
   assert.equal(url.pathname,'/api/b2c/orders');const current=Number(url.searchParams.get('page'));
   return route.fulfill({headers,json:{...list(current,empty?0:2)}});
  });
  await page.clock.install();const base=process.env.HD_PREVIEW_URL||'http://127.0.0.1:5173';
  await page.goto(base+'/work/B2C/TIAL');await page.getByRole('heading',{name:'Daftar order TIAL',exact:true,level:1}).waitFor();await page.clock.runFor(500);await page.getByTitle(orderId()).waitFor();
  assert.equal(await page.locator('tbody tr').count(),2);assert.ok((await page.locator('main').innerText()).includes('bukan staging hd_b2c'));
  assert.equal(await page.getByLabel('STO',{exact:true}).isDisabled(),true);
  for(const tab of ['MENUNGGU','PROSES CEK','SELESAI','DUPLICATE'])assert.equal(await page.getByRole('button',{name:tab,exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:/^PICK$|^CEK$|^RECEK$|^DONE$|^GAGAL$/}).count(),0);
  await page.getByRole('button',{name:'Berikutnya',exact:true}).click();await page.clock.runFor(500);await page.getByTitle(orderId(2)).waitFor();assert.equal(calls.at(-1).query.page,'2');
  const before=calls.length;await page.clock.runFor(61000);await page.getByTitle(orderId(2)).waitFor();assert.ok(calls.length>before);
  await page.getByRole('button',{name:'SELESAI',exact:true}).click();await page.getByLabel('Cari order',{exact:true}).fill('SC-SYNTHETIC');await page.getByLabel('Tanggal order',{exact:true}).fill('2026-11-06');await page.clock.runFor(500);await page.getByTitle(orderId()).waitFor();
  assert.deepEqual(calls.at(-1).query,{module:'TIAL',date:'2026-11-06',status:'FINISHED',sto:'',q:'SC-SYNTHETIC',page:'1'});
  for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
   await page.setViewportSize(size);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.clock.runFor(500);await page.screenshot({path:`${directory}/${name}-tial.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  failure=true;await page.clock.runFor(61000);await page.getByRole('alert').waitFor();assert.equal(await page.locator('tbody tr').count(),2);assert.ok((await page.locator('main').innerText()).includes('Data terakhir belum berhasil diperbarui'));assert.ok(!(await page.locator('main').innerText()).includes('must not echo'));
  failure=false;empty=true;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await page.clock.runFor(500);await page.getByText('Tidak ada order TIAL sesuai filter.',{exact:true}).waitFor();
  empty=false;await page.getByRole('button',{name:'Reset filter',exact:true}).click();await page.clock.runFor(500);await page.getByTitle(orderId()).click();
  await page.getByRole('heading',{name:'Detail Order',exact:true}).waitFor();await page.getByRole('link',{name:'Dashboard B2C',exact:true}).waitFor();await page.getByRole('heading',{name:'Riwayat status',exact:true}).waitFor();assert.equal(await page.getByText('••••0001',{exact:true}).count(),1);
  await page.getByRole('button',{name:'Riwayat berikutnya',exact:true}).click();await page.getByRole('button',{name:'Riwayat sebelumnya',exact:true}).waitFor();assert.equal(historyPage,2);
  historyEmpty=true;await page.getByRole('button',{name:'Riwayat sebelumnya',exact:true}).click();await page.getByText('Belum ada riwayat status.',{exact:true}).waitFor();
  await page.screenshot({path:`${directory}/mobile-detail.png`,fullPage:true});
  failure=true;await page.reload();await page.getByRole('alert').waitFor();failure=false;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await page.getByText('Belum ada riwayat status.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Kembali ke daftar TIAL'}).click();await page.getByRole('link',{name:'Alat diagnostik staging'}).click();await page.getByRole('heading',{name:'Pratinjau integrasi order B2C'}).waitFor();
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>/^hdwork:(workspace|session|account):/.test(key))),false);assert.deepEqual(errors,[]);
  const demoContext=await browser.newContext(),demo=await demoContext.newPage();await demoContext.route('**/api/**',()=>assert.fail('Preview must not call operational API'));
  await demo.goto(base+'/preview/login');await demo.getByRole('button',{name:'Petugas HD',exact:true}).click();await demo.getByRole('button',{name:'Lanjutkan ke Pilih Pekerjaan'}).click();await demo.goto(base+'/preview/work/B2C/TIAL');await demo.getByRole('heading',{name:'Daftar order TIAL',exact:true,level:1}).waitFor();
  for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){await demo.setViewportSize(size);await demo.screenshot({path:`${directory}/${name}-preview.png`,fullPage:true});}
  console.log('PASS: JWT, hdwork2 source isolation, duplicate retention, tabs/filters/pagination/refresh, errors/empty, detail/history pagination, desktop/mobile, diagnostics and independent Preview. '+directory);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
