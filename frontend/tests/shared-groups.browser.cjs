// Local browser fixtures only; never connects to production or Telegram.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 for(const role of ['HD','ADMIN','SUPER_ADMIN']){
  const context=await browser.newContext(),page=await context.newPage();let saved=null;let rows=[];
  await context.addInitScript(()=>{sessionStorage.setItem('hdwork:operational:checkin:2','ONLINE');window.EventSource=class extends EventTarget{close(){}};});
  await context.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());const headers={'access-control-allow-origin':req.headers().origin||'http://127.0.0.1:5196','access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type,X-CSRF-Token'};const reply=json=>route.fulfill({headers,json});if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
   if(url.pathname==='/api/auth/me')return reply({success:true,data:{id:2,name:'Fixture '+role,username:'fixture.user',role,city_id:null,modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO','ASSUREN','B2B','REPLACEMENT']},csrf:'a'.repeat(64)});
   if(url.pathname.endsWith('/system/status'))return reply({checkedAt:new Date().toISOString(),components:{api:'ONLINE',mysql:'UNKNOWN'},queue:null,workers:[{botId:'synthetic-bot'}],incidents:[]});
   if(url.pathname.endsWith('/system/mappings')){
    if(req.method()==='POST'){saved=req.postDataJSON();assert.equal(req.headers()['x-csrf-token'],'a'.repeat(64));rows=[{...saved}];return reply({success:true,id:saved.id,version:0});}
    return reply({data:rows,sharedGroups:true});
   }
   if(url.pathname.endsWith('/b2c/readiness'))return reply({configured:false,readyForControlledTest:false});
   return reply({success:true,data:[]});
  });
  await page.goto((process.env.HD_PREVIEW_URL||'http://127.0.0.1:5196')+'/admin/system');
  await page.getByRole('heading',{name:'Monitoring Sistem'}).waitFor();
  if(role==='HD'){assert.equal(await page.getByRole('button',{name:'Tambah grup'}).count(),0);}
  else{
   await page.getByRole('button',{name:'Tambah grup'}).click();await page.getByLabel('Nama grup').fill('Operasional bersama');await page.getByLabel('Chat ID',{exact:true}).fill('-100123');
   assert.equal(await page.getByLabel('Kategori',{exact:true}).count(),0);assert.equal(await page.getByLabel('Profile',{exact:true}).count(),0);
   await page.getByRole('checkbox',{name:/Operator telah memverifikasi/}).check();await page.getByRole('checkbox',{name:'Grup diizinkan',exact:true}).check();await page.getByRole('button',{name:'Simpan grup'}).click();await page.getByRole('cell',{name:'Operasional bersama',exact:true}).waitFor();
   assert.equal(saved.category,'ALL');assert.equal(saved.profile,'ALL');assert.equal(saved.threadId,null);assert.equal(saved.enabled,true);assert.equal(saved.botId,'synthetic-bot');
   await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.getByLabel('Chat ID',{exact:true}).isDisabled(),true);await page.getByRole('checkbox',{name:'Grup diizinkan',exact:true}).uncheck();await page.getByRole('button',{name:'Simpan grup'}).click();await page.getByRole('cell',{name:'Nonaktif',exact:true}).waitFor();assert.equal(saved.enabled,false);
  }
  await context.close();
 }
 console.log('SHARED_GROUPS_BROWSER_PASS: HD read-only; ADMIN/SUPER_ADMIN add ALL group, immutable destination and disable with CSRF.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
