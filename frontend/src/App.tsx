import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PreviewProvider } from '@/features/preview/store';
import PreviewApp from '@/features/preview/PreviewApp';
import PublicMonitoringPage from '@/pages/PublicMonitoringPage';
const InternalRoutes = lazy(() => import('./InternalRoutes'));
const LegacyRoutes = lazy(() => import('./LegacyRoutes'));
function DemoRoutes() {
  return <PreviewProvider><Routes><Route path="monitoring" element={<PublicMonitoringPage />} /><Route path="monitoring/:monitoringId" element={<PublicMonitoringPage />} /><Route path="*" element={<PreviewApp />} /></Routes></PreviewProvider>;
}
export default function App() {
  if (window.location.pathname === '/legacy' || window.location.pathname.startsWith('/legacy/')) return <BrowserRouter basename="/legacy"><Suspense fallback={<p role="status">Memuat legacy…</p>}><LegacyRoutes /></Suspense></BrowserRouter>;
  return <BrowserRouter><Suspense fallback={<p role="status" className="p-8">Memuat HD Work 2.0…</p>}><Routes><Route path="/preview/*" element={<DemoRoutes />} /><Route path="/*" element={<InternalRoutes />} /></Routes></Suspense></BrowserRouter>;
}
