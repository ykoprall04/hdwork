import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import AppSidebar from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import B2cStagingPage from "@/pages/B2cStagingPage";
import DashboardPage from "@/pages/DashboardPage";
import AttendancePage from "@/pages/AttendancePage";
import LoginPage from "@/pages/LoginPage";
import OrdersPage from "@/pages/OrdersPage";
import OrderDetailPage from "@/pages/OrderDetailPage";
import TeamPage from "@/pages/TeamPage";
import ReportsPage from "@/pages/ReportsPage";
import UserManagementPage from "@/pages/UserManagementPage";
import GroupManagementPage from "@/pages/GroupManagementPage";
import { NetworkToolsRoute } from "@/components/WorkspaceOutlet";

import HdWorkspacePage from "@/pages/HdWorkspacePage";

function InternalAuthLayout() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

export default function InternalRoutes() {
  return (
        <Routes>
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
        </Routes>
  );
}

