export const workspaceModules: Record<string, readonly string[]> = {
  B2C: ['TIAL', 'LOGIC_PSB', 'LOGIC_MO', 'REQ'], ASSUREN: ['ASSUREN'], B2B: ['B2B'], REPLACEMENT: ['REPLACEMENT'],
};
export const workAreaModules: Record<string, readonly string[]> = {TIAL: ['TIAL', 'REQ'], LOGIC: ['LOGIC_PSB', 'LOGIC_MO']};
export function canOpenWorkspace(workspace: string, modules: readonly string[] = []) {
  const required = Object.hasOwn(workspaceModules, workspace) ? workspaceModules[workspace] : Object.hasOwn(workAreaModules, workspace) ? workAreaModules[workspace] : [];
  return required.some(module => modules.includes(module));
}
export function accessibleWorkspaces(modules: readonly string[] = []) {
  return Object.keys(workspaceModules).filter(workspace => canOpenWorkspace(workspace, modules));
}

// Navigation visibility never grants data access; WorkspaceBoundary and the API
// continue to enforce module grants, including for Super Admin.
export function visibleWorkspaces(user: {role: string; modules?: readonly string[]}) {
  return user.role === 'SUPER_ADMIN' ? Object.keys(workspaceModules) : accessibleWorkspaces(user.modules).filter(area => area === 'B2C');
}
