import {lazy, Suspense} from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import AppSidebar from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
const B2cStagingPage = lazy(() => import("@/pages/B2cStagingPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const OrdersPage = lazy(() => import("@/pages/OrdersPage"));
const OrderDetailPage = lazy(() => import("@/pages/OrderDetailPage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const UserManagementPage = lazy(() => import("@/pages/UserManagementPage"));
const GroupManagementPage = lazy(() => import("@/pages/GroupManagementPage"));
import { NetworkToolsRoute } from "@/components/WorkspaceOutlet";

const HdWorkspacePage = lazy(() => import("@/pages/HdWorkspacePage"));

function InternalAuthLayout() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

export default function LegacyRoutes() {
  return (
        <Suspense fallback={<p role="status" className="p-6">Memuat halaman…</p>}><Routes>
          <Route element={<InternalAuthLayout />}>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppSidebar />}>
              <Route path="/workspace" element={<HdWorkspacePage />} />
              <Route path="/workspace/orders/:monitoringId" element={<HdWorkspacePage />} />
              <Route path="/workspace/:section" element={<HdWorkspacePage />} />
              <Route path="/b2c/staging" element={<B2cStagingPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/users" element={<UserManagementPage />} />
              <Route path="/groups" element={<GroupManagementPage />} />
              <Route path="/network-tools" element={<NetworkToolsRoute />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes></Suspense>
  );
}
