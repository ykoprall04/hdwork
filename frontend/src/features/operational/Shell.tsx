import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, LayoutDashboard, ListTodo, LogOut, MessagesSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import WorkspacePicker from './WorkspacePicker';
import { workspaces } from './workspaces';
export function Unavailable({ title = 'Fitur operasional' }: { title?: string }) {
  return <section className="rounded-xl border bg-card p-6"><p className="text-xs font-semibold text-muted-foreground">BELUM TERSEDIA</p><h1 className="mt-3 text-2xl font-semibold">{title}</h1><p className="mt-3 text-sm text-muted-foreground">API untuk fitur ini belum tersedia pada workspace operasional. Tidak ada data simulasi atau tindakan order yang dijalankan.</p><Link to="/jobs" className="mt-5 inline-block text-sm text-primary underline">Kembali ke Pilih Pekerjaan</Link></section>;
}
export function Jobs() {
  return <><header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / PILIH PEKERJAAN</p><h1 className="mt-2 text-3xl font-semibold">Pilih pekerjaan Anda</h1><p className="mt-3 text-sm text-muted-foreground">Satu workspace untuk seluruh pekerjaan HD. Ketersediaan data mengikuti API dan hak akses akun.</p></header><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{workspaces.map(category => <Link key={category} to={`/work/${category}`} className="group rounded-xl border bg-card p-6 shadow-sm transition hover:border-primary/40"><span className="inline-flex rounded-xl bg-primary/10 p-3 text-primary"><BriefcaseBusiness /></span><h2 className="mt-5 text-xl font-semibold">HD {category}</h2><p className="mt-3 text-sm text-muted-foreground">{category === 'B2C' ? 'TIAL read-only · LOGIC belum tersedia' : 'Belum tersedia'}</p><span className="mt-6 inline-flex items-center gap-2 text-sm text-primary">Buka workspace <ArrowRight className="size-4" /></span></Link>)}</div></>;
}
export function B2cHome() {
  const { user } = useAuth();
  return <><header><p className="text-xs font-semibold text-primary">WORKSPACE / B2C</p><h1 className="mt-2 text-3xl font-semibold">Dashboard B2C</h1><p className="mt-3 text-sm text-muted-foreground">Ringkasan statistik seluruh order belum tersedia. Jumlah satu halaman TIAL bukan total pekerjaan.</p></header><div className="grid gap-5 sm:grid-cols-2"><section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">TIAL</h2><p className="my-3 text-sm text-muted-foreground">Data MySQL staging · read-only · identitas belum permanen.</p>{user?.role === 'SUPER_ADMIN' ? <Button render={<Link to="/b2c/staging" />}>Buka order TIAL</Button> : <p className="text-sm">Akses TIAL saat ini terbatas untuk Super Admin.</p>}</section><Unavailable title="LOGIC PSB / LOGIC MO" /></div></>;
}
export default function Shell() {
  const { user, logout } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const fromPath = location.pathname.match(/^\/work\/([^/]+)/)?.[1];
  const category = location.pathname === '/b2c/staging' ? 'B2C' : workspaces.find(value => value === fromPath);
  const links = [
    { to: '/jobs', label: 'Pilih Pekerjaan', icon: BriefcaseBusiness },
    ...(category ? [{ to: `/work/${category}`, label: `Dashboard ${category}`, icon: LayoutDashboard }] : []),
    ...(category === 'B2C' && user?.role === 'SUPER_ADMIN' ? [{ to: '/b2c/staging', label: 'TIAL · read-only', icon: ListTodo }] : []),
    { to: '/my-work', label: 'Pekerjaan Saya', icon: MessagesSquare },
    { to: '/transfers', label: 'Transfer Order', icon: ListTodo },
    { to: '/productivity', label: 'Produktivitas HD', icon: LayoutDashboard },
    ...(['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') ? [{ to: '/admin', label: 'Dashboard Admin', icon: ShieldCheck }] : []),
  ];
  const navigation = links.map(({ to, label, icon: Icon }) => <NavLink end key={to} to={to} className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}><Icon className="size-4" />{label}</NavLink>);
  return <div className="min-h-screen bg-muted/40"><header className="sticky top-0 z-50 border-b bg-background"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8"><div className="flex flex-wrap items-center gap-4"><Link to="/jobs" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">HD</span><span className="text-sm font-semibold">HD Work 2.0<span className="hidden text-xs font-normal text-muted-foreground sm:block">Operational workspace</span></span></Link><WorkspacePicker category={category} select={navigate} /></div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{user?.name} · {user?.role}</span><ThemeToggle compact /><Button variant="outline" onClick={() => { logout(); navigate('/login', { replace: true }); }}><LogOut />Logout</Button></div></div></header><div className="mx-auto max-w-[1600px] px-4 sm:px-8"><nav aria-label="Navigasi operasional mobile" className="flex gap-2 overflow-x-auto border-b py-4 lg:hidden">{navigation}</nav><div className="grid gap-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="hidden lg:block"><nav aria-label="Navigasi operasional" className="sticky top-28 space-y-2">{navigation}</nav></aside><main className="min-w-0 space-y-6 pb-10"><Outlet /></main></div></div></div>;
}
