import LiveChat from '@/features/workflow/LiveChat';
import SystemMonitoring from '@/features/operational/SystemMonitoring';
import Register from '@/features/operational/Register';
import ChangePassword from '@/features/operational/ChangePassword';
import WorkspaceBoundary from '@/features/workflow/WorkspaceBoundary';
import OrderDetailPage from '@/features/b2c-orders/OrderDetailPage';
import UserManagement from '@/features/operational/UserManagement';
import {cookieMode} from '@/features/operational/cookie-http';
import {operationsEnabled} from '@/features/workflow/api';
import WorkList from '@/features/workflow/WorkList';
import Recap from '@/features/workflow/Recap';
import TialOrdersPage from '@/features/tial/TialOrdersPage';
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
  return <SessionProvider><Routes><Route path="/login" element={<OperationalLogin />} /><Route path="/register" element={<Register />} /><Route element={<Guard />}><Route element={<LocalLayout />}><Route element={<Shell />}><Route element={<CheckInGate />}><Route path="/check-in" element={<OperationalCheckIn />} /><Route path="/recap" element={operationsEnabled?<Recap/>:<Unavailable title="Dashboard Rekap"/>} /><Route path="/change-password" element={<ChangePassword />} /><Route path="/chat" element={<LiveChat />} /><Route path="/chat/:id" element={<LiveChat />} /><Route path="/admin/system" element={<SystemMonitoring />} /><Route path="/admin/users" element={<UserManagement />} /><Route path="/orders/:id" element={<OrderDetailPage />} /><Route path="/monitoring" element={<Unavailable title="Monitoring Publik" />} /><Route path="/jobs" element={<Jobs />} /><Route path="/work/B2C" element={<WorkspaceBoundary workspace="B2C"><B2cHome /></WorkspaceBoundary>} /><Route path="/b2c/staging" element={<B2cStagingPage />} />{['ASSUREN', 'B2B', 'REPLACEMENT'].map(category => <Route key={category} path={`/work/${category}`} element={operationsEnabled?<WorkspaceBoundary workspace={category}><WorkList key={category}/></WorkspaceBoundary>:<UnavailableWorkflows title={`Dashboard ${category}`} />} />)}{[['my-work', 'Pekerjaan Saya'], ['transfers', 'Transfer Order'], ['productivity', 'Produktivitas HD'], ['admin/*', 'Dashboard Admin'], ['work/B2C/LOGIC', 'LOGIC'], ['work/B2C/TIAL', 'TIAL'], ['work/B2C/REQ','REQ']].map(([path, title]) => <Route key={path} path={path} element={(['work/B2C/TIAL','work/B2C/REQ'].includes(path)||(cookieMode&&path==='work/B2C/LOGIC')) ? (operationsEnabled?<WorkList key={path}/>:<TialOrdersPage key={path} />) : <UnavailableWorkflows title={title} />} />)}<Route path="/" element={<Navigate to="/jobs" replace />} /><Route path="/dashboard" element={<Navigate to={operationsEnabled?"/recap":"/jobs"} replace />} /><Route path="*" element={<Unavailable title="Halaman operasional" />} /></Route></Route></Route></Route></Routes></SessionProvider>;
}
