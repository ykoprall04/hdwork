import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, UserRoundPlus } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Section } from "../operations/components";
import { usePreview } from "./context";
export const field =
  "mt-2 block min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground";
export default function PreviewAuth() {
  const { state, dispatch } = usePreview();
  const navigate = useNavigate();
  const location = useLocation();
  const register = location.pathname.endsWith("/register");
  const [username, setUsername] = useState("hd_demo_1");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const application = state.users.find((u) => u.username === submitted);
  function login(event: FormEvent) {
    event.preventDefault();
    const account = state.users.find((u) => u.username === username);
    dispatch({ type: "login", username });
    if (account?.active && account.approval === "APPROVED")
      navigate(account.role === "HD" ? "/preview/jobs" : "/preview/admin");
  }
  function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("username")).trim();
    dispatch({
      type: "register",
      user: {
        name: String(values.get("name")).trim(),
        username: name,
        nik: String(values.get("nik")).trim(),
        telegram: String(values.get("telegram")).trim(),
        telegramId: String(values.get("telegramId")).trim(),
      },
    });
    setSubmitted(name);
  }
  function persona(username: string) {
    dispatch({ type: "login", username });
    navigate(username.startsWith("hd_") ? "/preview/jobs" : "/preview/admin");
  }
  return (
    <div className="min-h-screen bg-muted/40 p-4 sm:p-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link className="font-semibold" to="/monitoring">
          HD Work <span className="text-primary">2.0</span>
        </Link>
        <ThemeToggle compact />
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-10 py-10 lg:min-h-[80vh] lg:grid-cols-2">
        <div>
          <span className="text-xs font-semibold tracking-[.2em] text-primary">
            OPERATIONS, REIMAGINED.
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Satu workspace.
            <br />
            Setiap pekerjaan
            <br />
            <span className="text-primary">lebih terarah.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
            Pilih pekerjaan, kendalikan antrean, dan kolaborasikan pengecekan
            dalam satu ruang kerja modern.
          </p>
          <div className="mt-8 flex items-start gap-3 rounded-xl border bg-card p-5">
            <ShieldCheck className="size-6 shrink-0 text-primary" />
            <p className="text-xs leading-6 text-muted-foreground">
              <strong className="block text-foreground">
                PREVIEW FRONTEND · DATA DEMO
              </strong>
              Tidak menggunakan kredensial nyata. Password hanya validasi form
              dan tidak disimpan. Data simulasi berada di memori dan reset saat
              reload. Telegram belum diverifikasi atau terhubung.
            </p>
          </div>
          <Link
            to="/monitoring"
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary"
          >
            Monitoring tanpa login
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <Section
          title={register ? "Registrasi petugas HD" : "Selamat datang kembali"}
          description={
            register
              ? "Gunakan identitas fiktif untuk simulasi persetujuan."
              : "Login simulasi, terpisah dari autentikasi operasional."
          }
        >
          {register ? (
            <form className="space-y-4" onSubmit={signup}>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["name", "Nama lengkap", "text"],
                  ["username", "Username", "text"],
                  ["password", "Password", "password"],
                  ["nik", "NIK / ID Karyawan", "text"],
                  ["telegram", "Username Telegram", "text"],
                  ["telegramId", "Telegram User ID", "text"],
                ].map(([name, label, type]) => (
                  <label key={name} className="text-xs font-medium">
                    {label}
                    <input
                      className={field}
                      name={name}
                      type={type}
                      required
                      minLength={name === "password" ? 6 : 1}
                      pattern={name === "telegramId" ? "[0-9]+" : undefined}
                      autoComplete="off"
                      placeholder={
                        name === "nik"
                          ? "DEMO-EMP-123"
                          : name === "telegramId"
                            ? "9000007"
                            : undefined
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Telegram User ID diisi manual. Verifikasi bot wajib pada fase
                integrasi; belum tersedia pada preview.
              </p>
              <Button type="submit" className="w-full">
                <UserRoundPlus />
                Ajukan pendaftaran
              </Button>
              {application && (
                <div
                  role="status"
                  className="rounded-lg border bg-muted p-4 text-sm"
                >
                  <p>
                    {application.username}:{" "}
                    <strong>{application.approval}</strong>
                  </p>
                  {application.approval === "REJECTED" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() =>
                        dispatch({ type: "resubmit", id: application.id })
                      }
                    >
                      Ajukan ulang (RESUBMITTED)
                    </Button>
                  )}
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={login} className="space-y-4">
              <label className="block text-xs font-medium">
                Username
                <input
                  className={field}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium">
                Password demo
                <input
                  className={field}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Isi sembarang password demo"
                  autoComplete="off"
                />
              </label>
              <Button className="w-full" type="submit">
                Masuk ke preview
                <ArrowRight />
              </Button>
              <div className="border-t pt-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Atau coba persona demo tanpa password:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["hd_demo_1", "Petugas HD"],
                    ["admin_demo", "Admin"],
                    ["superadmin_demo", "Super Admin"],
                  ].map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      onClick={() => persona(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </form>
          )}
          {state.notice && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-primary/5 p-3 text-xs leading-5 text-primary"
            >
              {state.notice}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-between gap-3 border-t pt-4 text-xs">
            <Link
              className="text-primary hover:underline"
              to={register ? "/preview/login" : "/preview/register"}
            >
              {register ? "Sudah punya akun? Login" : "Daftar sebagai HD"}
            </Link>
            <Link to="/login" className="text-muted-foreground hover:underline">
              Login operasional lama
            </Link>
          </div>
        </Section>
      </main>
    </div>
  );
}
