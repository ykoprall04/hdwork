import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCookieFetch} from '../src/features/operational/cookie-transport.ts';
test('cookie transport removes bearer tokens, includes credentials and protects mutations with in-memory CSRF',async()=>{
 const calls:RequestInit[]=[];let csrf='csrf-test-only';
 const request=createCookieFetch((async(_url,init)=>{calls.push(init!);return new Response('{}');}) as typeof fetch,()=>csrf);
 await request('http://mock/auth/me',{headers:{Authorization:'Bearer sensitive'}});
 assert.equal(new Headers(calls[0].headers).has('Authorization'),false);assert.equal(calls[0].credentials,'include');assert.equal(calls[0].cache,'no-store');assert.equal(new Headers(calls[0].headers).has('X-CSRF-Token'),false);
 await request('http://mock/auth/logout',{method:'POST'});assert.equal(new Headers(calls[1].headers).get('X-CSRF-Token'),'csrf-test-only');
 csrf='';await request('http://mock/auth/login',{method:'POST'});assert.equal(new Headers(calls[2].headers).has('X-CSRF-Token'),false);
});
