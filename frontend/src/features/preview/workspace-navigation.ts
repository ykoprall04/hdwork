import { categories } from "../operations/demo-data.ts";
export type WorkspaceCategory = (typeof categories)[number];
export const navigationKey = (userId: string) =>
  `hdwork:navigation:v3:${encodeURIComponent(userId)}`;
export function isWorkspaceCategory(
  value: unknown,
): value is WorkspaceCategory {
  return categories.some((category) => category === value);
}
export function categoryFromPath(pathname: string): WorkspaceCategory | null {
  const value = pathname.match(/^\/preview\/work\/([^/]+)(?:\/|$)/)?.[1];
  return isWorkspaceCategory(value) ? value : null;
}
export function workspaceMenu(
  category: WorkspaceCategory | null,
  role: string,
) {
  return [
    ...(category
      ? [
          {
            to: `/preview/work/${category}`,
            label: `Dashboard ${category}`,
            icon: "dashboard" as const,
          },
        ]
      : []),
    ...(category === "B2C"
      ? [
          {
            to: "/preview/work/B2C/TIAL",
            label: "TIAL",
            icon: "orders" as const,
          },
          {
            to: "/preview/work/B2C/LOGIC",
            label: "LOGIC",
            icon: "orders" as const,
          },
        ]
      : []),
    { to: "/preview/my-work", label: "Pekerjaan Saya", icon: "chat" as const },
    {
      to: "/preview/transfers",
      label: "Transfer Order",
      icon: "transfer" as const,
    },
    {
      to: "/preview/productivity",
      label: "Produktivitas HD",
      icon: "productivity" as const,
    },
    { to: "/preview/monitoring", label: "Monitoring Publik", icon: "public" as const },
    ...(["ADMIN", "SUPER_ADMIN"].includes(role)
      ? [
          {
            to: "/preview/admin",
            label: "Dashboard Admin",
            icon: "admin" as const,
          },
        ]
      : []),
  ];
}
