import type { ReactNode } from 'react';

export default function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">{eyebrow && <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>}<h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>{description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</header>;
}
