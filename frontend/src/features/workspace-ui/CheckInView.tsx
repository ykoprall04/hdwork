import { CircleCheck, Clock3, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export default function CheckInView({ status, onChange, onContinue, description, footer, choiceText }: { status: "ONLINE" | "SIBUK" | "OFFLINE"; onChange: (value: "ONLINE" | "SIBUK" | "OFFLINE") => void; onContinue: () => void; description: string; footer: string; choiceText?: (value: string) => string }) {
  return (
    <main className="mx-auto max-w-4xl space-y-6 py-8">
      <p className="text-xs font-semibold tracking-[.2em] text-primary">
        STEP 02 / CHECK-IN
      </p>
      <h1 className="text-3xl font-semibold">
        Bagaimana kesiapan Anda hari ini?
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Pilih status kerja sebelum memilih pekerjaan. {description}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {choices.map(({ status: value, icon: Icon, text }) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => onChange(value)}
            className={`rounded-2xl border p-6 text-left ${status === value ? "border-primary bg-primary/5" : "bg-card"}`}
          >
            <Icon className="mb-5 size-8 text-primary" />
            <strong className="text-sm">{value}</strong>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              {choiceText ? choiceText(value) : text}
            </p>
          </button>
        ))}
      </div>
      <Button
        onClick={onContinue}
      >
        Lanjutkan ke Pilih Pekerjaan
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        {footer}
      </p>
    </main>
  );
}
