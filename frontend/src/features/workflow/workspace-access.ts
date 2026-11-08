export const workspaceModules: Record<string, readonly string[]> = {
  B2C: ['TIAL', 'LOGIC_PSB', 'LOGIC_MO', 'REQ'], ASSUREN: ['ASSUREN'], B2B: ['B2B'], REPLACEMENT: ['REPLACEMENT'],
};
export function canOpenWorkspace(workspace: string, modules: readonly string[] = []) {
  return Object.hasOwn(workspaceModules, workspace) && workspaceModules[workspace].some(module => modules.includes(module));
}
export function accessibleWorkspaces(modules: readonly string[] = []) {
  return Object.keys(workspaceModules).filter(workspace => canOpenWorkspace(workspace, modules));
}
