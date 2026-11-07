export const tialTabs = ['MENUNGGU', 'PROSES CEK', 'SELESAI', 'DUPLICATE'] as const;
export type TialFilters = { date: string; status: string; sto: string; q: string };
export function jakartaToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
export function tialQuery(filters: TialFilters, page: number, stoAvailable: boolean) {
  return { module: 'TIAL' as const, date: filters.date, status: filters.status.trim(), sto: stoAvailable ? filters.sto.trim() : '', q: filters.q.trim(), page };
}
