const prefix='hdwork2:incoming-cursor:';
const memory=new Map<string,string>();
export const cursorKey=(account:string,id:string)=>prefix+encodeURIComponent(account)+':'+id;
export function validSequence(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9]\d{0,19})$/.test(value);}
export function later(a:string,b:string){return a.length>b.length||a.length===b.length&&a>b;}
export function readCursor(account:string,id:string){
 const key=cursorKey(account,id);let saved:string|null=null;
 try{saved=localStorage.getItem(key);}catch{/* session fallback below */}
 const fallback=memory.get(key);
 return validSequence(saved)?fallback&&later(fallback,saved)?fallback:saved:fallback??null;
}
export function saveCursor(account:string,id:string,sequence:string){
 if(!validSequence(sequence))return false;
 const previous=readCursor(account,id);if(previous&&!later(sequence,previous))return true;
 const key=cursorKey(account,id);memory.set(key,sequence);let persisted=true;
 try{localStorage.setItem(key,sequence);}catch{persisted=false;}
 window.dispatchEvent(new Event('hdwork2:incoming-read'));return persisted;
}
export function initializeCursor(account:string,id:string,sequence:string){
 if(validSequence(sequence)&&readCursor(account,id)===null)return saveCursor(account,id,sequence);
 return true;
}
export function unread(account:string,id:string,sequence:string){const cursor=readCursor(account,id);return validSequence(sequence)&&cursor!==null&&later(sequence,cursor);}
export function sortUnread<T extends {id:string}>(orders:T[],isUnread:(id:string)=>boolean){return orders.map((order,index)=>({order,index})).sort((a,b)=>Number(isUnread(b.order.id))-Number(isUnread(a.order.id))||a.index-b.index).map(x=>x.order);}
