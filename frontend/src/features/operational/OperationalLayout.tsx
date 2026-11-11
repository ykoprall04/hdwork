import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown, ChevronRight, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Settings2, X } from 'lucide-react';
import type { User } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import { cookieMode } from './cookie-http';
import { operationsEnabled } from '../workflow/api';
import { operationalNavigation, pageContext } from './navigation';

type Props = { user: User; local: { status: string; select: (value: 'ONLINE' | 'SIBUK' | 'OFFLINE') => void }; onLogout: () => Promise<void>; children: ReactNode };
export default function OperationalLayout({ user, local, onLogout, children }: Props) {
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('hdwork2:sidebar-collapsed') === 'true'; } catch { return false; } });
  const groups = operationalNavigation(user, cookieMode, operationsEnabled, import.meta.env.VITE_HDWORK2_LIVE_CHAT === 'true');
  const page = pageContext(pathname);
  const checkIn = pathname === '/check-in';
  function toggle() { setCollapsed(value => { try { localStorage.setItem('hdwork2:sidebar-collapsed', String(!value)); } catch { /* optional preference */ } return !value; }); }
  function navigation(compact = false) {
    return <nav aria-label="Navigasi operasional" className="op-navigation" onClick={event => { if ((event.target as HTMLElement).closest('a')) setDrawerOpen(false); }}>{groups.map(group => <section key={group.label}>
      <h2 className={compact ? 'sr-only' : 'op-nav-heading'}>{group.label}</h2>
      {group.items.map(item => <div key={item.to}>
        {'children' in item && item.children && !compact ? <details className="op-workspace-group" open>
          <summary><item.icon aria-hidden="true" /><span>{item.label}</span><ChevronDown className="ml-auto" aria-hidden="true" /></summary>
          <div className="op-submenu">{item.children.map(child => <NavLink end key={child.to} to={child.to} className="op-nav-link">{child.label}</NavLink>)}</div>
        </details> : <NavLink title={compact ? item.label : undefined} aria-label={item.label} end={item.to !== '/chat' && item.to !== '/work/B2C'} to={item.to} className="op-nav-link"><item.icon aria-hidden="true" />{!compact && <span>{item.label}</span>}</NavLink>}
      </div>)}
    </section>)}</nav>;
  }
  const brand = <Link to="/jobs" className="op-brand" aria-label="HD Work 2.0 · Pilih pekerjaan"><span className="op-brand-mark">HD</span><span className="op-brand-name">HD Work <span className="text-primary">2.0</span><small>Operations workspace</small></span></Link>;
  return <div className="op-shell" data-collapsed={collapsed}>
    <a href="#operational-main" className="op-skip">Langsung ke konten</a>
    {!checkIn && <aside className="op-sidebar" aria-label="Sidebar">{brand}{navigation(collapsed)}<div className="op-sidebar-bottom"><Button variant="ghost" className="w-full min-h-11" onClick={toggle} aria-label={collapsed ? 'Perlebar sidebar' : 'Ciutkan sidebar'} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen /> : <><PanelLeftClose /><span>Ciutkan sidebar</span></>}</Button></div></aside>}
    <div className="op-body" data-checkin={checkIn}>
      <header className="op-topbar">
        <div className="flex min-w-0 items-center gap-3">
          {!checkIn && <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger render={<Button className="op-mobile-trigger min-h-11 min-w-11" variant="ghost" size="icon" aria-label="Buka navigasi" />}><MenuIcon /></Dialog.Trigger>
            <Dialog.Portal><Dialog.Backdrop className="op-drawer-backdrop" /><Dialog.Popup className="op-drawer">
              <Dialog.Title className="sr-only">Navigasi HD Work 2.0</Dialog.Title>
              <div className="flex items-center justify-between gap-2 p-4">{brand}<Dialog.Close render={<Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Tutup navigasi" />}><X /></Dialog.Close></div>
              {navigation()}<p className="op-sidebar-bottom text-xs text-muted-foreground">Ruang kerja sesuai akses modul akun.</p>
            </Dialog.Popup></Dialog.Portal>
          </Dialog.Root>}
          <nav aria-label="Breadcrumb" className="op-breadcrumb"><Link to="/jobs">Workspace</Link><ChevronRight aria-hidden="true" />{page.parent && <><Link to={page.parent.to}>{page.parent.label}</Link><ChevronRight aria-hidden="true" /></>}<span aria-current="page">{page.label}</span></nav>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3"><ThemeToggle compact />
          <Menu.Root><Menu.Trigger render={<Button variant="ghost" className="min-h-11 gap-2" aria-label="Menu akun" />}><span className="op-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-36 truncate text-left text-xs sm:block">{user.name}<small className="block text-muted-foreground">{user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'SHOW_ONLY' ? 'View Only' : user.role}</small></span><ChevronDown /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner align="end" sideOffset={8} collisionPadding={12} className="z-[90]"><Menu.Popup className="op-account-menu">
              <p className="break-words border-b px-3 py-3 text-sm font-medium">{user.name}</p>
              <label className="block px-3 py-3 text-xs">Status kerja lokal<select aria-label="Status kerja" className="op-field mt-2" value={local.status} onChange={event => local.select(event.target.value as 'ONLINE' | 'SIBUK' | 'OFFLINE')}>{['ONLINE', 'SIBUK', 'OFFLINE'].map(status => <option key={status}>{status}</option>)}</select><span className="mt-2 block text-muted-foreground">Preferensi tab · belum tersinkronisasi</span></label>
              <Menu.Item render={<Link to="/check-in" />} className="op-menu-item"><Settings2 />Ubah check-in</Menu.Item>
              {cookieMode && <Menu.Item render={<Link to="/change-password" />} className="op-menu-item"><Settings2 />Ganti Password</Menu.Item>}
              <Menu.Separator className="my-1 border-t" /><Menu.Item onClick={() => void onLogout()} className="op-menu-item text-destructive"><LogOut />Logout</Menu.Item>
            </Menu.Popup></Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      <main id="operational-main" tabIndex={-1} className="op-main">
        {!checkIn && <p className="op-local-status"><span aria-hidden="true" className={local.status === 'ONLINE' ? 'bg-emerald-600' : local.status === 'SIBUK' ? 'bg-amber-600' : 'bg-slate-400'} />{local.status} · status lokal{!operationsEnabled && ' · tindakan order nonaktif'}</p>}
        <div className="op-page space-y-5">{children}</div>
      </main>
    </div>
  </div>;
}
