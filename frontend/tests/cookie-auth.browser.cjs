const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);let logged=false,viewer=false,created=0,adminCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const csrf='a'.repeat(64);const profile=()=>({id:viewer?2:1,name:'Synthetic User',username:'synthetic',role:viewer?'SHOW_ONLY':'SUPER_ADMIN',city_id:null,modules:viewer?['REQ']:['TIAL','LOGIC_PSB','LOGIC_MO','REQ']});
 await context.addInitScript(()=>localStorage.setItem('hdwork:operational:auth:v1','obsolete-bearer'));
 await context.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());const headers={'access-control-allow-origin':req.headers().origin||'http://127.0.0.1:5190','access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type,X-CSRF-Token','access-control-allow-methods':'GET,POST,OPTIONS'};const reply=(json,status=200)=>route.fulfill({headers,json,status});if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});assert.equal(req.headers().authorization,undefined);
 if(url.pathname==='/api/auth/login'){logged=true;return reply({success:true,data:{user:profile(),csrf}});}
 if(url.pathname==='/api/auth/me')return logged?reply({success:true,data:profile(),csrf}):reply({success:false},401);
 if(req.method()==='POST')assert.equal(req.headers()['x-csrf-token'],csrf);
 if(url.pathname==='/api/auth/logout'){logged=false;return reply({success:true});}
 if(url.pathname.startsWith('/api/admin/users')){adminCalls++;assert.equal(viewer,false);if(req.method()==='POST'){created++;assert.equal(req.postDataJSON().role,'SHOW_ONLY');return reply({success:true,id:3},201);}return reply({success:true,data:[],hasMore:false,page:1});}
 if(url.pathname==='/api/b2c/orders'){assert.equal(url.searchParams.get('module'),'REQ');return reply({success:true,source:'HDWORK2',dateBasis:'telegram_business_day_jakarta',readOnly:true,actions:{PICK:false,CEK:false,RECEK:false,DONE:false,GAGAL:false},data:[],page:1,pageSize:25,hasMore:false,stoFilterAvailable:false});}
 throw Error('Unexpected mock API '+url.pathname);
 });
 const base=process.env.HD_PREVIEW_URL||'http://127.0.0.1:5190';await page.goto(base+'/login');await page.getByLabel('Username',{exact:true}).fill('synthetic');await page.getByLabel('Password',{exact:true}).fill('synthetic-password-123');await page.getByRole('button',{name:'Masuk workspace'}).click();await page.getByRole('button',{name:'Lanjutkan ke Pilih Pekerjaan'}).click();await page.goto(base+'/admin/users');await page.getByRole('heading',{name:'Manajemen Pengguna',exact:true}).waitFor();
 await page.getByLabel('Nama',{exact:true}).fill('Viewer');await page.getByLabel('Username',{exact:true}).fill('viewer');await page.getByLabel('Role',{exact:true}).selectOption('SHOW_ONLY');await page.getByLabel('Password baru',{exact:true}).fill('synthetic-password-123');await page.getByLabel('REQ',{exact:true}).check();await page.getByRole('button',{name:'Simpan',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[type=password]').value==='');assert.equal(created,1);
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.equal(await page.evaluate(()=>localStorage.getItem('hdwork:operational:auth:v1')),null);
 viewer=true;await page.evaluate(()=>sessionStorage.setItem('hdwork:operational:checkin:2','ONLINE'));await page.goto(base+'/work/B2C/REQ');await page.getByRole('heading',{name:'Daftar pekerjaan REQ',exact:true}).waitFor();await page.getByText('Tidak ada order TIAL sesuai filter.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Dashboard Admin',exact:true}).count(),0);const before=adminCalls;await page.goto(base+'/admin/users');await page.getByText('Akses manajemen pengguna belum tersedia atau tidak diizinkan.').waitFor();assert.equal(adminCalls,before);
 assert.equal(await page.getByRole('button',{name:/^PICK$|^CEK$|^DONE$|^GAGAL$/}).count(),0);assert.deepEqual(errors,[]);
 await page.goto(base+'/preview/login');await page.getByRole('heading',{name:'Selamat datang kembali'}).waitFor();assert.ok((await page.locator('body').innerText()).includes('DATA DEMO'));
 console.log('PASS: mocked cookie login, no bearer persistence, admin create/CSRF, responsive layout, SHOW_ONLY module/menu, direct admin denial, Preview unchanged.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
