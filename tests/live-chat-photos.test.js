const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {mkdtemp,writeFile,rm,mkdir,readdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {reply,createChat}=require('../src/chat/service');
const {outbound}=require('../src/courier/contract');
const {createRoutes}=require('../src/chat/routes');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=';
const id=randomUUID(), messageId=randomUUID(), user={id:2,username:'fixture',modules:['TIAL']};
const body={text:'',photo:png,requestId:randomUUID(),version:0};

test('photo-only replies are valid and preserve routing when encoded for Courier',()=>{
 assert.deepEqual(reply(body),body);
 for(const input of [{...body,photo:'PHN2Zz4='},{...body,text:'a'.repeat(1025)},{...body,photo:'a'.repeat(7*1024*1024+1)},{...body,chat_id:'-1001'}]){
  assert.throws(()=>reply(input),{statusCode:400});
 }
 const payload={method:'sendPhoto',chat_id:'-1001',telegram_thread_id:'2',thread_mode:'thread',reply_to_message_id:'3',text:'',photoKey:'a'.repeat(64)};
 assert.deepEqual(outbound(payload),payload);
 assert.equal(outbound({...payload,method:'sendDocument'}).method,'sendDocument');
 assert.throws(()=>outbound({...payload,telegram_thread_id:null}),{statusCode:400});
});

test('photo reads are scoped to message, order and module and serve bytes instead of Telegram IDs',async t=>{
 const previous=process.env.HDWORK2_CHAT_MEDIA_DIR;
 const dir=await mkdtemp(join(tmpdir(),'hdwork-chat-photo-'));
 process.env.HDWORK2_CHAT_MEDIA_DIR=dir;
 t.after(async()=>{
  if(previous===undefined)delete process.env.HDWORK2_CHAT_MEDIA_DIR;
  else process.env.HDWORK2_CHAT_MEDIA_DIR=previous;
  await rm(dir,{recursive:true,force:true});
 });
 const bot='fixture-bot',fileId='fixture-photo';
 const key=createHash('sha256').update(bot+'\0'+fileId).digest('hex');
 await mkdir(join(dir,'requests'));
 await mkdir(join(dir,'outgoing'));
 await writeFile(join(dir,key+'.img'),Buffer.from(png,'base64'));
 let row={direction:'IN',bot_id:bot,attachments:[{kind:'photo',file_id:fileId}]};
 const chat=createChat({readPool:{async execute(sql,values){
  assert.match(sql,/m.id=\? AND m.order_id=\? AND o.access_module IN/);
  return [[values.join(',')===[messageId,id,'TIAL'].join(',')?row:undefined]];
 }}});
 assert.deepEqual(await chat.photo(id,messageId,user),{type:'image/png',bytes:Buffer.from(png,'base64')});
 await assert.rejects(chat.photo(randomUUID(),messageId,user),{statusCode:404});
 await assert.rejects(chat.photo(id,messageId,{...user,modules:['REQ']}),{statusCode:404});
 row={direction:'IN',bot_id:bot,attachments:[{kind:'photo',file_id:'full-missing',thumbnail_file_id:fileId}]};
 assert.deepEqual(await chat.photo(id,messageId,user,{thumbnail:true}),{type:'image/png',bytes:Buffer.from(png,'base64')});
 await assert.rejects(chat.photo(id,messageId,user),{statusCode:404});
 assert.deepEqual(await readdir(join(dir,'requests')),[]);
 assert.equal(await chat.photo(id,messageId,user,{requestDownload:true}),null);
 assert.equal(await chat.photo(id,messageId,user,{requestDownload:true}),null);
 assert.equal((await readdir(join(dir,'requests'))).length,1);
 row={direction:'IN',bot_id:bot,telegram_timestamp:Math.floor(Date.now()/1000),attachments:[{kind:'photo',file_id:'another',thumbnail_file_id:'new-thumb'}]};
 assert.equal(await chat.photo(id,messageId,user,{thumbnail:true}),null);
 row.telegram_timestamp=1700000000;
 row.attachments[0].thumbnail_file_id='expired-thumb';
 await assert.rejects(chat.photo(id,messageId,user,{thumbnail:true}),{statusCode:404});
 assert.equal((await readdir(join(dir,'requests'))).length,2);
 const outboundKey=await require('../src/chat/photos').storeOutgoing(user.id,body.requestId,png);
 const stored=join(dir,'outgoing',outboundKey+'.img');
 assert.deepEqual(await require('node:fs/promises').readFile(stored),Buffer.from(png,'base64'));
 row={direction:'OUT',attachments:[{kind:'photo',key:outboundKey}]};
 assert.deepEqual(await chat.photo(id,messageId,user),{type:'image/png',bytes:Buffer.from(png,'base64')});
});

test('history publishes the image indicator without attachment data',async()=>{
 const chat=createChat({photosEnabled:true,sharedGroups:false,readPool:{async execute(sql){
  if(sql.includes('SELECT id,bot_id'))return [[{id}]];
  assert.match(sql,/JSON_CONTAINS/);
  return [[{id:messageId,seq:'1',direction:'OUT',body:'',hasPhoto:'1',attachments:[{kind:'photo',data:png}]}]];
 }}});
 const result=await chat.messages(id,{},user);
 assert.equal(result.photosEnabled,true);
 assert.equal(result.data[0].hasPhoto,true);
 assert.ok(!JSON.stringify(result).includes(png));
});

test('photo upload checks CSRF, forwards image-only messages and limits large bodies',async t=>{
 const app=require('express')();
 const http={
  auth(req,_res,next){req.user=user;req.sessionToken='fixture';next();},
  csrf(req){if(!req.get('X-Test-CSRF'))throw Object.assign(Error(),{statusCode:403});},
 };
 let calls=0;
 app.use(createRoutes({http,enabled:()=>true,chat:{
  async send(order,token,actor,input){assert.deepEqual([order,token,actor,input],[id,'fixture',2,body]);calls++;return {success:true};},
  async photo(){return {type:'image/png',bytes:Buffer.from(png,'base64')};},
 }}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port+'/'+id;
 const send=(input,csrf)=>fetch(base+'/photos',{method:'POST',headers:{'Content-Type':'application/json',...(csrf?{'X-Test-CSRF':'fixture'}:{})},body:JSON.stringify(input)});
 assert.equal((await send(body,false)).status,403);
 assert.equal((await send({...body,photo:'a'.repeat(7*1024*1024+1)},true)).status,413);
 assert.equal((await send(body,true)).status,200);
 assert.equal(calls,1);
 const photo=await fetch(base+'/messages/'+messageId+'/photo');
 assert.equal(photo.headers.get('cache-control'),'no-store');
 assert.equal(photo.headers.get('x-content-type-options'),'nosniff');
 assert.equal(Buffer.from(await photo.arrayBuffer()).toString('base64'),png);
});
