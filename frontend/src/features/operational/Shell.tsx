import {accessibleWorkspaces} from '../workflow/workspace-access';
import WorkHome from '../workflow/WorkHome';
import {operationsEnabled} from '../workflow/api';
import {clearDrafts,accountDrafts} from '../workflow/drafts';
import {useEffect} from 'react';
import {cookieMode} from './cookie-http';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, ChartNoAxesCombined, Globe2, LayoutDashboard, ListTodo, MessagesSquare, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Section } from '../operations/components';
import WorkspacePicker from '../preview/WorkspacePicker';
import WorkspaceHeader from '../workspace-ui/WorkspaceHeader';
import JobSelection from '../workspace-ui/JobSelection';
import B2cSummary from '../workspace-ui/B2cSummary';
import { workspaces } from './workspaces';
import { useLocalCheckIn } from './local-status';
export function Unavailable({ title = 'Fitur operasional' }: { title?: string }) {
  return <><header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1></header><Section title={title} description="Belum tersedia · API belum tersedia untuk fitur ini."><p className="text-sm text-muted-foreground">Tidak ada data simulasi atau tindakan order yang dijalankan.</p></Section></>;
}
export function Jobs() {
  const {user}=useAuth();
  return <JobSelection allowedCategories={operationsEnabled?accessibleWorkspaces(user?.modules):undefined} base="" description="Seluruh petugas HD dapat membuka empat kategori. Buka antrean dan pantau status sesuai izin modul akun." />;
}
export function B2cHome() {
  const { user } = useAuth();
  if(operationsEnabled)return <WorkHome/>;
  return <><header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / B2C</p><h1 className="mt-2 text-3xl font-semibold">Dashboard B2C</h1><p className="mt-2 text-sm text-muted-foreground">Monitoring dan ringkasan B2C. TIAL read-only; statistik global belum tersedia dari API.</p></header><B2cSummary metrics={['Total order', 'MENUNGGU', 'PROSES CEK', 'DONE', 'GAGAL', 'DUPLICATE'].map(label => ({ label, value: 'Belum tersedia', detail: 'Statistik global belum didukung API' }))} summaries={['TIAL', 'LOGIC'].map(value => ({ title: `Ringkasan ${value}`, cells: ['Total', 'Menunggu', 'Proses'].map(label => ({ label, value: 'Belum tersedia' })) }))} /><div className="flex flex-wrap gap-3">{(user?.role === 'SUPER_ADMIN' || (cookieMode && user?.modules?.length)) ? <Button render={<Link to="/work/B2C/TIAL" />}>Buka order TIAL</Button> : <p className="text-sm text-muted-foreground">TIAL sementara terbatas untuk Super Admin.</p>}<Button variant="outline" render={<Link to="/work/B2C/LOGIC" />}>Buka LOGIC</Button></div><Section title="Order terbaru" description="Belum tersedia · API daftar TIAL tidak menyediakan statistik global atau gabungan LOGIC."><p className="text-sm text-muted-foreground">Buka daftar TIAL untuk membaca halaman data nyata, tanpa fallback DEMO.</p></Section></>;
}
export default function Shell() {
  const { user, logout } = useAuth(); const local = useLocalCheckIn(); const navigate = useNavigate(); const location = useLocation();
  useEffect(()=>{if(user?.id)accountDrafts(String(user.id));},[user?.id]);
  const [remembered, setRemembered] = useState<typeof workspaces[number] | null>(() => { try { const saved = sessionStorage.getItem(`hdwork:operational:navigation:${user?.id}`); return workspaces.find(value => value === saved) || null; } catch { return null; } });
  function remember(value: typeof workspaces[number]) { setRemembered(value); try { sessionStorage.setItem(`hdwork:operational:navigation:${user?.id}`, value); } catch { /* local navigation only */ } }
  const fromPath = location.pathname.match(/^\/work\/([^/]+)/)?.[1];
  const current = (location.pathname === '/b2c/staging') ? 'B2C' : workspaces.find(value => value === fromPath);
  const isJobs = location.pathname === '/jobs', isCheckIn = location.pathname === '/check-in';
  const category = isJobs || isCheckIn ? null : current || remembered;
  const links = [
    ...(cookieMode?[{to:'/change-password',label:'Ganti Password',icon:ShieldCheck}]:[]),
    ...(category ? [{ to: `/work/${category}`, label: `Dashboard ${category}`, icon: LayoutDashboard }] : []),
    ...(category === 'B2C' ? [{ to: '/work/B2C/TIAL', label: 'TIAL', icon: ListTodo }, { to: '/work/B2C/LOGIC', label: 'LOGIC', icon: ListTodo }, ...(cookieMode&&!operationsEnabled ? [{to:'/work/B2C/REQ',label:'REQ',icon:ListTodo}] : [])].filter(link=>!cookieMode || user?.role==='SUPER_ADMIN' || (operationsEnabled&&link.label==='TIAL'?user?.modules?.some(m=>['TIAL','REQ'].includes(m)):link.label==='LOGIC' ? user?.modules?.some(m=>m.startsWith('LOGIC')) : user?.modules?.includes(link.label))) : []),
    ...(operationsEnabled?[{to:'/recap',label:'Dashboard Rekap',icon:ChartNoAxesCombined}]:[]),
    ...(!operationsEnabled?[{ to: '/my-work', label: 'Pekerjaan Saya', icon: MessagesSquare }]:[]),
    ...(!operationsEnabled?[{ to: '/transfers', label: 'Transfer Order', icon: ArrowRightLeft }]:[]),
    ...(!operationsEnabled?[{ to: '/productivity', label: 'Produktivitas HD', icon: ChartNoAxesCombined }]:[]),
    ...(!operationsEnabled?[{ to: '/monitoring', label: 'Monitoring Publik', icon: Globe2 }]:[]),
    ...((['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '')) ? [{ to: cookieMode ? '/admin/users' : '/admin', label: 'Manajemen Pengguna', icon: ShieldCheck }] : []),
  ];
  return <div className="min-h-screen bg-muted/40"><WorkspaceHeader home="/jobs" subtitle="Operational workspace" user={user!} picker={!isCheckIn && <WorkspacePicker category={category} onSelect={value => { remember(value); navigate(`/work/${value}`); }} onAll={() => navigate('/jobs')} />} statusControl={!isCheckIn && <label className="text-[11px] text-muted-foreground"><span className="hidden sm:inline">Status kerja</span><select aria-label="Status kerja" className="rounded-lg border bg-card p-2 text-xs text-foreground sm:ml-2" value={local.status} onChange={event => local.select(event.target.value as 'ONLINE' | 'SIBUK' | 'OFFLINE')}>{['ONLINE', 'SIBUK', 'OFFLINE'].map(status => <option key={status}>{status}</option>)}</select><span className="block">Lokal · belum tersinkronisasi</span></label>} onLogout={async () => { const result=await logout(); if(result===false)return; clearDrafts(); local.reset(); navigate('/login', { replace: true }); }} /><div className="mx-auto max-w-[1600px] px-4 sm:px-8">{!isJobs && !isCheckIn && <nav aria-label="Navigasi operasional" className="flex gap-2 overflow-x-auto border-b py-4">{links.map(({ to, label, icon: Icon }) => <NavLink end key={to} to={to} onClick={() => { if (current) remember(current); }} className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}><Icon className="size-4" />{label}</NavLink>)}</nav>}{!isJobs && !isCheckIn && <div className="my-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary"><span>{operationsEnabled?'Status kerja lokal · kepemilikan order tetap tersimpan saat offline/logout':'Status kerja lokal belum tersinkronisasi · tindakan order nonaktif · tanpa data DEMO'}</span><Link to="/check-in" className="underline">Ubah check-in</Link></div>}<main className="space-y-6 pb-10"><Outlet /></main></div></div>;
}
