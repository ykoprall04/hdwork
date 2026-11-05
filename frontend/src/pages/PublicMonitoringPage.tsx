import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  categories,
  statuses,
  jakartaDate,
  formatTimestamp,
  duration,
} from "@/features/operations/demo-data";
import {
  Empty,
  Metric,
  Section,
  StatusBadge,
} from "@/features/operations/components";
import { usePreview } from "@/features/preview/context";
import { publicProjection } from "@/features/preview/model";

export default function PublicMonitoringPage() {
  const { state } = usePreview();
  const orders = publicProjection(state.orders);
  const [date, setDate] = useState(jakartaDate);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { monitoringId } = useParams();
  const selected = orders.find((o) => o.monitoringId === monitoringId);
  const filtered = orders
    .filter(
      (o) =>
        (!date || jakartaDate(new Date(o.receivedAt)) === date) &&
        (!category ||
          (category.includes("/")
            ? `${o.category}/${o.module}` === category
            : o.category === category)) &&
        (!status || o.status === status) &&
        `${o.monitoringId} ${o.status} ${o.handlerAlias ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase().trim()),
    )
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  const unique = filtered.filter((o) => o.status !== "DUPLICATE");
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages);
  const reset = () => {
    setDate(jakartaDate());
    setCategory("");
    setStatus("");
    setSearch("");
    setPage(1);
  };
  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link to="/monitoring" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              HD
            </span>
            <span className="text-sm font-semibold">
              HD Work 2.0
              <span className="block text-xs font-normal text-muted-foreground">
                Public Order Monitoring
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle compact />
            <Link
              className="inline-flex items-center gap-2 text-sm text-primary"
              to="/preview/login"
            >
              <LockKeyhole className="size-4" />
              Login HD · Preview
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-7 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[.18em] text-primary">
              PUBLIC VISIBILITY / READ ONLY
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Pantau progres pekerjaan.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Semua kategori dalam satu tampilan. Informasi terbatas, tanpa
              identitas pelanggan.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Tanpa login
          </span>
        </header>
        <div
          role="note"
          className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs leading-6 text-primary"
        >
          <strong>DEMO · PREVIEW FRONTEND</strong>
          <p>
            Data fiktif dan pembaruan simulasi di browser yang sama. Tidak
            terhubung MySQL/Telegram atau real-time server. Lampiran, NIK, INET
            lengkap, dan kredensial tidak ditampilkan. Data reset saat reload.
          </p>
        </div>
        <section
          aria-label="Filter monitoring"
          className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-xs font-medium">
            Kategori
            <select
              aria-label="Kategori"
              className="mt-2 block h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua kategori</option>
              {["B2C/TIAL", "B2C/LOGIC", ...categories].map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Tanggal (WIB)
            <input
              aria-label="Tanggal (WIB)"
              className="mt-2 block h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="text-xs font-medium">
            Status
            <select
              aria-label="Status"
              className="mt-2 block h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua status</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Pencarian
            <input
              aria-label="Cari monitoring"
              placeholder="Kode monitoring / status / HD"
              className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-4">
            <p className="text-xs text-muted-foreground">
              {date || "Semua tanggal"} · Asia/Jakarta · statistik mengikuti
              filter
            </p>
            <Button variant="ghost" onClick={reset}>
              Reset filter
            </Button>
          </div>
        </section>
        <section
          aria-label="Statistik DEMO"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Seluruh kiriman"
            value={filtered.length}
            detail="Termasuk duplikat"
          />
          <Metric
            label="Order unik"
            value={unique.length}
            detail="DUPLICATE tidak dihitung"
          />
          <Metric
            label="Dalam penanganan"
            value={
              unique.filter((o) =>
                ["MENUNGGU", "PROSES CEK"].includes(o.status),
              ).length
            }
            detail="Menunggu + proses cek"
          />
          <Metric
            label="DONE / GAGAL"
            value={`${unique.filter((o) => o.status === "DONE").length} / ${unique.filter((o) => o.status === "GAGAL").length}`}
            detail="Status terakhir order unik"
          />
          <Metric
            label="Duplikat"
            value={filtered.length - unique.length}
            detail="Tetap tampil di daftar"
          />
        </section>
        <div
          className={`grid items-start gap-5 ${monitoringId ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
        >
          <Section
            title="Daftar order"
            description="Terbaru di atas · klik kode untuk panel detail. Durasi mengikuti sesi pengecekan saat ini."
          >
            {filtered.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {[
                        "Waktu / Monitoring",
                        "Kategori",
                        "Status",
                        "HD",
                        "Menunggu",
                        "Pengerjaan",
                        "Pesan terakhir publik",
                      ].map((label) => (
                        <th key={label} className="p-3 font-medium" scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((current - 1) * 8, current * 8).map((o) => (
                      <tr
                        key={o.monitoringId}
                        className={`border-b last:border-0 ${selected?.monitoringId === o.monitoringId ? "bg-primary/5" : "hover:bg-muted/40"}`}
                      >
                        <td className="p-3">
                          <Link
                            className="font-medium text-primary hover:underline"
                            to={`/monitoring/${o.monitoringId}`}
                          >
                            {o.monitoringId}
                          </Link>
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {formatTimestamp(o.receivedAt)}
                          </p>
                        </td>
                        <td className="p-3">
                          {o.category}
                          {o.module && (
                            <p className="mt-1 text-muted-foreground">
                              {o.module}
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="p-3">{o.handlerAlias ?? "—"}</td>
                        <td className="p-3 tabular-nums">
                          {o.status === "DUPLICATE"
                            ? "—"
                            : duration(o.waitingStartedAt ?? o.receivedAt, o.startedAt)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {o.startedAt
                            ? duration(o.startedAt, o.finishedAt)
                            : "—"}
                        </td>
                        <td className="max-w-52 p-3">
                          <p className="line-clamp-2 break-words text-muted-foreground">
                            {o.publicMessages.at(-1)?.text ??
                              "Belum ada pesan aman publik"}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
            <nav
              aria-label="Pagination monitoring"
              className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
            >
              <p className="text-xs text-muted-foreground">
                {filtered.length
                  ? `${(current - 1) * 8 + 1}–${Math.min(current * 8, filtered.length)}`
                  : "0"}{" "}
                dari {filtered.length} · halaman {current}/{pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  <ArrowLeft />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                >
                  Berikutnya
                  <ArrowRight />
                </Button>
              </div>
            </nav>
          </Section>
          {monitoringId && (
            <aside
              aria-label="Panel detail monitoring"
              className="min-w-0 xl:sticky xl:top-5"
            >
              <Section
                title="Detail order terbatas"
                description="Hanya field yang diizinkan pada proyeksi demo."
              >
                <Link
                  to="/monitoring"
                  className="mb-4 inline-flex items-center gap-2 text-xs text-primary"
                >
                  <X className="size-4" />
                  Tutup detail
                </Link>
                {selected ? (
                  <div className="space-y-5">
                    <div>
                      <p className="break-all text-sm font-semibold">
                        {selected.monitoringId}
                      </p>
                      <p className="my-2 text-xs text-muted-foreground">
                        {selected.category} {selected.module} ·{" "}
                        {selected.handlerAlias ?? "Belum ditugaskan"}
                      </p>
                      <StatusBadge status={selected.status} />
                    </div>
                    {selected.duplicateOf && (
                      <p className="rounded-lg bg-muted p-3 text-xs">
                        Duplikat dari {selected.duplicateOf}; tidak dihitung
                        sebagai order unik.
                      </p>
                    )}
                    <div>
                      <h2 className="mb-3 text-sm font-semibold">
                        Riwayat status
                      </h2>
                      <ol className="space-y-3">
                        {selected.history.map((event, i) => (
                          <li
                            className="border-l-2 border-primary/25 pl-3"
                            key={i}
                          >
                            <StatusBadge status={event.status} />
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatTimestamp(event.at)}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <h2 className="mb-3 text-sm font-semibold">
                        Pesan aman publik
                      </h2>
                      {selected.publicMessages.map((m, i) => (
                        <article key={i} className="mb-3 rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground">
                            {m.handlerAlias} · {formatTimestamp(m.at)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6">
                            {m.text}
                          </p>
                        </article>
                      ))}
                      {!selected.publicMessages.length && (
                        <p className="text-xs text-muted-foreground">
                          Belum ada pesan yang dinyatakan aman publik.
                        </p>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Lampiran dan revisi pesan internal tidak ditampilkan.
                    </p>
                  </div>
                ) : (
                  <Empty text="Identifier demo tidak ditemukan." />
                )}
              </Section>
            </aside>
          )}
        </div>
        <footer className="flex flex-wrap justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Globe2 className="size-4" />
            HD Work · Public Monitoring · DEMO
          </span>
          <Link className="text-primary" to="/preview/login">
            Buka workspace preview →
          </Link>
        </footer>
      </main>
    </div>
  );
}
