import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Globe2,
  LayoutGrid,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { categories, statuses, jakartaDate } from "../operations/demo-data";
import { Empty, Metric, OrderTable, Section } from "../operations/components";
import PreviewAuth, { field } from "./PreviewAuth";
import { usePreview } from "./context";
import PreviewOrderDetail from "./PreviewOrderDetail";
import PreviewAdmin from "./PreviewAdmin";

export default function PreviewApp() {
  const { state, dispatch } = usePreview();
  const location = useLocation();
  const navigate = useNavigate();
  const user = state.users.find((u) => u.id === state.sessionId);
  if (["/preview/login", "/preview/register"].includes(location.pathname))
    return <PreviewAuth key={location.pathname} />;
  if (!user || !user.active || user.approval !== "APPROVED")
    return <Navigate to="/preview/login" replace />;
  const links = [
    { to: "/preview/jobs", label: "Pilih Pekerjaan", icon: LayoutGrid },
    { to: "/preview/transfers", label: "Transfer Order", icon: ArrowRightLeft },
    {
      to: "/preview/productivity",
      label: "Produktivitas HD",
      icon: ChartNoAxesCombined,
    },
    ...(user.role !== "HD"
      ? [{ to: "/preview/admin", label: "Dashboard Admin", icon: ShieldCheck }]
      : []),
  ];
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link to="/preview/jobs" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              HD
            </span>
            <span className="text-sm font-semibold">
              HD Work 2.0
              <span className="block text-xs font-normal text-muted-foreground">
                Interactive workspace · DEMO
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {user.name} · {user.role}
            </span>
            <ThemeToggle compact />
            <Button
              variant="outline"
              onClick={() => {
                dispatch({ type: "logout" });
                navigate("/preview/login");
              }}
            >
              <LogOut />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8">
        <nav
          aria-label="Navigasi preview"
          className="flex gap-2 overflow-x-auto border-b py-4"
        >
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium ${isActive ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
          <Link
            className="inline-flex shrink-0 items-center gap-2 px-4 text-xs text-primary"
            to="/monitoring"
          >
            <Globe2 className="size-4" />
            Monitoring Publik
          </Link>
        </nav>
        <div className="my-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          <span>
            DEMO INTERAKTIF · data di memori browser · reset saat reload · tanpa
            MySQL/Telegram
          </span>
          <Link className="underline" to="/workspace">
            Workspace sebelumnya
          </Link>
        </div>
        {state.notice && (
          <p
            role="status"
            className="mb-5 rounded-lg border bg-card p-4 text-sm"
          >
            {state.notice}
          </p>
        )}
        <main className="space-y-6 pb-10">
          <Routes>
            <Route path="jobs" element={<Jobs />} />
            <Route path="work/:category" element={<WorkDashboard />} />
            <Route path="work/:category/:module" element={<WorkDashboard />} />
            <Route
              path="orders/:monitoringId"
              element={<PreviewOrderDetail />}
            />
            <Route path="transfers" element={<Transfers />} />
            <Route path="productivity" element={<Productivity />} />
            <Route
              path="admin/*"
              element={
                user.role !== "HD" ? (
                  <PreviewAdmin />
                ) : (
                  <Navigate to="/preview/jobs" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/preview/jobs" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function Jobs() {
  return (
    <>
      <div className="py-5">
        <p className="text-xs font-semibold tracking-[.18em] text-primary">
          YOUR NEXT WORKSPACE
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Apa yang Anda kerjakan hari ini?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Seluruh petugas HD dapat mengakses empat kategori. Pilih ruang kerja
          untuk mulai.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {categories.map((category, index) => (
          <Link
            key={category}
            to={`/preview/work/${category}`}
            className="group rounded-2xl border bg-card p-7 shadow-sm transition hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex justify-between">
              <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <BriefcaseBusiness className="size-6" />
              </span>
              <span className="text-xs text-muted-foreground">
                0{index + 1} / WORKSPACE
              </span>
            </div>
            <h2 className="mt-7 text-2xl font-semibold">HD {category}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {category === "B2C"
                ? "Dua alur pengecekan: TIAL dan LOGIC."
                : "Dashboard, antrean, dan kolaborasi pengecekan."}
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Buka workspace
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
function WorkDashboard() {
  const { state } = usePreview();
  const { category, module } = useParams();
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(jakartaDate);
  const [sto, setSto] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  if (
    !categories.includes(category as (typeof categories)[number]) ||
    (module && !["TIAL", "LOGIC"].includes(module))
  )
    return <Empty text="Workspace tidak ditemukan." />;
  const scope = state.orders.filter(
    (o) => o.category === category && (!module || o.module === module),
  );
  const orders = scope
    .filter(
      (o) =>
        (!status || o.status === status) &&
        (!date || jakartaDate(new Date(o.receivedAt)) === date) &&
        (!sto || o.sto === sto) &&
        `${o.monitoringId} ${o.handlerAlias ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  const pages = Math.max(1, Math.ceil(orders.length / 8));
  const current = Math.min(page, pages);
  return (
    <>
      <Link
        className="inline-flex items-center gap-2 text-sm text-primary"
        to="/preview/jobs"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Pilih Pekerjaan
      </Link>
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary">
          HD WORKSPACE / {category}
          {module && ` / ${module}`}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Dashboard {module ?? category}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ambil manual, satu pemilik aktif, tanpa batas order. Seluruh data dan
          tindakan adalah simulasi.
        </p>
      </header>
      {category === "B2C" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {["TIAL", "LOGIC"].map((value) => (
            <Link
              key={value}
              className={`rounded-xl border p-5 ${module === value ? "border-primary bg-primary/5" : "bg-card"}`}
              to={`/preview/work/B2C/${value}`}
            >
              <h2 className="flex items-center justify-between font-semibold">
                {value}
                <ArrowRight className="size-4 text-primary" />
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Dashboard & daftar order {value} · alur pengecekan khusus belum
                ditentukan.
              </p>
            </Link>
          ))}
        </div>
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
        <label className="text-xs">
          Tanggal WIB
          <input
            aria-label="Tanggal order"
            className={field}
            type="date"
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
          Pencarian
          <input
            className={field}
            aria-label="Cari order"
            placeholder="Kode monitoring / HD"
            value={search}
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
            setPage(1);
          }}
        >
          Reset filter
        </Button>
      </section>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Total order"
          value={orders.length}
          detail="Seluruh kiriman sesuai filter"
        />
        {statuses.map((value) => (
          <Metric
            key={value}
            label={value}
            value={orders.filter((o) => o.status === value).length}
            detail="DEMO · status terakhir"
          />
        ))}
      </div>
      <Section
        title={`Daftar order ${module ?? category}`}
        description="Terbaru di atas · buka kode monitoring untuk pengerjaan."
      >
        <OrderTable
          orders={orders.slice((current - 1) * 8, current * 8)}
          basePath="/preview/orders"
        />
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
  );
}
function Transfers() {
  const { state, dispatch } = usePreview();
  const [ids, setIds] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const mine = state.orders.filter(
    (o) => o.handlerAlias === state.sessionId && o.status === "PROSES CEK",
  );
  return (
    <>
      <h1 className="text-3xl font-semibold">Transfer Order</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Bulk transfer ke satu penerima"
          description="Pemilik tidak berubah sebelum persetujuan. Tanpa kedaluwarsa."
        >
          {mine.length ? (
            mine.map((o) => (
              <label
                key={o.monitoringId}
                className="mb-2 flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={ids.includes(o.monitoringId)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, o.monitoringId]
                        : ids.filter((id) => id !== o.monitoringId),
                    )
                  }
                />
                {o.monitoringId}
                <Badge variant="outline">{o.category}</Badge>
              </label>
            ))
          ) : (
            <Empty text="Ambil order terlebih dahulu untuk mencoba transfer." />
          )}
          <label className="mt-4 block text-xs">
            Penerima
            <select
              aria-label="Penerima transfer"
              className={field}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">Pilih HD</option>
              {state.users
                .filter(
                  (u) =>
                    u.role === "HD" &&
                    u.active &&
                    u.approval === "APPROVED" &&
                    u.id !== state.sessionId,
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            className="mt-4"
            disabled={!ids.length || !to}
            onClick={() => {
              dispatch({ type: "transfer", ids, to });
              setIds([]);
            }}
          >
            Kirim {ids.length} order
          </Button>
        </Section>
        <Section
          title="Permintaan transfer"
          description="Penerima dapat Terima Semua / Tolak Semua. Ganti persona melalui logout untuk mencoba."
        >
          {state.transfers
            .filter(
              (t) => t.from === state.sessionId || t.to === state.sessionId,
            )
            .map((t) => (
              <article key={t.id} className="mb-3 rounded-lg border p-4">
                <p className="text-sm font-medium">
                  {t.from} → {t.to}
                </p>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {t.ids.join(", ")}
                </p>
                <Badge className="mt-3" variant="outline">
                  {t.status}
                </Badge>
                {t.status === "PENDING" && t.to === state.sessionId && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={() =>
                        dispatch({ type: "decide", id: t.id, accept: true })
                      }
                    >
                      Terima Semua
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        dispatch({ type: "decide", id: t.id, accept: false })
                      }
                    >
                      Tolak Semua
                    </Button>
                  </div>
                )}
              </article>
            ))}
          {!state.transfers.some(
            (t) => t.from === state.sessionId || t.to === state.sessionId,
          ) && <Empty text="Belum ada permintaan transfer." />}
        </Section>
      </div>
    </>
  );
}
function Productivity() {
  const { state } = usePreview();
  return (
    <>
      <h1 className="text-3xl font-semibold">Produktivitas HD</h1>
      <Section
        title="Kredit penyelesaian"
        description="Tidak ada poin atau formula skor. Kredit aktif mengikuti penetap DONE/GAGAL terakhir; kredit historis tetap tersimpan."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead>
              <tr>
                {[
                  "Petugas",
                  "DONE aktif",
                  "GAGAL aktif",
                  "Kredit historis",
                  "Kecepatan",
                ].map((label) => (
                  <th className="border-b p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.users
                .filter((u) => u.role === "HD")
                .map((u) => (
                  <tr className="border-b" key={u.id}>
                    <td className="p-3">{u.name}</td>
                    <td className="p-3">
                      {
                        state.orders.filter(
                          (o) =>
                            o.status === "DONE" &&
                            o.credits.at(-1)?.by === u.id,
                        ).length
                      }
                    </td>
                    <td className="p-3">
                      {
                        state.orders.filter(
                          (o) =>
                            o.status === "GAGAL" &&
                            o.credits.at(-1)?.by === u.id,
                        ).length
                      }
                    </td>
                    <td className="p-3">
                      {
                        state.orders
                          .flatMap((o) => o.credits)
                          .filter((c) => c.by === u.id).length
                      }
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      Formula belum ditetapkan
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Semua HD dapat melihat rekan. Tidak ada ranking pada preview.
        </p>
      </Section>
    </>
  );
}
