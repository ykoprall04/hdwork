import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
export default function WorkspaceHeader({ headerRef, demo, home, subtitle, user, picker, statusControl, onLogout }: { headerRef?: Ref<HTMLElement>; demo?: boolean; home: string; subtitle: string; user: { name: string; role: string }; picker?: ReactNode; statusControl?: ReactNode; onLogout: () => void }) {
  return (
      <header
        ref={headerRef}
        data-preview-header={demo ? "" : undefined}
        className="sticky top-0 z-50 border-b bg-background"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
            <Link
              to={home}
              className="flex shrink-0 items-center gap-3"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                HD
              </span>
              <span className="text-sm font-semibold">
                HD Work 2.0
                <span className="hidden text-xs font-normal text-muted-foreground sm:block">
                  {subtitle}
                </span>
              </span>
            </Link>
            {picker}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {user.name} · {user.role}
            </span>
            {statusControl}
            <ThemeToggle compact />
            <Button
              variant="outline"
              onClick={onLogout}
            >
              <LogOut />
              Logout
            </Button>
          </div>
        </div>
      </header>
  );
}
