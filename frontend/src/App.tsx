import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PreviewProvider } from "@/features/preview/store";
import PreviewApp from "@/features/preview/PreviewApp";
import PublicMonitoringPage from "@/pages/PublicMonitoringPage";

// Internal auth, API configuration and sockets are loaded only for internal routes.
const InternalRoutes = lazy(() => import("./InternalRoutes"));

export default function App() {
  return (
    <PreviewProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/preview/*" element={<PreviewApp />} />
          <Route path="/monitoring" element={<PublicMonitoringPage />} />
          <Route
            path="/monitoring/:monitoringId"
            element={<PublicMonitoringPage />}
          />
          <Route
            path="/*"
            element={
              <Suspense
                fallback={
                  <div
                    role="status"
                    className="min-h-screen bg-background p-8 text-sm text-muted-foreground"
                  >
                    Memuat HD Workspace…
                  </div>
                }
              >
                <InternalRoutes />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </PreviewProvider>
  );
}
