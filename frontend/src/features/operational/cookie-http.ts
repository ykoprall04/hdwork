import {createCookieFetch} from './cookie-transport';
export const cookieMode=import.meta.env.VITE_HDWORK2_AUTH_COOKIE==='true';
let csrf='';
export function setCsrf(value:string){csrf=value;}
export const cookieFetch=createCookieFetch((input,init)=>fetch(input,init),()=>csrf);
