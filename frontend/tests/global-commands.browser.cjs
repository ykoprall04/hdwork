// Built frontend + synthetic API only. No production endpoint, DB or Telegram.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../../.local/global-commands-dist');
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  const actual=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'index.html');
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[path.extname(actual)]||'application/octet-stream');
  fs.createReadStream(actual).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);
  const commands=Object.fromEntries(['order','req','config_psb','mo'].map(k=>[k,{enabled:true,version:0}]));
  let role='SUPER_ADMIN',writes=0,offline=false,supported=true,applied=true;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let acknowledged=structuredClone(commands);
  await context.addInitScript(()=>sessionStorage.setItem('hdwork:operational:checkin:1','ONLINE'));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===base)return route.continue();
   if(url.origin!=='https://hdwork-test.invalid')return route.abort();
   const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type,X-CSRF-Token'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   let json={success:true},status=200;
   if(url.pathname==='/api/auth/me')json={success:true,csrf:'a'.repeat(64),data:{id:1,name:'Synthetic',username:'synthetic',role,modules:['TIAL'],city_id:null}};
   else if(url.pathname==='/api/operations/system/commands'){
    if(offline){status=503;json={message:'Synthetic failure'};}
    else if(route.request().method()==='POST'){
     const body=route.request().postDataJSON();assert.equal(role,'SUPER_ADMIN');assert.equal(route.request().headers()['x-csrf-token'],'a'.repeat(64));
     assert.equal(body.version,commands[body.command].version);assert.match(body.requestId,/^[a-f0-9-]{36}$/);
     commands[body.command]={enabled:body.enabled,version:body.version+1};writes++;if(applied)acknowledged=structuredClone(commands);json={success:true,stored:true,command:body.command,...commands[body.command]};
    }else json={success:true,commands,capability:{supported,ready:supported},effective:Object.fromEntries(Object.keys(commands).map(k=>[k,{state:!supported?'UNAVAILABLE':acknowledged[k].version===commands[k].version?'EFFECTIVE':'PENDING',enabled:supported?acknowledged[k].enabled:null,version:supported?acknowledged[k].version:null}]))};
   }else if(url.pathname.endsWith('/status'))json={checkedAt:new Date().toISOString(),components:{},queue:null,incidents:[]};
   else if(url.pathname.endsWith('/readiness'))json={configured:true,readyForControlledTest:false,liveVerified:false,categories:[]};
   else if(/\/(mappings|history|backups)$/.test(url.pathname))json={data:[]};
   await route.fulfill({status,headers,json});
  });
  await page.goto(base+'/admin/system');await page.getByText('Command Telegram global',{exact:true}).waitFor();
  for(const label of ['order','req','config_psb','MO']){
   const toggle=page.getByRole('switch',{name:`Aktifkan /${label} secara global`,exact:true});
   await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'true');
   await toggle.click();await page.waitForFunction(text=>[...document.querySelectorAll('[role="switch"]')].some(el=>el.getAttribute('aria-label')===text&&el.getAttribute('aria-checked')==='false'),`Aktifkan /${label} secara global`);
   await toggle.click();await page.waitForFunction(text=>[...document.querySelectorAll('[role="switch"]')].some(el=>el.getAttribute('aria-label')===text&&el.getAttribute('aria-checked')==='true'),`Aktifkan /${label} secara global`);
  }
  assert.equal(writes,8);
  applied=false;
  await page.getByRole('switch').first().click();await page.locator('[data-command="order"]').getByText('TERSIMPAN: OFF',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-command="order"]').getByText('EFEKTIF: OFF',{exact:true}).count(),0);
  acknowledged=structuredClone(commands);await page.getByRole('button',{name:'Muat ulang pengaturan',exact:true}).click();await page.locator('[data-command="order"]').getByText('EFEKTIF: OFF',{exact:true}).waitFor();
  supported=false;await page.getByRole('button',{name:'Muat ulang pengaturan',exact:true}).click();await page.getByText('Courier belum mendukung atau cache belum siap. OFF belum dapat diterapkan.',{exact:true}).waitFor();
  assert.equal(await page.getByText('EFEKTIF: OFF',{exact:true}).count(),0);assert.equal(await page.getByRole('switch').nth(1).isDisabled(),true);
  supported=true;applied=true;await page.getByRole('button',{name:'Muat ulang pengaturan',exact:true}).click();await page.waitForFunction(()=>!document.querySelectorAll('[role="switch"]')[1].disabled);
  offline=true;await page.getByRole('switch').first().click();await page.getByRole('alert').filter({hasText:'Synthetic failure'}).waitFor();
  for(const toggle of await page.getByRole('switch').all())assert.equal(await toggle.isDisabled(),true);
  offline=false;await page.getByRole('button',{name:'Muat ulang pengaturan',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="switch"]')].every(el=>!el.disabled));
  role='ADMIN';await page.reload();await page.getByRole('heading',{name:'Monitoring Sistem',exact:true}).waitFor();assert.equal(await page.getByRole('switch').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',toggleWrites:writes,commandsTested:4,errorDisablesToggles:true,adminCannotToggle:true,oldCourierCannotShowEffectiveOff:true,storedVsEffective:true,externalRequests:0}));
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
