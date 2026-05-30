"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LuShield } from "react-icons/lu";

import { resolveDashboardEntryPath } from "@/src/lib/dashboard-routes";
import { useAuthStore } from "@/src/store/auth-store";
import { useDashboardStore } from "@/src/store/dashboard-store";

interface DashboardEntryRedirectProps {
  unauthenticatedTarget?: string;
}

export default function DashboardEntryRedirect({
  unauthenticatedTarget,
}: DashboardEntryRedirectProps) {
  const router = useRouter();
  const {
    isAuthenticated,
    token,
    user,
    hasHydrated: authHasHydrated,
  } = useAuthStore();
  const { activePath, hasHydrated: dashboardHasHydrated } =
    useDashboardStore();
  const hasValidSession = isAuthenticated && Boolean(token) && Boolean(user);

  useEffect(() => {
    if (!authHasHydrated || !dashboardHasHydrated) {
      return;
    }

    if (!hasValidSession) {
      if (unauthenticatedTarget) {
        router.replace(unauthenticatedTarget);
      }
      return;
    }

    router.replace(resolveDashboardEntryPath(activePath));
  }, [
    activePath,
    authHasHydrated,
    dashboardHasHydrated,
    hasValidSession,
    router,
    unauthenticatedTarget,
  ]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center animate-pulse">
          <LuShield className="text-2xl text-white" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
