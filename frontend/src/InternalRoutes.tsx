import UnavailableWorkflows from '@/features/operational/UnavailableWorkflows';
import { CheckInGate, LocalCheckInProvider, OperationalCheckIn } from '@/features/operational/local-checkin';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import SessionProvider from '@/features/operational/SessionProvider';
import { useOperationalSession } from '@/features/operational/session-state';
import OperationalLogin from '@/features/operational/Login';
import Shell, { Jobs, B2cHome, Unavailable } from '@/features/operational/Shell';
import B2cStagingPage from '@/pages/B2cStagingPage';
import { Button } from '@/components/ui/button';
function LocalLayout() { return <LocalCheckInProvider><Outlet /></LocalCheckInProvider>; }
function Guard() {
  const { status, error, retry } = useOperationalSession();
  if (status === 'loading') return <p role="status" className="p-8">Memverifikasi sesi HD Work 2.0…</p>;
  if (status === 'error') return <div role="alert" className="space-y-4 p-8"><p>{error}</p><Button onClick={retry}>Coba verifikasi kembali</Button></div>;
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}
export default function InternalRoutes() {
  return <SessionProvider><Routes><Route path="/login" element={<OperationalLogin />} /><Route element={<Guard />}><Route element={<LocalLayout />}><Route element={<Shell />}><Route element={<CheckInGate />}><Route path="/check-in" element={<OperationalCheckIn />} /><Route path="/orders/:id" element={<UnavailableWorkflows title="Detail Order" />} /><Route path="/monitoring" element={<Unavailable title="Monitoring Publik" />} /><Route path="/jobs" element={<Jobs />} /><Route path="/work/B2C" element={<B2cHome />} /><Route path="/b2c/staging" element={<B2cStagingPage />} />{['ASSUREN', 'B2B', 'REPLACEMENT'].map(category => <Route key={category} path={`/work/${category}`} element={<UnavailableWorkflows title={`Dashboard ${category}`} />} />)}{[['my-work', 'Pekerjaan Saya'], ['transfers', 'Transfer Order'], ['productivity', 'Produktivitas HD'], ['admin/*', 'Dashboard Admin'], ['work/B2C/LOGIC', 'LOGIC'], ['work/B2C/TIAL', 'TIAL']].map(([path, title]) => <Route key={path} path={path} element={path === 'work/B2C/TIAL' ? <Navigate to="/b2c/staging" replace /> : <UnavailableWorkflows title={title} />} />)}<Route path="/" element={<Navigate to="/jobs" replace />} /><Route path="/dashboard" element={<Navigate to="/jobs" replace />} /><Route path="*" element={<Unavailable title="Halaman operasional" />} /></Route></Route></Route></Route></Routes></SessionProvider>;
}
