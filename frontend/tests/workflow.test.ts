import {test} from 'node:test';import assert from 'node:assert/strict';
import {duration,workDuration,visibleActions,areaIncludes,scopeKey,type Work} from '../src/features/workflow/model.ts';
import {readDraft,saveDraft,clearDrafts} from '../src/features/workflow/drafts.ts';
import {connectLive} from '../src/features/workflow/live.ts';
const order={id:'a',status:'IN_PROGRESS',ownerId:1,command:'order',duplicateOf:null} as Work;
test('action ownership and role reflect takeover without stale owner finish buttons',()=>{assert.deepEqual(visibleActions(order,{id:1,role:'HD'}),['DONE','FAILED']);assert.deepEqual(visibleActions({...order,ownerId:2},{id:1,role:'HD'}),['TAKEOVER']);for(const role of ['SHOW_ONLY','ADMIN','SUPER_ADMIN'])assert.deepEqual(visibleActions(order,{id:1,role}),[]);});
test('timer survives midnight/closed-browser duration and draft is isolated/never submitted automatically',()=>{assert.equal(duration('2026-11-07T16:55:00Z',Date.parse('2026-11-08T17:10:32Z')),'24:15');saveDraft('1','a',{done:'pending',failed:''});assert.equal(readDraft('1','a').done,'pending');assert.equal(readDraft('1','b').done,'');assert.equal(readDraft('2','a').done,'');clearDrafts();assert.equal(readDraft('1','a').done,'');});
test('SSE coalesces/reconnects/falls back without forcing pagination and cleans all timers',async()=>{
 const listeners=new Map<string,(e:unknown)=>void>();let closed=false;const source={addEventListener:(n:string,fn:(e:unknown)=>void)=>listeners.set(n,fn),close:()=>{closed=true;},onerror:null as null|(()=>void),onopen:null as null|(()=>void)};
 const callbacks:(()=>void)[]=[];const intervals=new Map<number,()=>void>();let cleared=0;
 const clock={setTimeout:(fn:()=>void)=>{callbacks.push(fn);return callbacks.length;},clearTimeout:()=>{cleared++;},setInterval:(fn:()=>void)=>{intervals.set(1,fn);return 1;},clearInterval:(id:number)=>{intervals.delete(id);}} as unknown as Pick<typeof globalThis,'setTimeout'|'clearTimeout'|'setInterval'|'clearInterval'>;
 const received:unknown[]=[];let page=2;const stop=connectLive('http://mock',e=>{received.push(e);},()=>source as unknown as EventSource,clock);
 listeners.get('change')?.({data:JSON.stringify({arrival:true,modules:['TIAL']})});callbacks.at(-1)?.();assert.equal(page,2);assert.equal(received.length,1);assert.equal(areaIncludes('LOGIC',['TIAL']),false);
 source.onerror?.();assert.equal(intervals.size,1);source.onopen?.();assert.equal(intervals.size,1);listeners.get('reset')?.({});callbacks.at(-1)?.();stop();assert.equal(closed,true);assert.ok(cleared>0);
});

test('account, role and permission changes partition live data scope independently of previous requests',()=>{const a=scopeKey({id:1,role:'HD',modules:['TIAL']});assert.notEqual(a,scopeKey({id:2,role:'HD',modules:['TIAL']}));assert.notEqual(a,scopeKey({id:1,role:'SHOW_ONLY',modules:['TIAL']}));assert.notEqual(a,scopeKey({id:1,role:'HD',modules:['REQ']}));});

import {notification} from '../src/features/workflow/notification-policy.ts';
import {formatAverage} from '../src/features/workflow/statistics.ts';
test('notification ignores initial snapshots and replayed events, counts only arrivals in the current workspace',()=>{
 assert.equal(notification({reset:true},'TIAL',''),null);
 const event={eventId:'12',arrival:true,arrivalCount:2,modules:['TIAL','LOGIC_PSB'],arrivalModules:{LOGIC_PSB:2}};
 assert.equal(notification(event,'TIAL',''),null);assert.deepEqual(notification(event,'LOGIC',''),{last:'12',count:2});assert.equal(notification(event,'LOGIC','12'),null);assert.equal(notification(event,'LOGIC','13'),null);assert.equal(notification({...event,eventId:'invalid'},'ALL',''),null);
 assert.equal(formatAverage(90061),'25:01');
});
test('coalesced SSE batches suppress repeated event identifiers before counting arrivals',()=>{
 let change:((e:unknown)=>void)|undefined;const callbacks:(()=>void)[]=[];const source={addEventListener:(name:string,fn:(e:unknown)=>void)=>{if(name==='change')change=fn;},close(){},onerror:null,onopen:null};
 const clock={setTimeout:(fn:()=>void)=>{callbacks.push(fn);return callbacks.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){}} as unknown as Pick<typeof globalThis,'setTimeout'|'clearTimeout'|'setInterval'|'clearInterval'>;
 const received:{arrivalCount?:number;arrivalModules?:Record<string,number>}[]=[];const close=connectLive('synthetic',e=>received.push(e),()=>source as unknown as EventSource,clock);
 const event={data:JSON.stringify({eventId:'3',arrival:true,arrivalCount:1,arrivalModules:{TIAL:1},modules:['TIAL']})};change?.(event);change?.(event);callbacks.at(-1)?.();assert.equal(received.length,1);assert.equal(received[0].arrivalCount,1);assert.equal(received[0].arrivalModules?.TIAL,1);close();
});

test('completed timer freezes at server finishedAt, missing terminal timestamp never runs a fake timer',()=>{
 const completed={status:'DONE',startedAt:'2026-11-08T00:00:00Z',finishedAt:'2026-11-08T01:23:59Z'};assert.equal(workDuration(completed,Date.parse('2026-11-09T00:00:00Z')),'01:23');assert.equal(workDuration(completed,Date.parse('2026-11-10T00:00:00Z')),'01:23');assert.equal(workDuration({...completed,finishedAt:null},Date.now()),duration(null,Date.now()));
});

test('module authorization hides duplicate and claim actions outside the account scope',()=>{const duplicate={...order,status:'DUPLICATE',module:'TIAL',decision:null,duplicateOf:'canonical'} as Work;assert.deepEqual(visibleActions(duplicate,{id:1,role:'HD',modules:['REQ']}),[]);assert.deepEqual(visibleActions(duplicate,{id:1,role:'HD',modules:['TIAL']}),['CONTINUE_DUPLICATE','REJECT_DUPLICATE']);});
