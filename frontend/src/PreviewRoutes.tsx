import { Route, Routes } from 'react-router-dom';
import { PreviewProvider } from '@/features/preview/store';
import PreviewApp from '@/features/preview/PreviewApp';
import PublicMonitoringPage from '@/pages/PublicMonitoringPage';

// Loaded only when /preview/* matches. Keep the demo provider out of other routes.
export default function PreviewRoutes() {
  return <PreviewProvider><Routes><Route path="monitoring" element={<PublicMonitoringPage />} /><Route path="monitoring/:monitoringId" element={<PublicMonitoringPage />} /><Route path="*" element={<PreviewApp />} /></Routes></PreviewProvider>;
}
