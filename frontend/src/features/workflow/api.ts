import {API_URL} from '@/config/api';
import {cookieMode,cookieFetch} from '../operational/cookie-http';
export const operationsEnabled=cookieMode&&import.meta.env.VITE_HDWORK2_OPERATIONS==='true';
export const operationsBase=`${API_URL}/operations`;
export async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{const response=await cookieFetch(operationsBase+path,{signal,method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(Error(error.message||'Layanan pekerjaan belum tersedia'),{status:response.status,retryAfter:Math.min(600,Math.max(1,Number(response.headers.get('Retry-After'))||60))});}return response.json();}
