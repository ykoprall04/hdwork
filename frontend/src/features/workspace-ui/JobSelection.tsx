import { Link } from "react-router-dom";
import { BriefcaseBusiness, ArrowRight } from "lucide-react";
import { workspaces as categories } from "../operational/workspaces";
export default function JobSelection({ base = "/preview", description, categoryText, allowedCategories }: { base?: string; description?: string; categoryText?: (category: string) => string; allowedCategories?: readonly string[] }) {
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
          {description ?? "Seluruh petugas HD dapat mengakses empat kategori. Pilih ruang kerja untuk mulai."}
        </p>
      </div>
      {allowedCategories?.length === 0 && <p role="status" className="rounded-lg border bg-card p-4 text-sm">Belum ada modul yang ditugaskan. Hubungi Super Admin untuk akses workspace.</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        {categories.filter(category => !allowedCategories || allowedCategories.includes(category)).map((category, index) => (
          <Link
            key={category}
            to={`${base}/work/${category}`}
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
              {categoryText ? categoryText(category) : category === "B2C"
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
