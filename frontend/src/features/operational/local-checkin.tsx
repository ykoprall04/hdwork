import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import CheckInView from '../workspace-ui/CheckInView';
import { Context, useLocalCheckIn, type Status } from './local-status';
export function LocalCheckInProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const key = `hdwork:operational:checkin:${user?.id}`;
  const [value, setValue] = useState<Status | null>(() => { try { const saved = sessionStorage.getItem(key); return ['ONLINE', 'SIBUK', 'OFFLINE'].includes(saved || '') ? saved as Status : null; } catch { return null; } });
  function select(next: Status) { setValue(next); try { sessionStorage.setItem(key, next); } catch { /* local memory only */ } }
  function reset() { setValue(null); try { sessionStorage.removeItem(key); } catch { /* no server effects */ } }
  return <Context.Provider value={{ checked: value !== null, status: value || 'OFFLINE', select, reset }}>{children}</Context.Provider>;
}
export function CheckInGate() {
  const { checked } = useLocalCheckIn(); const { pathname } = useLocation();
  return !checked && pathname !== '/check-in' ? <Navigate to="/check-in" replace /> : <Outlet />;
}
export function OperationalCheckIn() {
  const local = useLocalCheckIn(), navigate = useNavigate(); const [status, setStatus] = useState<Status>(local.checked ? local.status : 'ONLINE');
  return <CheckInView status={status} onChange={setStatus} onContinue={() => { local.select(status); navigate('/jobs'); }} description="Status ini hanya preferensi lokal pada tab browser, belum tersinkronisasi ke backend. Tidak mengaktifkan PICK atau tindakan order." footer="ONLINE/SIBUK/OFFLINE belum merupakan status kehadiran server. Tidak mengirim data ke bot atau MySQL; logout hanya menghapus pilihan lokal." choiceText={value => `${value} · pilihan lokal belum tersinkronisasi. Semua tindakan order tetap nonaktif.`} />;
}
