import type { OrderResult, OrderDetail, ReadMetadata, StatusHistory } from './model';
// Dependency injection keeps this transport testable without Vite or real services.
export function createOrderApi(base: string, request: typeof fetch = fetch) {
  async function get<T extends ReadMetadata>(path: string, token: string, signal?: AbortSignal): Promise<T> {
    const response = await request(`${base}/b2c/orders${path}`,{signal,headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if (!response.ok) throw Object.assign(new Error(({401:'Sesi tidak valid. Silakan masuk kembali.',403:'Akses order tidak diizinkan.',404:'Order tidak ditemukan.',429:'Terlalu banyak permintaan. Coba kembali nanti.'} as Record<number,string>)[response.status] || 'Layanan order hdwork2 belum tersedia.'),{status:response.status});
    const body = await response.json();
    const keys = ['PICK','CEK','RECEK','DONE','GAGAL'];
    if (body.success!==true || body.source!=='HDWORK2' || body.readOnly!==true || body.dateBasis!=='telegram_business_day_jakarta' || !body.actions || keys.some(key=>body.actions[key]!==false)) throw Error('Respons order hdwork2 tidak sesuai kontrak.');
    return body;
  }
  return {
    async list(token: string, filters: Record<string,string|number>, signal?: AbortSignal) {
      const result=await get<OrderResult>(`?${new URLSearchParams(Object.entries(filters).map(([k,v])=>[k,String(v)]))}`,token,signal);
      if (!Array.isArray(result.data) || !Number.isInteger(result.page) || !Number.isInteger(result.pageSize) || typeof result.hasMore!=='boolean') throw Error('Respons daftar order tidak valid.');
      return result;
    },
    async detail(token: string, id: string, signal?: AbortSignal) {
      const result=await get<OrderDetail>(`/${encodeURIComponent(id)}`,token,signal);
      if (!result.data || result.data.id!==id) throw Error('Respons detail order tidak valid.'); return result;
    },
    async history(token: string, id: string, page=1, signal?: AbortSignal) {
      const result=await get<StatusHistory>(`/${encodeURIComponent(id)}/history?page=${page}&limit=25`,token,signal);
      if (!Array.isArray(result.data) || typeof result.hasMore!=='boolean') throw Error('Respons riwayat order tidak valid.'); return result;
    }
  };
}
