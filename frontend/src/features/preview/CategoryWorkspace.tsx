import B2cSummary from "../workspace-ui/B2cSummary";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { categories, statuses, jakartaDate } from "../operations/demo-data";
import { Empty, Metric, OrderTable, Section } from "../operations/components";
import { usePreview } from "./context";
import { field } from "./PreviewAuth";
import OrderPickButton from "./OrderPickButton";
import OrderEscalationBadge from "./OrderEscalationBadge";
import { workStatus } from "./work-status";
export default function CategoryWorkspace() {
  const { state } = usePreview();
  const { category, module } = useParams();
  const [tab, setTab] = useState("MENUNGGU");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(jakartaDate);
  const [sto, setSto] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  if (
    !categories.includes(category as (typeof categories)[number]) ||
    (module && (category !== "B2C" || !["TIAL", "LOGIC"].includes(module)))
  )
    return <Empty text="Workspace tidak ditemukan." />;
  const scope = state.orders.filter(
    (o) => o.category === category && (!module || o.module === module),
  );
  const dashboard = category === "B2C" && !module;
  const quick = category === "B2C" && !!module;
  const filtered = scope.filter(
    (o) =>
      (!date || jakartaDate(new Date(o.receivedAt)) === date) &&
      (!sto || o.sto === sto) &&
      `${o.monitoringId} ${o.handlerAlias ?? ""} ${o.sto} ${Object.values(o.searchReferences ?? {}).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const orders = filtered
    .filter((o) =>
      quick
        ? tab === "SELESAI"
          ? ["DONE", "GAGAL"].includes(o.status) &&
            (!status || o.status === status)
          : o.status === tab
        : !status || o.status === status,
    )
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  const pages = Math.max(1, Math.ceil(orders.length / 8));
  const current = Math.min(page, pages);
  return (
    <>
      <header>
        <p className="text-xs font-semibold tracking-[.18em] text-primary">
          WORKSPACE / {category}
          {module && ` / ${module}`}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {dashboard
            ? "Dashboard B2C"
            : quick
              ? `Daftar order ${module}`
              : `Dashboard ${category}`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {dashboard
            ? "Monitoring dan ringkasan B2C. Pilih TIAL atau LOGIC untuk Quick PICK."
            : "Satu pemilik aktif per order. Data demo dan workflow khusus tetap terpisah."}
        </p>
      </header>
      {dashboard ? (
        <B2cSummary metrics={[{ label: "Total order", value: scope.length, detail: "B2C gabungan" }, ...statuses.map(label => ({ label, value: scope.filter(order => order.status === label).length, detail: "Status terakhir" }))]} summaries={["TIAL", "LOGIC"].map(value => {
          const orders = scope.filter(order => order.module === value);
          return { title: `Ringkasan ${value}`, cells: [{ label: "Total", value: orders.length }, { label: "Menunggu", value: orders.filter(order => order.status === "MENUNGGU").length }, { label: "Proses", value: orders.filter(order => order.status === "PROSES CEK").length }] };
        })} />
      ) : (
        <>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            Status Anda: <strong>{workStatus(state)}</strong>.{" "}
            {workStatus(state) === "ONLINE"
              ? "Siap PICK order baru."
              : "PICK/Ambil Alih nonaktif. Pekerjaan yang sudah dimiliki tetap dapat ditangani."}
          </div>
          {quick && (
            <nav
              aria-label="Filter cepat order"
              className="flex gap-2 overflow-x-auto"
            >
              {["MENUNGGU", "PROSES CEK", "SELESAI", "DUPLICATE"].map(
                (value) => (
                  <button
                    key={value}
                    aria-pressed={tab === value}
                    className={`shrink-0 rounded-lg border px-4 py-2.5 text-xs font-medium ${tab === value ? "bg-primary text-primary-foreground" : "bg-card"}`}
                    onClick={() => {
                      setTab(value);
                      setStatus("");
                      setPage(1);
                    }}
                  >
                    {value}{" "}
                    <span className="ml-2 opacity-70">
                      {
                        scope.filter((o) =>
                          value === "SELESAI"
                            ? ["DONE", "GAGAL"].includes(o.status)
                            : o.status === value,
                        ).length
                      }
                    </span>
                  </button>
                ),
              )}
            </nav>
          )}
          <section
            aria-label="Filter order"
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <label className="text-xs">
              Status
              <select
                aria-label="Status order"
                className={field}
                value={status}
                onChange={(e) => {
                  const value = e.target.value;
                  setStatus(value);
                  if (quick && value)
                    setTab(
                      ["DONE", "GAGAL"].includes(value) ? "SELESAI" : value,
                    );
                  setPage(1);
                }}
              >
                <option value="">
                  {quick ? "Semua dalam tab" : "Semua status"}
                </option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Tanggal WIB
              <input
                aria-label="Tanggal order"
                type="date"
                className={field}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="text-xs">
              STO
              <select
                aria-label="STO"
                className={field}
                value={sto}
                onChange={(e) => {
                  setSto(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua STO</option>
                {Array.from(new Set(scope.map((o) => o.sto))).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Cari SC/IN, INET/TELP, kode atau HD
              <input
                aria-label="Cari order"
                className={field}
                value={search}
                placeholder="Referensi DEMO / kode / STO"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                setStatus("");
                setDate(jakartaDate());
                setSto("");
                setSearch("");
                setTab("MENUNGGU");
                setPage(1);
              }}
            >
              Reset filter
            </Button>
          </section>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Total order"
              value={filtered.length}
              detail="Sesuai pencarian/tanggal/STO"
            />
            {statuses.map((s) => (
              <Metric
                key={s}
                label={s}
                value={filtered.filter((o) => o.status === s).length}
                detail="Data workspace ini"
              />
            ))}
          </div>
          <Section
            title={`Daftar order ${module ?? category}`}
            description={
              quick
                ? "Quick PICK tanpa pindah halaman · workflow teknis khusus belum ditentukan."
                : "Terbaru di atas · PICK atau buka order sesuai hak akses."
            }
          >
            <OrderTable
              orders={orders.slice((current - 1) * 8, current * 8)}
              basePath="/preview/orders"
              identifierDetail={(o) => {
                const record = scope.find(
                  (item) => item.monitoringId === o.monitoringId,
                );
                return record ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {record.searchReferences?.sc} ·{" "}
                    {record.searchReferences?.inet} · {record.sto}
                  </p>
                ) : null;
              }}
              identifierAction={(o) => (
                <OrderPickButton orderId={o.monitoringId} quick={quick} />
              )}
              statusDetail={(o) => (
                <div className="mt-1">
                  <OrderEscalationBadge orderId={o.monitoringId} />
                </div>
              )}
            />
            <p className="mt-3 text-[11px] text-muted-foreground">
              Referensi SC/INET/TELP adalah identifier sintetis DEMO, bukan
              nomor pelanggan nyata. DUPLICATE tidak dapat di-PICK.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-xs text-muted-foreground">
                Halaman {current}/{pages} · {orders.length} order
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
