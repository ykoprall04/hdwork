// Synthetic browser fixtures only. No database, DPAPI or production integrations.
const express=require('express'),path=require('node:path'),{randomUUID}=require('node:crypto');
const origin='https://localhost:8443';
function createMockApi(){
 const app=express(),state={role:'HD',modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO','ASSUREN','B2B','REPLACEMENT'],expired:false,session:null,loginCount:0,logoutCount:0,requests:0};
 const csrf='b'.repeat(64),counts={total:1,waiting:1,process:0,done:0,failed:0};
 const profile=()=>({id:9001,name:'QA Synthetic User',username:'qa.synthetic',role:state.role,modules:state.modules,city_id:null});
 const orders=['TIAL','ASSUREN','B2B','REPLACEMENT'].map(module=>({id:randomUUID(),module,command:'manual',status:'WAITING',version:0,scIn:'QA-'+module,inetMasked:null,ownerId:null,ownerName:null,finalName:null,decision:null,duplicateOf:null,receivedAt:'2026-11-08T01:00:00.000Z',startedAt:null,finishedAt:null,note:null}));
 app.disable('x-powered-by');app.use(express.json({limit:'8kb'}));
 app.use('/api',(_req,res,next)=>{state.requests++;res.set('Cache-Control','no-store');next();});
 const valid=req=>Boolean(state.session&&!state.expired&&(req.headers.cookie||'').split(';').some(part=>part.trim()==='__Host-hdwork2-session='+state.session));
 app.post('/api/auth/login',(req,res)=>{
  if(req.headers.origin!==origin||req.body?.username!=='qa.synthetic'||req.body?.password!=='qa-only-not-a-real-password')return res.status(401).json({success:false});
  state.session=randomUUID();state.expired=false;state.loginCount++;
  res.set('Set-Cookie',`__Host-hdwork2-session=${state.session}; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=28800`);
  res.json({success:true,data:{user:profile(),csrf}});
 });
 app.get('/api/auth/me',(req,res)=>valid(req)?res.json({success:true,data:profile(),csrf}):res.status(401).json({success:false}));
 app.post('/api/auth/logout',(req,res)=>{
  if(!valid(req))return res.status(401).json({success:false});
  if(req.headers.origin!==origin||req.headers['x-csrf-token']!==csrf)return res.status(403).json({success:false});
  state.session=null;state.logoutCount++;res.set('Set-Cookie','__Host-hdwork2-session=; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=0');res.json({success:true});
 });
 app.use('/api',(req,res,next)=>valid(req)?next():res.status(401).json({success:false}));
 // Browser QA validates navigation/auth, not long-lived SSE. A bounded stream
 // avoids exhausting Chrome's HTTP/1 connection pool during full-page reloads.
 app.get('/api/operations/events',(_req,res)=>{res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.end('retry: 60000\nevent: reset\ndata: {}\n\n');});
 app.get('/api/operations/overview',(_req,res)=>res.json({success:true,all:counts,TIAL:counts,LOGIC:{total:0,waiting:0,process:0,done:0,failed:0}}));
 app.get('/api/operations/recap',(_req,res)=>res.json({success:true,data:counts,serverNow:new Date().toISOString()}));
 app.get('/api/operations/people',(_req,res)=>res.json({success:true,data:[],page:1,hasMore:false}));
 app.get('/api/operations/orders',(req,res)=>{
  const allowed={TIAL:['TIAL','REQ'],LOGIC:['LOGIC_PSB','LOGIC_MO'],ASSUREN:['ASSUREN'],B2B:['B2B'],REPLACEMENT:['REPLACEMENT']}[req.query.area]||[];
  if(!allowed.some(module=>state.modules.includes(module)))return res.status(403).json({success:false});
  res.json({success:true,data:orders.filter(o=>allowed.includes(o.module)&&state.modules.includes(o.module)),page:1,hasMore:false,serverNow:new Date().toISOString()});
 });
 app.use('/api',(_req,res)=>res.status(403).json({success:false}));
 app.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
 app.get('/{*rest}',(_req,res)=>res.sendFile(path.resolve(__dirname,'../../frontend/dist/index.html')));
 return {app,state};
}
module.exports={createMockApi};
