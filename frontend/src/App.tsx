import RetryableRoute from './components/routing/RetryableRoute';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
const InternalRoutes = lazy(() => import('./InternalRoutes'));
const loadLegacy = () => import('./LegacyRoutes');
const loadPreview = () => import('./PreviewRoutes');
export default function App() {
  if (window.location.pathname === '/legacy' || window.location.pathname.startsWith('/legacy/')) return <BrowserRouter basename="/legacy"><Suspense fallback={<p role="status">Memuat legacy…</p>}><RetryableRoute load={loadLegacy} /></Suspense></BrowserRouter>;
  return <BrowserRouter><Suspense fallback={<p role="status" className="p-8">Memuat HD Work 2.0…</p>}><Routes><Route path="/preview/*" element={<RetryableRoute load={loadPreview} />} /><Route path="/*" element={<InternalRoutes />} /></Routes></Suspense></BrowserRouter>;
}
