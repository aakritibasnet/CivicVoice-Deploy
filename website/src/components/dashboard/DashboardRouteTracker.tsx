"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { isTrackableDashboardPath } from "@/src/lib/dashboard-routes";
import { useDashboardStore } from "@/src/store/dashboard-store";

export default function DashboardRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setActivePath } = useDashboardStore();
  const query = searchParams.toString();

  useEffect(() => {
    if (!isTrackableDashboardPath(pathname)) {
      return;
    }

    setActivePath(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query, setActivePath]);

  return null;
}
