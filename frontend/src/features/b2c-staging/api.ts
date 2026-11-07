import { API_URL } from '@/config/api';
export type StagingModule = 'TIAL' | 'LOGIC_PSB' | 'LOGIC_MO';
export type StagingOrder = { reference_verified: boolean; reference_syntax_valid: boolean; reference_complete: boolean; id: string; module: StagingModule; date: string; status: string; sto: string | null; scIn: string | null; inet: string | null };
export type StagingResult = { source: 'MYSQL_STAGING'; readOnly: true; data: StagingOrder[]; page: number; hasMore: boolean; stoFilterAvailable?: boolean; identityScope?: string; dateBasis?: string };
export type StagingFilters = { module: StagingModule; date: string; status: string; sto: string; q: string; page: number };
// No PreviewProvider, reducer, localStorage persistence or operational mutations.
export async function fetchStagingOrders(token: string, filters: StagingFilters, signal?: AbortSignal): Promise<StagingResult> {
  const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
  const response = await fetch(`${API_URL}/b2c-staging/orders?${query}`, { signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || 'Tidak dapat membaca staging'), { status: response.status });
  if (result.source !== 'MYSQL_STAGING' || result.readOnly !== true || !Array.isArray(result.data)) throw new Error('Respons staging tidak sesuai kontrak');
  return result;
}
