export const DEFAULT_DASHBOARD_PATH = "/dashboard/kanban";
export const DASHBOARD_OVERVIEW_PATH = "/dashboard/overview";

export function resolveDashboardEntryPath(activePath?: string | null): string {
  if (!activePath || activePath === "/dashboard") {
    return DEFAULT_DASHBOARD_PATH;
  }

  return activePath.startsWith("/dashboard/")
    ? activePath
    : DEFAULT_DASHBOARD_PATH;
}

export function isTrackableDashboardPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/");
}
