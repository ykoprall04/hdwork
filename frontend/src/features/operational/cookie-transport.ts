// Stateless credentialed transport; CSRF stays in provider memory, never browser storage.
export function createCookieFetch(request:typeof fetch,csrf:()=>string):typeof fetch{
 return (input,init={})=>{const headers=new Headers(init.headers);headers.delete('Authorization');if(!['GET','HEAD'].includes(init.method||'GET')&&csrf())headers.set('X-CSRF-Token',csrf());return request(input,{...init,headers,credentials:'include',cache:'no-store'});};
}
