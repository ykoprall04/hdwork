export type OperationalUser = { id: number; name: string; username: string; role: string; city_id: number | null };
export const AUTH_KEY = 'hdwork:operational:auth:v1';
export async function validateSession(token: string, base: string, request: typeof fetch, signal?: AbortSignal): Promise<OperationalUser> {
  const response = await request(`${base}/auth/me`, { signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 || response.status === 403 ? 'Sesi tidak valid atau akun tidak aktif' : 'Sesi belum dapat diverifikasi. Coba kembali.'), { status: response.status });
  const result = await response.json();
  const user = result.data;
  if (!result.success || !user || typeof user.id !== 'number' || typeof user.name !== 'string' || typeof user.username !== 'string' || !['HD', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) throw new Error('Respons sesi tidak valid');
  return { id: user.id, name: user.name, username: user.username, role: user.role, city_id: user.city_id ?? null };
}
