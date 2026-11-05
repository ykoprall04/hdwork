import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, Clock3, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreview } from "./context";
import { workStatus, type WorkStatus } from "./work-status";
const choices = [
  {
    status: "ONLINE" as const,
    icon: CircleCheck,
    text: "Siap menerima pekerjaan. PICK dan semua pekerjaan sendiri tersedia.",
  },
  {
    status: "SIBUK" as const,
    icon: Clock3,
    text: "Fokus pada pekerjaan sendiri. PICK order baru dinonaktifkan.",
  },
  {
    status: "OFFLINE" as const,
    icon: Power,
    text: "Tetap bisa membuka dan menangani pekerjaan sendiri, tanpa PICK baru.",
  },
];
export default function CheckInPage() {
  const { state, dispatch } = usePreview();
  const [status, setStatus] = useState<WorkStatus>(
    workStatus(state) === "OFFLINE" ? "ONLINE" : workStatus(state),
  );
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-4xl space-y-6 py-8">
      <p className="text-xs font-semibold tracking-[.2em] text-primary">
        STEP 02 / CHECK-IN
      </p>
      <h1 className="text-3xl font-semibold">
        Bagaimana kesiapan Anda hari ini?
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Pilih status kerja sebelum memilih pekerjaan. Status terakhir disimpan
        per akun pada browser ini. Status OFFLINE tetap mengizinkan penanganan
        order sendiri.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {choices.map(({ status: value, icon: Icon, text }) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`rounded-2xl border p-6 text-left ${status === value ? "border-primary bg-primary/5" : "bg-card"}`}
          >
            <Icon className="mb-5 size-8 text-primary" />
            <strong className="text-sm">{value}</strong>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              {text}
            </p>
          </button>
        ))}
      </div>
      <Button
        onClick={() => {
          dispatch({ type: "work-status", status });
          navigate("/preview/jobs");
        }}
      >
        Lanjutkan ke Pilih Pekerjaan
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        Refresh atau menutup browser tidak membuat Anda OFFLINE. Hanya tombol
        Logout aplikasi yang mengubah status ke OFFLINE. Status ini simulasi
        lokal, bukan status kehadiran backend.
      </p>
    </main>
  );
}
