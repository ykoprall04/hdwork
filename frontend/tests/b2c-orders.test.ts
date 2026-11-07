import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderApi } from '../src/features/b2c-orders/transport.ts';
import { reconcileOrders, type OrderResult } from '../src/features/b2c-orders/model.ts';
const actions={PICK:false,CEK:false,RECEK:false,DONE:false,GAGAL:false};
const row={id:'00000000-0000-4000-8000-000000000001',module:'TIAL',date:'2026-11-08',status:'WAITING',scIn:'SC-SYNTHETIC',inetMasked:'••••0001',sto:null,duplicateOf:null,receivedAt:null,startedAt:null,finishedAt:null};
const body=()=>({success:true,source:'HDWORK2',readOnly:true,dateBasis:'telegram_business_day_jakarta',actions,data:[row],page:1,pageSize:25,hasMore:false,stoFilterAvailable:false});
test('JWT transport uses read-only endpoints, filters and bounded pagination without storage/demo',async()=>{
 const calls:{url:string;init:RequestInit|undefined}[]=[];
 const api=createOrderApi('http://mock/api',(async(url,init)=>{calls.push({url:String(url),init});const response=body();return new Response(JSON.stringify(String(url).includes('/history')?response:String(url).includes(row.id)?{...response,data:row}:response));}) as typeof fetch);
 const result=await api.list('synthetic-token',{module:'TIAL',date:'2026-11-08',page:2,limit:25,status:'WAITING',q:'SC/IN'});
 assert.equal(result.source,'HDWORK2');assert.match(calls[0].url,/\/b2c\/orders\?/);assert.match(calls[0].url,/page=2/);
 assert.deepEqual(calls[0].init?.headers,{Authorization:'Bearer synthetic-token'});assert.equal(calls[0].init?.cache,'no-store');assert.equal(calls[0].init?.method,undefined);
 await api.detail('synthetic-token',row.id);await api.history('synthetic-token',row.id,2);assert.match(calls[2].url,/history\?page=2&limit=25/);
});
test('empty responses stay empty; auth/server errors and wrong source never fall back to DEMO or staging',async()=>{
 const empty=createOrderApi('http://mock/api',(async()=>new Response(JSON.stringify({...body(),data:[]}))) as typeof fetch);
 assert.deepEqual((await empty.list('dummy',{})).data,[]);
 for(const status of [401,403,404,429,503]){
  const api=createOrderApi('http://mock/api',(async()=>new Response('private database error',{status})) as typeof fetch);
  await assert.rejects(api.list('dummy',{}),(e:unknown)=>(e as {status:number}).status===status && !(e as Error).message.includes('private'));
 }
 for(const change of [{source:'MYSQL_STAGING'},{source:'DEMO'},{actions:{...actions,DONE:true}},{readOnly:false}]){
  const api=createOrderApi('http://mock/api',(async()=>new Response(JSON.stringify({...body(),...change}))) as typeof fetch);
  await assert.rejects(api.list('dummy',{}));
 }
});
test('abort is forwarded and unchanged refresh rows retain identity with no merging of duplicate references',async()=>{
 const controller=new AbortController();let seen:AbortSignal|null|undefined;
 const api=createOrderApi('http://mock/api',(async(_url,init)=>{seen=init?.signal;throw new DOMException('Aborted','AbortError');}) as typeof fetch);
 controller.abort();await assert.rejects(api.list('dummy',{},controller.signal),{name:'AbortError'});assert.equal(seen,controller.signal);
 const previous=body() as OrderResult;previous.data.push({...previous.data[0],id:'00000000-0000-4000-8000-000000000002'});
 assert.equal(reconcileOrders(previous,structuredClone(previous)),previous);
 const changed=structuredClone(previous);changed.data[1].status='DONE';const next=reconcileOrders(previous,changed);
 assert.equal(next.data[0],previous.data[0]);assert.notEqual(next.data[1],previous.data[1]);assert.equal(next.data.length,2);
});
