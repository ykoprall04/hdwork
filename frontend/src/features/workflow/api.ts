import {API_URL} from '@/config/api';
import {cookieMode,cookieFetch} from '../operational/cookie-http';
export const operationsEnabled=cookieMode&&import.meta.env.VITE_HDWORK2_OPERATIONS==='true';
export const operationsBase=`${API_URL}/operations`;
function retryAfter(value: string | null): number {
  const header = value?.trim();
  if (!header) return 60;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    return Number.isFinite(seconds) ? Math.max(1, seconds) : 60;
  }
  const time = /^[A-Za-z]{3}/.test(header) ? Date.parse(header) : NaN;
  return Number.isFinite(time) ? Math.max(1, (time - Date.now()) / 1000) : 60;
}
export async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{const response=await cookieFetch(operationsBase+path,{signal,method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(Error(error.message||'Layanan pekerjaan belum tersedia'),{status:response.status,retryAfter:retryAfter(response.headers.get('Retry-After'))});}return response.json();}
