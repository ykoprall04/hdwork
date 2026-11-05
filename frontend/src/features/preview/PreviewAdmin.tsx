import { useState } from "react";
import { NavLink, Route, Routes, Link } from "react-router-dom";
import { Bell, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, Metric, Section } from "../operations/components";
import { formatTimestamp } from "../operations/demo-data";
import { usePreview } from "./context";
import { field } from "./PreviewAuth";
export default function PreviewAdmin() {
  const { state, dispatch } = usePreview();
  const [template, setTemplate] = useState("");
  const [target, setTarget] = useState("");
  const [order, setOrder] = useState("");
  const tabs = [
    ["", "Ringkasan"],
    ["users", "Manajemen Pengguna"],
    ["approvals", "Persetujuan HD"],
    ["templates", "Template Pesan"],
    ["integrations", "Integrasi & Antrean"],
    ["audit", "Audit Log"],
  ];
  const pending = state.users.filter((u) =>
    ["PENDING APPROVAL", "RESUBMITTED"].includes(u.approval),
  );

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-primary">
            CONTROL CENTER / DEMO
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Dashboard Admin</h1>
        </div>
        <Button variant="outline" onClick={() => dispatch({ type: "notify" })}>
          <Bell />
          Simulasikan notifikasi
        </Button>
      </header>
      <nav className="flex gap-2 overflow-x-auto" aria-label="Navigasi admin">
        {tabs.map(([path, label]) => (
          <NavLink
            key={path}
            end
            to={`/preview/admin${path ? `/${path}` : ""}`}
            className={({ isActive }) =>
              `shrink-0 rounded-lg border px-3 py-2 text-xs ${isActive ? "bg-primary text-primary-foreground" : "bg-card"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route
          index
          element={
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric
                  label="Petugas HD"
                  value={state.users.filter((u) => u.role === "HD").length}
                  detail="Termasuk pendaftar DEMO"
                />
                <Metric
                  label="Menunggu persetujuan"
                  value={pending.length}
                  detail="PENDING APPROVAL + RESUBMITTED"
                />
                <Metric
                  label="Notifikasi simulasi"
                  value={state.audit.length}
                  detail="Pembaruan lokal, bukan server realtime"
                />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Section
                  title="Perlu perhatian"
                  description="Persetujuan dan aktivitas terbaru."
                >
                  {pending.map((u) => (
                    <p
                      className="mb-3 rounded-lg border p-3 text-sm"
                      key={u.id}
                    >
                      {u.name} · {u.approval}
                    </p>
                  ))}
                  <Link
                    className="text-sm text-primary"
                    to="/preview/admin/approvals"
                  >
                    Tinjau registrasi →
                  </Link>
                </Section>
                <Section
                  title="Pindahkan order aktif"
                  description="Admin dapat memindahkan order pemilik nonaktif tanpa menghapus riwayat."
                >
                  <label className="text-xs">
                    Order
                    <select
                      aria-label="Order dipindahkan admin"
                      className={field}
                      value={order}
                      onChange={(e) => setOrder(e.target.value)}
                    >
                      <option value="">Pilih order aktif</option>
                      {state.orders
                        .filter((o) => o.status === "PROSES CEK")
                        .map((o) => (
                          <option key={o.monitoringId} value={o.monitoringId}>
                            {o.monitoringId} · {o.handlerAlias}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="mt-3 block text-xs">
                    Penerima
                    <select
                      aria-label="Penerima admin"
                      className={field}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Pilih HD aktif</option>
                      {state.users
                        .filter(
                          (u) =>
                            u.role === "HD" &&
                            u.active &&
                            u.approval === "APPROVED",
                        )
                        .map((u) => (
                          <option value={u.id} key={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    className="mt-4"
                    disabled={!order || !target}
                    onClick={() =>
                      dispatch({ type: "move", ids: [order], to: target })
                    }
                  >
                    Pindahkan order DEMO
                  </Button>
                </Section>
              </div>
            </>
          }
        />
        <Route path="users" element={<UsersPanel />} />
        <Route path="approvals" element={<UsersPanel approvals />} />
        <Route
          path="templates"
          element={
            <Section
              title="Manajemen template pesan"
              description="Template lokal untuk komposer pengecekan. Tidak dikirim Telegram."
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  dispatch({ type: "template", text: template });
                  setTemplate("");
                }}
              >
                <label className="text-xs">
                  Template baru
                  <textarea
                    aria-label="Template baru"
                    className={field}
                    required
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                  />
                </label>
                <Button className="mt-3" disabled={!template.trim()}>
                  Simpan template
                </Button>
              </form>
              <div className="mt-5 space-y-3">
                {state.templates.map((t) => (
                  <p className="rounded-lg border p-4 text-sm" key={t.id}>
                    {t.text}
                  </p>
                ))}
              </div>
            </Section>
          }
        />
        <Route
          path="integrations"
          element={
            <div className="grid gap-6 lg:grid-cols-2">
              <Section
                title="Monitoring bot Telegram"
                description="Arsitektur rencana: Telegram → Bot Python/Bot baru → Express → MySQL → Express → React."
              >
                <ShieldCheck className="mb-4 size-8 text-primary" />
                <Badge variant="outline">OFFLINE · belum terhubung</Badge>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Tidak ada polling, webhook, token bot, migrasi Google Sheets,
                  atau pengiriman jaringan aktif pada preview.
                </p>
              </Section>
              <Section
                title="Antrean pengiriman pesan"
                description="Simulasi pesan lokal, tidak ada delivery ke Telegram."
              >
                {state.orders
                  .flatMap((o) =>
                    o.messages.map((m) => ({
                      id: m.id,
                      code: o.monitoringId,
                      at: m.at,
                    })),
                  )
                  .map((m) => (
                    <div
                      key={m.id}
                      className="mb-3 flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-xs"
                    >
                      <span>
                        {m.code} · {formatTimestamp(m.at)}
                      </span>
                      <Badge variant="outline">SIMULATED · NOT SENT</Badge>
                    </div>
                  ))}
                {!state.orders.some((o) => o.messages.length) && (
                  <Empty text="Belum ada pesan simulasi di antrean." />
                )}
              </Section>
            </div>
          }
        />
        <Route
          path="audit"
          element={
            <Section
              title="Audit Log"
              description="Riwayat tindakan demo lokal; bukan audit log produksi."
            >
              <ol className="space-y-3">
                {state.audit.map((event, index) => (
                  <li className="rounded-lg border p-4" key={index}>
                    <p className="text-sm">{event.text}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatTimestamp(event.at)}
                    </p>
                  </li>
                ))}
              </ol>
              {!state.audit.length && (
                <Empty text="Belum ada tindakan pada simulasi ini." />
              )}
            </Section>
          }
        />
        <Route
          path="*"
          element={<Empty text="Halaman admin tidak ditemukan." />}
        />
      </Routes>
    </>
  );
}

function UsersPanel({ approvals = false }: { approvals?: boolean }) {
  const { state, dispatch } = usePreview();
  return (
    <Section
      title={approvals ? "Persetujuan Registrasi HD" : "Manajemen Pengguna"}
      description="Data identitas fiktif, hanya tersedia di admin preview. Akun nonaktif tidak dapat login; order tetap dimiliki pemegang lama."
    >
      <div className="space-y-3">
        {(approvals
          ? state.users.filter((u) => u.approval !== "APPROVED")
          : state.users
        ).map((u) => (
          <article
            key={u.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4"
          >
            <div>
              <p className="font-medium">
                {u.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  @{u.username} · {u.role}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                ID Karyawan: {u.nik} · Telegram: {u.telegram} / {u.telegramId}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Verifikasi Telegram: belum tersedia (DEMO)
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">{u.approval}</Badge>
                <Badge variant={u.active ? "success" : "warning"}>
                  {u.active ? "Aktif" : `Nonaktif ${u.disabledKind ?? ""}`}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["PENDING APPROVAL", "RESUBMITTED"].includes(u.approval) && (
                <>
                  <Button
                    onClick={() =>
                      dispatch({ type: "approval", id: u.id, approved: true })
                    }
                  >
                    Setujui {u.username}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      dispatch({ type: "approval", id: u.id, approved: false })
                    }
                  >
                    Tolak {u.username}
                  </Button>
                </>
              )}
              {u.approval === "REJECTED" && (
                <Button
                  variant="outline"
                  onClick={() => dispatch({ type: "resubmit", id: u.id })}
                >
                  Simulasi RESUBMITTED
                </Button>
              )}
              {!approvals && u.approval === "APPROVED" && (
                <>
                  {u.active ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={u.id === state.sessionId}
                        onClick={() =>
                          dispatch({
                            type: "active",
                            id: u.id,
                            active: false,
                            kind: "sementara",
                          })
                        }
                      >
                        Nonaktif sementara
                      </Button>
                      <Button
                        variant="outline"
                        disabled={u.id === state.sessionId}
                        onClick={() =>
                          dispatch({
                            type: "active",
                            id: u.id,
                            active: false,
                            kind: "permanen",
                          })
                        }
                      >
                        Nonaktif permanen
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() =>
                        dispatch({ type: "active", id: u.id, active: true })
                      }
                    >
                      Aktifkan kembali
                    </Button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
