import { API_URL } from '@/config/api';
import { cookieFetch } from '../operational/cookie-http';

export async function tanyaRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await cookieFetch(API_URL + '/operations/assistant' + path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Error(data?.message || 'Tanya Yanto belum dapat dihubungi.');
  return data;
}
