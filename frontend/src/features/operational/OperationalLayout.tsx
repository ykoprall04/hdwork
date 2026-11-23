import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { ArrowLeft, Bot, ChevronDown, ChevronRight, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Settings2, X } from 'lucide-react';
import type { User } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import { cookieMode } from './cookie-http';
import { operationsEnabled } from '../workflow/api';
import { operationalNavigation, pageContext } from './navigation';
import { showOperationalBackButton, workspaceBackFallback } from './back-navigation';
import { confirmChatNavigation } from '../workflow/unsent-chat';
import type { Status } from './local-status';
import './operational-theme.css';

const TanyaYanto = lazy(() => import('../assistant/TanyaYanto'));

type Props = { user: User; local: { status: Status; select: (value: Status) => void }; onLogout: () => Promise<void>; children: ReactNode };
export default function OperationalLayout({ user, local, onLogout, children }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  function selectStatus(status: Status) {
    if (!confirmChatNavigation()) return;
    local.select(status); navigate('/jobs');
  }
  const [assistant, setAssistant] = useState<'open' | 'minimized' | 'closed'>('closed');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('hdwork2:sidebar-collapsed') === 'true'; } catch { return false; } });
  const groups = operationalNavigation(user, cookieMode, operationsEnabled, import.meta.env.VITE_HDWORK2_LIVE_CHAT === 'true');
  const page = pageContext(pathname);
  const showBackButton = showOperationalBackButton(pathname);
  function goBack() {
    if (!confirmChatNavigation()) return;
    if (workspaceBackFallback(window.history.state)) navigate('/jobs');
    else navigate(-1);
  }
  const checkIn = pathname === '/check-in';
  const assistantAllowed = operationsEnabled && import.meta.env.VITE_HDWORK2_ASSISTANT === 'true' &&
    (['ADMIN', 'SUPER_ADMIN'].includes(user.role) || (user.role === 'HD' && Boolean(user.modules?.length) && user.username !== 'trial_yanto'));
  function launcher(compact = false) {
    return assistantAllowed && <Button type="button" className="mb-2 w-full min-h-11" variant="outline" aria-label="Tanya Yanto" title={compact ? 'Tanya Yanto' : undefined}
      onClick={() => { setDrawerOpen(false); setAssistant('open'); }}><Bot aria-hidden />{!compact && <span>Tanya Yanto</span>}</Button>;
  }
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
    {!checkIn && <aside className="op-sidebar" aria-label="Sidebar">{brand}{navigation(collapsed)}<div className="op-sidebar-bottom">{launcher(collapsed)}<Button variant="ghost" className="w-full min-h-11" onClick={toggle} aria-label={collapsed ? 'Perlebar sidebar' : 'Ciutkan sidebar'} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen /> : <><PanelLeftClose /><span>Ciutkan sidebar</span></>}</Button></div></aside>}
    {assistantAllowed && assistant !== 'closed' && <Suspense fallback={<p className="fixed bottom-4 left-4 z-[85] rounded-lg border bg-card p-3" role="status">Memuat Tanya Yanto…</p>}>
      <TanyaYanto key={user.id} admin={user.role === 'SUPER_ADMIN'} minimized={checkIn || assistant === 'minimized'} minimize={() => setAssistant('minimized')} close={() => setAssistant('closed')} />
    </Suspense>}
    <div className="op-body" data-checkin={checkIn} data-jobs={pathname === '/jobs'}>
      <header className="op-topbar">
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          {!checkIn && <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger render={<Button className="op-mobile-trigger min-h-11 min-w-11" variant="ghost" size="icon" aria-label="Buka navigasi" />}><MenuIcon /></Dialog.Trigger>
            <Dialog.Portal><Dialog.Backdrop className="op-drawer-backdrop" /><Dialog.Popup className="op-drawer">
              <Dialog.Title className="sr-only">Navigasi HD Work 2.0</Dialog.Title>
              <div className="flex items-center justify-between gap-2 p-4">{brand}<Dialog.Close render={<Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Tutup navigasi" />}><X /></Dialog.Close></div>
              {navigation()}<div className="op-sidebar-bottom">{assistantAllowed ? launcher() : <p className="text-xs text-muted-foreground">Ruang kerja sesuai akses modul akun.</p>}</div>
            </Dialog.Popup></Dialog.Portal>
          </Dialog.Root>}
          {showBackButton && <Button variant="outline" className="op-back min-h-10 shrink-0 gap-1.5 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm" aria-label="Kembali" onClick={goBack}><ArrowLeft aria-hidden="true" className="size-4" /><span className="hidden min-[420px]:inline">Kembali</span></Button>}
          <nav aria-label="Breadcrumb" className="op-breadcrumb"><Link to="/jobs">Workspace</Link><ChevronRight aria-hidden="true" />{page.parent && <><Link to={page.parent.to}>{page.parent.label}</Link><ChevronRight aria-hidden="true" /></>}<span aria-current="page">{page.label}</span></nav>
        </div>
        <div className="op-header-controls flex shrink-0 items-center gap-1 sm:gap-3">
          <span className="op-header-status" data-status={local.status} role="status" title="Status kerja pada tab ini">
            <span className="op-status-dot" aria-hidden="true" /><span className="sr-only">Status kerja: </span>{local.status}
          </span>
          <ThemeToggle compact />
          <Menu.Root><Menu.Trigger render={<Button variant="ghost" className="op-profile min-h-11 gap-2 px-1.5 sm:px-2.5" aria-label="Menu akun" />}><span className="op-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-36 truncate text-left text-xs sm:block">{user.name}<small className="block text-muted-foreground">{user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'SHOW_ONLY' ? 'View Only' : user.role}</small></span><ChevronDown className="hidden min-[420px]:block" /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner align="end" sideOffset={8} collisionPadding={12} className="z-[90]"><Menu.Popup className="op-account-menu">
              <p className="break-words border-b px-3 py-3 text-sm font-medium">{user.name}</p>
              <label className="block px-3 py-3 text-xs">Status kerja lokal<select aria-label="Status kerja" className="op-field mt-2" value={local.status} onChange={event => selectStatus(event.target.value as Status)}>{['ONLINE', 'SIBUK', 'OFFLINE'].map(status => <option key={status}>{status}</option>)}</select><span className="mt-2 block text-muted-foreground">Preferensi tab · belum tersinkronisasi</span></label>
              <Menu.Item render={<Link to="/check-in" />} className="op-menu-item"><Settings2 />Ubah check-in</Menu.Item>
              {cookieMode && <Menu.Item render={<Link to="/change-password" />} className="op-menu-item"><Settings2 />Ganti Password</Menu.Item>}
              <Menu.Separator className="my-1 border-t" /><Menu.Item onClick={() => { if (confirmChatNavigation()) void onLogout(); }} className="op-menu-item text-destructive"><LogOut />Logout</Menu.Item>
            </Menu.Popup></Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      <main id="operational-main" tabIndex={-1} className="op-main">
        <div className="op-page space-y-5">{children}</div>
      </main>
    </div>
  </div>;
}
