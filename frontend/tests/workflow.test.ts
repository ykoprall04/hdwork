import {test} from 'node:test';import assert from 'node:assert/strict';
import {duration,visibleActions,areaIncludes,scopeKey,type Work} from '../src/features/workflow/model.ts';
import {readDraft,saveDraft,clearDrafts} from '../src/features/workflow/drafts.ts';
import {connectLive} from '../src/features/workflow/live.ts';
const order={id:'a',status:'IN_PROGRESS',ownerId:1,command:'order',duplicateOf:null} as Work;
test('action ownership and role reflect takeover without stale owner finish buttons',()=>{assert.deepEqual(visibleActions(order,{id:1,role:'HD'}),['DONE','FAILED']);assert.deepEqual(visibleActions({...order,ownerId:2},{id:1,role:'HD'}),['TAKEOVER']);for(const role of ['SHOW_ONLY','ADMIN','SUPER_ADMIN'])assert.deepEqual(visibleActions(order,{id:1,role}),[]);});
test('timer survives midnight/closed-browser duration and draft is isolated/never submitted automatically',()=>{assert.equal(duration('2026-11-07T16:55:00Z',Date.parse('2026-11-08T17:10:32Z')),'24:15:32');saveDraft('1','a',{done:'pending',failed:''});assert.equal(readDraft('1','a').done,'pending');assert.equal(readDraft('1','b').done,'');assert.equal(readDraft('2','a').done,'');clearDrafts();assert.equal(readDraft('1','a').done,'');});
test('SSE coalesces/reconnects/falls back without forcing pagination and cleans all timers',async()=>{
 const listeners=new Map<string,(e:unknown)=>void>();let closed=false;const source={addEventListener:(n:string,fn:(e:unknown)=>void)=>listeners.set(n,fn),close:()=>{closed=true;},onerror:null as null|(()=>void),onopen:null as null|(()=>void)};
 const callbacks:(()=>void)[]=[];const intervals=new Map<number,()=>void>();let cleared=0;
 const clock={setTimeout:(fn:()=>void)=>{callbacks.push(fn);return callbacks.length;},clearTimeout:()=>{cleared++;},setInterval:(fn:()=>void)=>{intervals.set(1,fn);return 1;},clearInterval:(id:number)=>{intervals.delete(id);}} as unknown as Pick<typeof globalThis,'setTimeout'|'clearTimeout'|'setInterval'|'clearInterval'>;
 const received:unknown[]=[];let page=2;const stop=connectLive('http://mock',e=>{received.push(e);},()=>source as unknown as EventSource,clock);
 listeners.get('change')?.({data:JSON.stringify({arrival:true,modules:['TIAL']})});callbacks.at(-1)?.();assert.equal(page,2);assert.equal(received.length,1);assert.equal(areaIncludes('LOGIC',['TIAL']),false);
 source.onerror?.();assert.equal(intervals.size,1);source.onopen?.();assert.equal(intervals.size,0);listeners.get('reset')?.({});callbacks.at(-1)?.();stop();assert.equal(closed,true);assert.ok(cleared>0);
});

test('account, role and permission changes partition live data scope independently of previous requests',()=>{const a=scopeKey({id:1,role:'HD',modules:['TIAL']});assert.notEqual(a,scopeKey({id:2,role:'HD',modules:['TIAL']}));assert.notEqual(a,scopeKey({id:1,role:'SHOW_ONLY',modules:['TIAL']}));assert.notEqual(a,scopeKey({id:1,role:'HD',modules:['REQ']}));});
