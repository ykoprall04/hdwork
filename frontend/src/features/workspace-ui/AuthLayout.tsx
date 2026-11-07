import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
export default function AuthLayout({ children, notice, home, linkLabel }: { children: ReactNode; notice: ReactNode; home: string; linkLabel: string }) {
  return (
    <div className="min-h-screen bg-muted/40 p-4 sm:p-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link className="font-semibold" to={home}>
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
              {notice}
            </p>
          </div>
          <Link
            to={home}
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary"
          >
            {linkLabel}
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}
