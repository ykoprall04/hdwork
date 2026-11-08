let account:string|null=null;const drafts=new Map<string,{done:string;failed:string}>();
export function clearDrafts(){drafts.clear();account=null;}
export function accountDrafts(id:string){if(account!==id){drafts.clear();account=id;}}
export function readDraft(accountId:string,id:string){accountDrafts(accountId);return drafts.get(id)||{done:'',failed:''};}
export function saveDraft(accountId:string,id:string,value:{done:string;failed:string}){accountDrafts(accountId);drafts.set(id,value);}
export function removeDraft(id:string){drafts.delete(id);}
