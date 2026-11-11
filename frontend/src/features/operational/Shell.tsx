import WorkHome from '../workflow/WorkHome';
import {operationsEnabled} from '../workflow/api';
import {clearDrafts,accountDrafts} from '../workflow/drafts';
import {useEffect} from 'react';
import {cookieMode} from './cookie-http';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Section } from '../operations/components';
import OperationalLayout from './OperationalLayout';
import { accessibleWorkspaces } from '../workflow/workspace-access';
import JobSelection from '../workspace-ui/JobSelection';
import B2cSummary from '../workspace-ui/B2cSummary';
import { useLocalCheckIn } from './local-status';
export function Unavailable({ title = 'Fitur operasional' }: { title?: string }) {
  return <><header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1></header><Section title={title} description="Belum tersedia · API belum tersedia untuk fitur ini."><p className="text-sm text-muted-foreground">Tidak ada data simulasi atau tindakan order yang dijalankan.</p></Section></>;
}
export function Jobs() {
  const { user } = useAuth();
  return <JobSelection base="" allowedCategories={cookieMode ? accessibleWorkspaces(user?.modules) : undefined} description="Pilih ruang kerja sesuai akses modul Anda untuk membuka antrean dan memulai pekerjaan." />;
}
export function B2cHome() {
  const { user } = useAuth();
  if(operationsEnabled)return <WorkHome/>;
  return <><header><p className="text-xs font-semibold tracking-[.18em] text-primary">WORKSPACE / B2C</p><h1 className="mt-2 text-3xl font-semibold">Dashboard B2C</h1><p className="mt-2 text-sm text-muted-foreground">Monitoring dan ringkasan B2C. TIAL read-only; statistik global belum tersedia dari API.</p></header><B2cSummary metrics={['Total order', 'MENUNGGU', 'PROSES CEK', 'DONE', 'GAGAL', 'DUPLICATE'].map(label => ({ label, value: 'Belum tersedia', detail: 'Statistik global belum didukung API' }))} summaries={['TIAL', 'LOGIC'].map(value => ({ title: `Ringkasan ${value}`, cells: ['Total', 'Menunggu', 'Proses'].map(label => ({ label, value: 'Belum tersedia' })) }))} /><div className="flex flex-wrap gap-3">{(user?.role === 'SUPER_ADMIN' || (cookieMode && user?.modules?.length)) ? <Button render={<Link to="/work/B2C/TIAL" />}>Buka order TIAL</Button> : <p className="text-sm text-muted-foreground">TIAL sementara terbatas untuk Super Admin.</p>}<Button variant="outline" render={<Link to="/work/B2C/LOGIC" />}>Buka LOGIC</Button></div><Section title="Order terbaru" description="Belum tersedia · API daftar TIAL tidak menyediakan statistik global atau gabungan LOGIC."><p className="text-sm text-muted-foreground">Buka daftar TIAL untuk membaca halaman data nyata, tanpa fallback DEMO.</p></Section></>;
}
export default function Shell() {
  const { user, logout } = useAuth();
  const local = useLocalCheckIn();
  const navigate = useNavigate();
  useEffect(() => { if (user?.id) accountDrafts(String(user.id)); }, [user?.id]);
  return <OperationalLayout user={user!} local={local} onLogout={async () => {
    const result = await logout();
    if (result === false) return;
    clearDrafts(); local.reset(); navigate('/login', { replace: true });
  }}><Outlet /></OperationalLayout>;
}
