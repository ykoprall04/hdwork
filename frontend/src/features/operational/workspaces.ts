export const workspaces = ['B2C', 'ASSUREN', 'B2B', 'REPLACEMENT'] as const;
export type Workspace = typeof workspaces[number];
