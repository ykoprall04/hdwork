import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Section } from '../operations/components';
import { operationsEnabled } from './api';
import { canOpenWorkspace } from './workspace-access';
export default function WorkspaceBoundary({ workspace, children }: { workspace: string; children: ReactNode }) {
  const { user } = useAuth();
  if (!operationsEnabled || canOpenWorkspace(workspace, user?.modules)) return children;
  return <><Section title={`Akses ${workspace} belum diberikan`} description="Hubungi Super Admin untuk penugasan modul akun."><Link to="/jobs" className="text-primary underline">Kembali ke pilihan pekerjaan</Link></Section>{children}</>;
}
