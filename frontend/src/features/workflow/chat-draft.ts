export type PendingReply={text:string;requestId:string;version:number};
export type ChatDraft={text:string;pending:PendingReply|null};
const prefix='hdwork2:chat-draft:';
export function readChatDraft(account:string,id:string):ChatDraft{try{const value=JSON.parse(sessionStorage.getItem(prefix+account+':'+id)||'null');if(!value||typeof value.text!=='string'||value.text.length>4096)return {text:'',pending:null};const p=value.pending;return {text:value.text,pending:p&&p.text===value.text.trim()&&/^[a-f0-9-]{36}$/i.test(p.requestId)&&Number.isSafeInteger(p.version)&&p.version>=0?p:null};}catch{return {text:'',pending:null};}}
export function saveChatDraft(account:string,id:string,value:ChatDraft){try{sessionStorage.setItem(prefix+account+':'+id,JSON.stringify(value));}catch{/* committed messages remain in MySQL; no automatic resend */}}
export function clearChatDrafts(){try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(prefix))sessionStorage.removeItem(key);}}catch{/* storage may be unavailable */}}
