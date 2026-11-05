import WorkDashboard from "./CategoryWorkspace";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useState,
  useEffect,
  useReducer,
  useRef,
  useLayoutEffect,
} from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Globe2,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { categories } from "../operations/demo-data";
import { Empty, Section } from "../operations/components";
import PreviewAuth, { field } from "./PreviewAuth";
import { usePreview } from "./context";
import PreviewOrderDetail from "./PreviewOrderDetail";
import PreviewAdmin from "./PreviewAdmin";
import MyWorkPage from "./MyWorkPage";
import CheckInPage from "./CheckInPage";
import { workStatus, newOrderCount, type WorkStatus } from "./work-status";
import { unreadCount } from "./chat-model";
import WorkspacePicker from "./WorkspacePicker";
import {
  categoryFromPath,
  isWorkspaceCategory,
  navigationKey,
  workspaceMenu,
  type WorkspaceCategory,
} from "./workspace-navigation";
import type { DemoUser } from "./model";

export default function PreviewApp() {
  const { state } = usePreview();
  const location = useLocation();
  const user = state.users.find((u) => u.id === state.sessionId);
  if (["/preview/login", "/preview/register"].includes(location.pathname))
    return <PreviewAuth key={location.pathname} />;
  if (!user || !user.active || user.approval !== "APPROVED")
    return <Navigate to="/preview/login" replace />;
  if (
    user.role === "HD" &&
    state.checkInRequired &&
    location.pathname !== "/preview/check-in"
  )
    return <Navigate to="/preview/check-in" replace />;
  return <PreviewWorkspaceLayout key={user.id} user={user} />;
}
function PreviewWorkspaceLayout({ user }: { user: DemoUser }) {
  const { state, dispatch, storageError } = usePreview();
  const location = useLocation();
  const navigate = useNavigate();
  const [remembered, remember] = useReducer(
    (_previous: WorkspaceCategory | null, next: WorkspaceCategory | null) =>
      next,
    user.id,
    (id) => {
      try {
        const value = localStorage.getItem(navigationKey(id));
        return isWorkspaceCategory(value) ? value : null;
      } catch {
        return null;
      }
    },
  );
  const routeCategory = categoryFromPath(location.pathname);
  useEffect(() => {
    if (routeCategory) {
      remember(routeCategory);
      try {
        localStorage.setItem(navigationKey(user.id), routeCategory);
      } catch {
        /* Navigation still works when storage is blocked. */
      }
    }
  }, [routeCategory, user.id]);
  const isJobs = location.pathname === "/preview/jobs";
  const isCheckIn = location.pathname === "/preview/check-in";
  const category = isJobs || isCheckIn ? null : (routeCategory ?? remembered);
  const showOperationalNav = !isJobs && !isCheckIn;
  const icons = {
    dashboard: LayoutDashboard,
    orders: ListTodo,
    chat: MessagesSquare,
    transfer: ArrowRightLeft,
    productivity: ChartNoAxesCombined,
    public: Globe2,
    admin: ShieldCheck,
  };
  const links = workspaceMenu(category, user.role);
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const previous = document.documentElement.style.getPropertyValue(
      "--hd-preview-header-height",
    );
    const update = () =>
      document.documentElement.style.setProperty(
        "--hd-preview-header-height",
        `${element.getBoundingClientRect().height}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty(
        "--hd-preview-header-height",
        previous,
      );
    };
  }, []);

  return (
    <div className="min-h-screen bg-muted/40">
      <header
        ref={header}
        data-preview-header
        className="sticky top-0 z-50 border-b bg-background"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
            <Link
              to="/preview/jobs"
              className="flex shrink-0 items-center gap-3"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                HD
              </span>
              <span className="text-sm font-semibold">
                HD Work 2.0
                <span className="hidden text-xs font-normal text-muted-foreground sm:block">
                  Interactive workspace · DEMO
                </span>
              </span>
            </Link>
            {!isCheckIn && (
              <WorkspacePicker
                category={category}
                onSelect={(value) => navigate(`/preview/work/${value}`)}
                onAll={() => navigate("/preview/jobs")}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {user.name} · {user.role}
            </span>
            {user.role === "HD" &&
              location.pathname !== "/preview/check-in" && (
                <label className="text-[11px] text-muted-foreground">
                  <span className="hidden sm:inline">Status kerja</span>
                  <select
                    aria-label="Status kerja"
                    className="rounded-lg border bg-card p-2 text-xs text-foreground sm:ml-2"
                    value={workStatus(state)}
                    onChange={(e) =>
                      dispatch({
                        type: "work-status",
                        status: e.target.value as WorkStatus,
                      })
                    }
                  >
                    {["ONLINE", "SIBUK", "OFFLINE"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
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
        {showOperationalNav && (
          <nav
            aria-label="Navigasi preview"
            className="flex gap-2 overflow-x-auto border-b py-4"
          >
            {links.map(({ to, label, icon }) => {
              const Icon = icons[icon];
              return (
                <NavLink
                  key={to}
                  aria-label={label}
                  to={to}
                  end={to.startsWith("/preview/work/")}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium ${isActive ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`
                  }
                >
                  <Icon className="size-4" />
                  {label}
                  {to === "/preview/my-work" && (
                    <>
                      <span
                        aria-label={`${newOrderCount(state)} order baru`}
                        className="rounded-full bg-background/20 px-1.5"
                      >
                        BARU {newOrderCount(state)}
                      </span>
                      <span
                        aria-label={`${state.orders.reduce((n, o) => n + unreadCount(o, user.id), 0)} pesan belum dibaca`}
                        className="rounded-full bg-background/20 px-1.5"
                      >
                        Pesan{" "}
                        {state.orders.reduce(
                          (n, o) => n + unreadCount(o, user.id),
                          0,
                        )}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        )}
        {!isJobs && (
          <div className="my-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            <span>
              DEMO LOKAL · status/notifikasi tersimpan per akun · lampiran
              sementara · tanpa MySQL/Telegram
            </span>
            <Link className="underline" to="/workspace">
              Workspace sebelumnya
            </Link>
          </div>
        )}
        {storageError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          >
            {storageError}
          </p>
        )}
        {!isJobs && state.notice && (
          <p
            role="status"
            className="mb-5 rounded-lg border bg-card p-4 text-sm"
          >
            {state.notice}
          </p>
        )}
        <main className="space-y-6 pb-10">
          <Routes>
            <Route path="check-in" element={<CheckInPage />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="my-work/:monitoringId" element={<MyWorkPage />} />
            <Route
              path="work/:category"
              element={<WorkDashboard key={location.pathname} />}
            />
            <Route
              path="work/:category/:module"
              element={<WorkDashboard key={location.pathname} />}
            />
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
