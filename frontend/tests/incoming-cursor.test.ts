import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cursorKey,initializeCursor,later,readCursor,saveCursor,sortUnread,unread} from '../src/features/workflow/incoming-cursor.ts';

test('baseline, account/order isolation, monotonic BIGINT cursor, stable unread priority and storage fallback',()=>{
 const values=new Map<string,string>();let blocked=false;
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>{if(blocked)throw Error('blocked');return values.get(k)??null;},setItem:(k:string,v:string)=>{if(blocked)throw Error('quota');values.set(k,v);}}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
 try{
  assert.equal(initializeCursor('batch3','a','9007199254740993'),true);assert.equal(unread('batch3','a','9007199254740993'),false);
  assert.equal(unread('batch3','a','9007199254740994'),true);assert.equal(readCursor('other','a'),null);assert.equal(readCursor('batch3','b'),null);
  initializeCursor('batch3','a','9999999999999999');assert.equal(readCursor('batch3','a'),'9007199254740993');
  saveCursor('batch3','a','9007199254740994');saveCursor('batch3','a','3');assert.equal(readCursor('batch3','a'),'9007199254740994');
  values.set(cursorKey('batch3','a'),'18446744073709551615');assert.equal(readCursor('batch3','a'),'18446744073709551615');
  assert.equal(later('10','9'),true);assert.equal(later('18446744073709551615','18446744073709551614'),true);
  assert.deepEqual(sortUnread([{id:'a'},{id:'b'},{id:'c'},{id:'d'}],id=>['b','d'].includes(id)).map(o=>o.id),['b','d','a','c']);
  blocked=true;assert.equal(saveCursor('batch3','b','10'),false);assert.equal(readCursor('batch3','b'),'10');assert.equal(unread('batch3','b','11'),true);
  assert.equal(saveCursor('batch3','b','NaN'),false);assert.equal(readCursor('batch3','b'),'10');
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');
 }
});
