// Synthetic fixtures only. Never populated from internal Order DTOs or API responses.
export const categories = ['B2C', 'ASSUREN', 'B2B', 'REPLACEMENT'] as const
export const statuses = ['MENUNGGU', 'PROSES CEK', 'DONE', 'GAGAL', 'DUPLICATE'] as const
export type MonitoringStatus = typeof statuses[number]
export type DemoOrder = {
  module?: 'TIAL'|'LOGIC'|null
  sto?: string
  monitoringId: string
  category: typeof categories[number]
  status: MonitoringStatus
  receivedAt: string
  waitingStartedAt?: string
  startedAt: string | null
  finishedAt: string | null
  handlerAlias: string | null
  duplicateOf: string | null
  history: { status: MonitoringStatus; at: string }[]
  publicMessages: { text: string; handlerAlias: string; at: string; publicApproved: true }[]
}
export function jakartaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).format(date)
}
export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value)) + ' WIB'
}
export function duration(from: string, to: string | null, now = Date.now()) {
  const minutes = Math.max(0, Math.floor(((to ? Date.parse(to) : now) - Date.parse(from)) / 60000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}j ${minutes % 60}m` : `${minutes}m`
}
export function createDemoOrders(now = new Date()): DemoOrder[] {
  const day = jakartaDate(now)
  const midnight = Date.parse(`${day}T00:00:00+07:00`)
  const elapsed = Math.max(0, now.getTime() - midnight)
  return Array.from({length: 24}, (_, index) => {
    const received = midnight + elapsed * (index + 1) / 28
    const status = statuses[index % statuses.length]
    const started = status !== 'MENUNGGU' && status !== 'DUPLICATE' ? received + (now.getTime() - received) * .2 : null
    const finished = status === 'DONE' || status === 'GAGAL' ? received + (now.getTime() - received) * .6 : null
    const receivedAt = new Date(received).toISOString()
    const startedAt = started === null ? null : new Date(started).toISOString()
    const finishedAt = finished === null ? null : new Date(finished).toISOString()
    const handlerAlias = startedAt ? `hd_demo_${index % 3 + 1}` : null
    return {
      monitoringId: `DEMO-MON-${String(index + 1).padStart(4,'0')}`,
      category: categories[index % categories.length], status, receivedAt, startedAt, finishedAt, handlerAlias,
      duplicateOf: status === 'DUPLICATE' ? `DEMO-MON-${String(index - 3).padStart(4,'0')}` : null,
      history: [
        {status:'MENUNGGU' as const, at:receivedAt},
        ...(startedAt ? [{status:'PROSES CEK' as const, at:startedAt}] : []),
        ...(finishedAt ? [{status, at:finishedAt}] : []),
        ...(status === 'DUPLICATE' ? [{status, at:receivedAt}] : []),
      ],
      publicMessages: handlerAlias && startedAt ? [{text:'DEMO: Pengecekan sedang dilakukan. Pembaruan berikutnya akan disampaikan setelah verifikasi.',handlerAlias,at:startedAt,publicApproved:true as const}] : [],
    }
  })
}
