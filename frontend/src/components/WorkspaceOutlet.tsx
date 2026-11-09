import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { readTerminalRecovery } from "@/lib/terminal-session";
const NetworkToolsPage = lazy(() => import("@/pages/NetworkToolsPage"));

// Keep the SSH workspace (including xterm's screen and scrollback) mounted
// across route changes, but never across users or login sessions.
function NetworkToolsWorkspace() {
  const { pathname } = useLocation();
  const active = pathname.replace(/\/+$/, "") === "/network-tools";
  const { user } = useAuth();
  const [visited, setVisited] = useState(() => active || readTerminalRecovery()?.user_id === user?.id);

  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  if (!visited && !active) return null;
  return (
    <div hidden={!active}>
      <Suspense fallback={<p role="status">Memuat Network Tools…</p>}><NetworkToolsPage active={active} /></Suspense>
    </div>
  );
}

export default function WorkspaceOutlet() {
  const { token, user } = useAuth();
  return (
    <>
      {token && user?.role === "HD" && (
        <NetworkToolsWorkspace key={`${user.id}:${token}`} />
      )}
      <Outlet />
    </>
  );
}

// The actual HD workspace is owned by the authenticated application layout.
export function NetworkToolsRoute() {
  const { user } = useAuth();
  return user?.role === "HD" ? null : (
    <div className="p-6 text-muted-foreground">
      Network Tools hanya tersedia untuk HD.
    </div>
  );
}
