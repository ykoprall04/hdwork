import { ChartNoAxesCombined, LayoutGrid, MessagesSquare, ShieldCheck, Users } from 'lucide-react';
import type { User } from '@/contexts/auth-context';
import { canOpenWorkspace, visibleWorkspaces } from '../workflow/workspace-access';
import { workspaces } from './workspaces';

export function operationalNavigation(user: User, cookie: boolean, operations: boolean, chat: boolean) {
  const operator = ['HD', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
  return [
    { label: 'Utama', items: [{ to: '/jobs', label: 'Pilih pekerjaan', icon: LayoutGrid }] },
    { label: 'Ruang kerja', items: workspaces.filter(area => visibleWorkspaces(user).includes(area)).map(area => ({
      to: `/work/${area}`, label: area === 'B2C' ? 'HD B2C' : area === 'REPLACEMENT' ? 'Replacement' : area, icon: LayoutGrid,
      children: area === 'B2C' ? [
        { to: '/work/B2C', label: 'Ringkasan B2C' },
        ...(!cookie || canOpenWorkspace('TIAL', user.modules) ? [{ to: '/work/B2C/TIAL', label: 'TIAL / REQ' }] : []),
        ...(!cookie || canOpenWorkspace('LOGIC', user.modules) ? [{ to: '/work/B2C/LOGIC', label: 'LOGIC / SOLVER' }] : []),
      ] : undefined,
    })) },
    { label: 'Operasional', items: [
      ...(cookie && operator && chat ? [{ to: '/chat', label: 'Telegram Live Chat', icon: MessagesSquare }] : []),
      ...(operations ? [{ to: '/recap', label: 'Dashboard Rekap', icon: ChartNoAxesCombined }] : []),
    ] },
    { label: 'Pengelolaan', items: [
      ...(cookie && operator ? [{ to: '/admin/system', label: 'Monitoring Sistem', icon: ShieldCheck }] : []),
      ...(['ADMIN', 'SUPER_ADMIN'].includes(user.role) ? [{ to: cookie ? '/admin/users' : '/admin', label: 'Manajemen Pengguna', icon: Users }] : []),
    ] },
  ].filter(group => group.items.length);
}

export function pageContext(path: string) {
  if (path.startsWith('/orders/')) return { label: 'Detail order', parent: null };
  if (path.startsWith('/chat')) return { label: 'Telegram Live Chat', parent: null };
  const pages: Record<string, string> = {
    '/jobs': 'Pilih pekerjaan', '/check-in': 'Check-in', '/recap': 'Dashboard Rekap',
    '/change-password': 'Ganti Password', '/admin/system': 'Monitoring Sistem', '/admin/users': 'Manajemen Pengguna',
    '/admin': 'Manajemen Pengguna', '/b2c/staging': 'Staging B2C',
  };
  if (pages[path]) return { label: pages[path], parent: null };
  const area = workspaces.find(area => path === `/work/${area}` || path.startsWith(`/work/${area}/`));
  return { label: area ? path.includes('/LOGIC') ? 'LOGIC / SOLVER' : /\/(TIAL|REQ)$/.test(path) ? 'TIAL / REQ' : `Dashboard ${area}` : 'Halaman operasional', parent: area ? { label: area, to: `/work/${area}` } : null };
}
