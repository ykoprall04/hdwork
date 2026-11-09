// Only reads authenticated page/API state. Never reads input fields or cookies.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),orderId='7790b19e-f9d4-4c79-ae43-2ad10cdbf405',reference='LIVE-AO20261108142737';
async function run(){
 const mode=process.argv.slice(2).join(' ');if(!['--verify','--logout'].includes(mode))throw Error('Verification mode required');
 const active=JSON.parse(fs.readFileSync(path.join(root,'.local/live-order-browser.active.json'),'utf8')),folder=path.resolve(active.folder);
 if(!folder.startsWith(path.join(root,'.local/live-browser-')))throw Error('Profile rejected');
 const window=JSON.parse(fs.readFileSync(path.join(folder,'report.json'),'utf8'));if(window.status==='CLOSED'||Date.now()>=Date.parse(window.expiresAt))throw Error('Window expired');
 const data=fs.readFileSync(path.join(folder,'profile/DevToolsActivePort'),'utf8'),port=Number(data.split('\n')[0]);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Debug port rejected');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)})).json();
 const page=pages.find(p=>p.type==='page'&&p.url.startsWith('https://localhost:8443/'));if(!page)throw Error('Owned page unavailable');
 const url=new URL(page.webSocketDebuggerUrl);if(url.hostname!=='127.0.0.1'||Number(url.port)!==port)throw Error('Target rejected');
 const events={blockedRequests:0,networkCodes:[],pageExceptionCount:0};const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let client;
 try{
  client=await require('./diagnose-browser').connectDevTools(url.href,events,controller.signal,e=>controller.abort(e));await client.call('Page.enable');await client.call('Runtime.enable');
  const evaluate=async expression=>{const r=await client.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Page evaluation failed');return r.result.value;};
  const me=await evaluate("fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(async r=>{const v=await r.json();return {status:r.status,role:v.data?.role||null,id:v.data?.id||null};})");
  if(me.status!==200||me.role!=='SUPER_ADMIN'){console.log(JSON.stringify({status:'WAITING_FOR_USER_LOGIN',me:me.status,role:me.role,credentialsRead:false}));return;}
  if(mode==='--logout'){
   const clicked=await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Logout'&&!b.disabled);if(b)b.click();return !!b;})()");if(!clicked)throw Error('Logout unavailable');
   let after;for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,150));after=await evaluate("fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(r=>r.status)");if(after===401)break;}
   if(after!==401)throw Error('Logout not verified');const report={status:'PASS',logoutThroughUi:true,meAfterLogout:401,credentialsRead:false,cookiesRecorded:false,verifiedAt:new Date().toISOString()};fs.writeFileSync(path.join(folder,'logout-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return;
  }
  await client.call('Page.navigate',{url:'https://localhost:8443/orders/'+orderId});
  let visible;
  for(let n=0;n<60;n++){
   await new Promise(r=>setTimeout(r,200));
   const at=await evaluate("({path:location.pathname,reference:document.body.innerText.includes('LIVE-AO20261108142737'),order:document.body.innerText.includes('7790b19e-f9d4-4c79-ae43-2ad10cdbf405'),passwordForm:!!document.querySelector('input[type=password]')})");
   if(at.path==='/check-in'){await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Lanjutkan ke Pilih Pekerjaan');if(b)b.click();return !!b;})()");await new Promise(r=>setTimeout(r,300));await client.call('Page.navigate',{url:'https://localhost:8443/orders/'+orderId});}
   if(at.reference&&at.order&&!at.passwordForm){visible=at;break;}
  }
  if(!visible)throw Error('Order not visible in browser');
  const detail=await evaluate("fetch('/api/operations/orders/7790b19e-f9d4-4c79-ae43-2ad10cdbf405',{credentials:'include',cache:'no-store'}).then(async r=>{const v=await r.json();return {status:r.status,id:v.data?.id,reference:v.data?.scIn,orderStatus:v.data?.status,version:v.data?.version,historyEntries:v.history?.length};})");
  if(detail.status!==200||detail.id!==orderId||detail.reference!==reference)throw Error('Authenticated detail mismatch');
  const image=await client.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(folder,'order-browser.png'),Buffer.from(image.data,'base64'));
  const report={status:'PASS',verifiedAt:new Date().toISOString(),role:me.role,actorUserId:me.id,orderId,reference,orderStatus:detail.orderStatus,version:detail.version,historyEntries:detail.historyEntries,browserVisible:true,apiStatus:detail.status,screenshot:path.relative(root,path.join(folder,'order-browser.png')),credentialsRead:false,cookiesRecorded:false};
  fs.writeFileSync(path.join(folder,'browser-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{clearTimeout(timer);client?.close();controller.abort();}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'REAL_BROWSER_VERIFICATION_FAILED',credentialsRead:false}));process.exitCode=1;});
