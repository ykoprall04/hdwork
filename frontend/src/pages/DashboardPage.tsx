import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CheckCheck, CircleAlert, Clock3, Inbox, Layers3, RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import OrderStatusBadge from "@/components/OrderStatusBadge"
import { useAuth } from "@/contexts/AuthContext"
import { useDashboard } from "@/lib/use-dashboard"
import { orderTrend, priorityOrders, segmentSummary } from "@/lib/dashboard-model"

const attendanceLabel = { ON_DESK: "On desk", BREAK: "Istirahat", CLOCKED_OUT: "Clock out", NOT_CLOCKED_IN: "Belum clock in" }
const number = new Intl.NumberFormat("id-ID")
const dateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
function formatTime(value: string | Date) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Waktu tidak tersedia" : `${dateTime.format(date)} WIB`
}

export default function DashboardPage() {
  const { user, token } = useAuth()
  const admin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
  const [cityId, setCityId] = useState("")
  const [segmentId, setSegmentId] = useState("")
  const data = useDashboard(token, cityId, user?.role)
  const orders = (data.orders ?? []).filter((order) => !segmentId || String(order.segment_id) === segmentId)
  const segments = Array.from(new Map((data.orders ?? []).map((order) => [String(order.segment_id), order.segment_code])).entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const summary = segmentId ? (data.orders ? segmentSummary(orders, admin ? undefined : user?.id) : null) : data.summary
  const queue = priorityOrders(orders)
  const trend = orderTrend(orders)
  const cityName = data.summary?.city_name || data.orders?.[0]?.city_name || "Kota sesuai akses"
  const capacity = data.summary
  const capacityValue = capacity ? (admin ? `${capacity.active_hds ?? "—"} / ${capacity.total_hds ?? "—"}` : `${capacity.active_orders ?? "—"} / ${capacity.active_order_limit ?? "—"}`) : "—"
  const metrics = [
    { label: "Waiting", value: summary?.waiting, detail: "Order menunggu penanganan", icon: Inbox, tone: "text-amber-700 bg-amber-500/10 [.dark_&]:text-amber-300" },
    { label: "In Progress", value: summary?.in_progress, detail: "Sedang ditangani petugas", icon: Layers3, tone: "text-primary bg-primary/10" },
    { label: "Escalated", value: summary?.escalated, detail: "Membutuhkan perhatian lanjutan", icon: CircleAlert, tone: "text-destructive bg-destructive/10" },
    { label: "Done Today", value: summary?.done_today, detail: admin ? "Selesai hari ini" : "Diselesaikan oleh Anda hari ini", icon: CheckCheck, tone: "text-emerald-700 bg-emerald-500/10 [.dark_&]:text-emerald-300" },
    { label: "Kapasitas HD", value: capacityValue, detail: admin ? "HD aktif / total HD · cakupan kota" : "Order aktif / batas Anda · semua segmen", icon: Users, tone: "text-primary bg-primary/10" },
  ]
  const activities = orders.flatMap((order) => [
    { order, kind: "created" as const, time: order.created_at },
    ...(order.status === "DONE" && order.completed_at ? [{ order, kind: "completed" as const, time: order.completed_at }] : []),
  ]).filter((event) => !Number.isNaN(new Date(event.time).getTime())).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  return <div className="min-h-screen bg-muted/50 p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-primary"><span className="size-1.5 rounded-full bg-primary" />HD WORK 2.0 / OPERATIONS</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard Operasional</h1>
          <p className="mt-2 text-sm text-muted-foreground">{admin ? "Pantau antrean, progres, dan kesiapan tim dalam satu workspace." : `Selamat datang, ${user?.name ?? "petugas"}. Atur prioritas dan pantau pekerjaan Anda.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{data.loading ? "Memuat data…" : data.updatedAt ? `Diperiksa ${formatTime(data.updatedAt)}` : "Belum diperbarui"}</span>
          <Button variant="outline" onClick={data.refresh} disabled={data.loading}><RefreshCw className={data.loading ? "motion-safe:animate-spin" : ""} />Perbarui</Button>
        </div>
      </header>

      <section aria-label="Filter dashboard" className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="mr-auto self-center"><p className="text-sm font-medium">Cakupan operasional</p><p className="mt-1 text-xs text-muted-foreground">Data mengikuti hak akses akun Anda</p></div>
        <label className="grid min-w-40 flex-1 gap-1.5 text-xs font-medium sm:flex-none">Kota
          <select aria-label="Kota" className="h-10 rounded-lg border bg-background px-3 text-sm disabled:opacity-70" value={user?.role === "SUPER_ADMIN" ? cityId : ""} disabled={user?.role !== "SUPER_ADMIN" || data.loading} onChange={(event) => { setCityId(event.target.value); setSegmentId("") }}>
            <option value="">{user?.role === "SUPER_ADMIN" ? "Semua kota" : cityName}</option>
            {data.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1.5 text-xs font-medium sm:flex-none">Segmen order
          <select aria-label="Segmen order" className="h-10 rounded-lg border bg-background px-3 text-sm disabled:opacity-70" value={segmentId} disabled={data.loading || !data.orders} onChange={(event) => setSegmentId(event.target.value)}>
            <option value="">Semua segmen tersedia</option>
            {segments.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
          </select>
        </label>
        {(cityId || segmentId) && <Button variant="ghost" onClick={() => { setCityId(""); setSegmentId("") }}>Reset filter</Button>}
      </section>

      {Object.keys(data.errors).length > 0 && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><div className="flex items-center gap-2 font-medium text-destructive"><CircleAlert className="size-4" />Sebagian data belum dapat dimuat</div><ul className="mt-2 space-y-1 text-muted-foreground">{Object.entries(data.errors).map(([key, message]) => <li key={key}>{({ summary: "KPI", orders: "Order", members: "Tim", cities: "Daftar kota" } as Record<string, string>)[key]}: {message}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Bagian yang gagal tidak diganti dengan angka nol atau data demo. Gunakan Perbarui untuk mencoba lagi.</p></div>}

      <section aria-label="Indikator operasional" aria-busy={data.loading} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => <Card key={label} className="shadow-sm"><CardContent className="space-y-4 pt-1"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted-foreground">{label}</span><span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon className="size-[18px]" /></span></div>{data.loading ? <div className="h-9 w-24 rounded bg-muted motion-safe:animate-pulse" aria-label="Memuat indikator" /> : <p className="text-3xl font-semibold tracking-tight tabular-nums">{typeof value === "number" ? number.format(value) : value ?? "—"}</p>}<p className="text-xs leading-5 text-muted-foreground">{detail}</p></CardContent></Card>)}
      </section>
      <p className="-mt-2 text-xs leading-5 text-muted-foreground">{segmentId ? "Empat KPI order dihitung dari segmen terpilih. " : "KPI mengikuti ringkasan API. "}Kapasitas dan ringkasan tim mengikuti cakupan kota; filter segmen hanya memengaruhi data order. Pilihan segmen berasal dari order yang dapat Anda akses.</p>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Panel title="Tren order" description="7 hari terakhir · tanggal WIB" icon={<BarChart3 className="size-4 text-primary" />}>
          <DataState loading={data.loading} unavailable={!data.orders} empty={!trend.some((day) => day.incoming || day.completed)} emptyText="Belum ada order masuk atau selesai dalam 7 hari terakhir.">
            <div className="mb-6 flex flex-wrap gap-5 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Order masuk</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-600 [.dark_&]:bg-emerald-400" />Order selesai</span></div>
            <div className="grid grid-cols-7 gap-2 sm:gap-4" role="img" aria-label={trend.map((day) => `${day.label}: ${day.incoming} masuk, ${day.completed} selesai`).join("; ")}>
              {trend.map((day) => {
                const max = Math.max(1, ...trend.flatMap((item) => [item.incoming, item.completed]))
                return <div key={day.key} className="min-w-0"><div className="flex h-40 items-end justify-center gap-1 border-b bg-[linear-gradient(to_top,var(--border)_1px,transparent_1px)] bg-[size:100%_25%] sm:h-48"><div title={`${day.incoming} masuk`} className="w-3 rounded-t bg-primary sm:w-5" style={{ height: `${day.incoming / max * 90}%` }} /><div title={`${day.completed} selesai`} className="w-3 rounded-t bg-emerald-600 [.dark_&]:bg-emerald-400 sm:w-5" style={{ height: `${day.completed / max * 90}%` }} /></div><p className="mt-3 text-center text-[10px] text-muted-foreground sm:text-xs">{day.label}</p><p className="mt-1 text-center text-[10px] tabular-nums sm:text-xs">{day.incoming} / {day.completed}</p></div>
              })}
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Masuk berdasarkan waktu dibuat; selesai berdasarkan waktu penyelesaian. Angka di bawah grafik: masuk / selesai. Sumber: order yang dapat diakses.</p>
          </DataState>
        </Panel>

        <Panel title={admin ? "Kesiapan & beban tim" : "Beban kerja Anda"} description="Cakupan kota · semua segmen" icon={<Users className="size-4 text-primary" />}>
          {admin ? <DataState loading={data.loading} unavailable={!data.members} empty={data.members?.length === 0} emptyText="Belum ada petugas dalam cakupan kota ini.">
            <div className="mb-4 grid grid-cols-2 gap-3"><MiniStat label="On desk" value={data.members?.filter((member) => member.attendance_status === "ON_DESK").length ?? 0} /><MiniStat label="Order aktif tim" value={data.members?.reduce((total, member) => total + member.active_orders, 0) ?? 0} /></div>
            <div className="max-h-64 space-y-4 overflow-y-auto pr-1">{[...(data.members ?? [])].sort((a, b) => b.active_orders - a.active_orders).map((member) => <div key={member.id}><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{member.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-sm"><p className="truncate font-medium">{member.name}</p><span className="shrink-0 tabular-nums">{member.active_orders} order</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{attendanceLabel[member.attendance_status]} · {member.city_name}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${member.active_orders / Math.max(1, ...(data.members ?? []).map((item) => item.active_orders)) * 100}%` }} /></div></div></div></div>)}</div>
            <p className="mt-4 text-xs text-muted-foreground">Panjang bar relatif terhadap beban tertinggi tim, bukan batas kapasitas.</p>
            <Link className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" to="/team">Lihat seluruh tim <ArrowRight className="size-4" /></Link>
          </DataState> : <DataState loading={data.loading} unavailable={!capacity} empty={false} emptyText=""><div className="rounded-xl border bg-muted/40 p-5"><p className="text-sm text-muted-foreground">Order aktif / batas order</p><p className="mt-2 text-3xl font-semibold tabular-nums">{capacityValue}</p><p className="mt-3 text-sm">Point Today: <strong>{capacity?.point_today ?? "—"}</strong></p></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Ringkasan pribadi dari API. Detail petugas lain hanya tersedia untuk admin.</p></DataState>}
          {admin && !data.loading && capacity && <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Belum clock in: <strong className="text-foreground">{capacity.not_clocked_in ?? "—"}</strong> petugas</p>}
        </Panel>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Panel title="Antrean prioritas" description="Eskalasi terlebih dahulu, lalu menunggu dan diproses; terlama di setiap status." icon={<Layers3 className="size-4 text-primary" />} action={<Link to="/orders" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">Semua order <ArrowUpRight className="size-3.5" /></Link>}>
          <DataState loading={data.loading} unavailable={!data.orders} empty={queue.length === 0} emptyText="Tidak ada order aktif pada filter ini. Antrean sudah bersih.">
            <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><caption className="sr-only">Delapan order prioritas sesuai filter dan hak akses</caption><thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground"><th scope="col" className="pb-3 pr-4 font-medium">Order / pelanggan</th><th scope="col" className="pb-3 pr-4 font-medium">Status</th><th scope="col" className="pb-3 pr-4 font-medium">Petugas</th><th scope="col" className="pb-3 font-medium">Dibuat</th></tr></thead><tbody>{queue.slice(0, 8).map((order) => <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40"><td className="max-w-60 py-4 pr-4"><Link to={`/orders/${order.id}`} className="font-semibold text-primary hover:underline">{order.ticket_number || `#${order.id}`}</Link><p className="mt-1 truncate text-xs text-muted-foreground">{order.service_number || "Tanpa nomor layanan"} · {order.segment_code}</p><p className="mt-1 truncate text-xs text-muted-foreground">{order.city_name}</p></td><td className="py-4 pr-4"><OrderStatusBadge status={order.status} /></td><td className="max-w-40 truncate py-4 pr-4 text-xs">{order.performance_owner_name || "Belum ditugaskan"}</td><td className="py-4 text-xs text-muted-foreground">{formatTime(order.created_at)}</td></tr>)}</tbody></table></div>
            <p className="mt-3 text-xs text-muted-foreground">Menampilkan {Math.min(8, queue.length)} dari {number.format(queue.length)} order aktif. Prioritas berdasarkan status dan usia order, bukan SLA.</p>
          </DataState>
        </Panel>

        <Panel title="Aktivitas order" description="Pembuatan dan penyelesaian terbaru sesuai filter" icon={<Activity className="size-4 text-primary" />}>
          <DataState loading={data.loading} unavailable={!data.orders} empty={activities.length === 0} emptyText="Belum ada aktivitas order pada filter ini.">
            <ol className="space-y-5">{activities.map(({ order, kind, time }) => <li key={`${order.id}-${kind}`} className="flex gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${kind === "completed" ? "bg-emerald-500/10 text-emerald-700 [.dark_&]:text-emerald-300" : "bg-primary/10 text-primary"}`}>{kind === "completed" ? <CheckCheck className="size-4" /> : <ArrowDownLeft className="size-4" />}</span><div className="min-w-0"><p className="text-sm"><Link to={`/orders/${order.id}`} className="font-medium hover:text-primary hover:underline">{order.ticket_number || `Order #${order.id}`}</Link> {kind === "completed" ? "selesai" : "masuk antrean"}</p><p className="mt-1 text-xs text-muted-foreground">{kind === "completed" ? order.performance_owner_name || "Petugas tidak tersedia" : order.city_name} · {order.segment_code}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatTime(time)}</p></div></li>)}</ol>
            <p className="mt-5 border-t pt-3 text-xs leading-5 text-muted-foreground">Dirangkum dari waktu order dibuat dan selesai. Bukan riwayat audit atau seluruh aktivitas petugas.</p>
          </DataState>
        </Panel>
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 text-[11px] text-muted-foreground"><span>HD Work · Enterprise Operations Dashboard</span><span>Data API sesuai akses · waktu WIB · pembaruan manual</span></footer>
    </div>
  </div>
}

function Panel({ title, description, icon, action, children }: { title: string; description: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <Card className="min-w-0 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 pb-4 sm:px-5"><div><h2 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p></div>{action}</div><CardContent className="sm:px-5">{children}</CardContent></Card>
}

function DataState({ loading, unavailable, empty, emptyText, children }: { loading: boolean; unavailable: boolean; empty: boolean; emptyText: string; children: ReactNode }) {
  if (loading) return <div role="status" aria-label="Memuat data" className="space-y-3 py-5"><div className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" /><div className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" /><p className="text-xs text-muted-foreground">Memuat data operasional…</p></div>
  if (unavailable || empty) return <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-8 text-center"><span className="grid size-11 place-items-center rounded-full bg-muted">{unavailable ? <CircleAlert className="size-5 text-destructive" /> : <Clock3 className="size-5 text-muted-foreground" />}</span><p className="text-sm font-medium">{unavailable ? "Data belum tersedia" : "Belum ada data"}</p><p className="max-w-sm text-xs leading-5 text-muted-foreground">{unavailable ? "Permintaan gagal. Periksa pesan di atas dan coba Perbarui." : emptyText}</p></div>
  return <>{children}</>
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{number.format(value)}</p></div>
}
