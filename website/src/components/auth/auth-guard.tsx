"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { useAuthStore } from "@/src/store/auth-store";
import { LuShield } from "react-icons/lu";
import { ME_QUERY } from "@/src/graphql/operations/auth";

interface MeQueryData {
  me: {
    id: string;
  } | null;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, token, user, hasHydrated, clearAuth } =
    useAuthStore();
  const hasValidSession = isAuthenticated && Boolean(token) && Boolean(user);
  const hasAllowedRole = Boolean(
    user && ["ward", "municipality", "admin"].includes(user.role),
  );
  const { data, loading } = useQuery<MeQueryData>(ME_QUERY, {
    skip: !hasHydrated || !hasValidSession || !hasAllowedRole,
    fetchPolicy: "network-only",
  });
  const hasVerifiedUser = Boolean(data?.me);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!hasValidSession || !hasAllowedRole) {
      router.replace("/auth/login");
      return;
    }

    if (!loading && !hasVerifiedUser) {
      clearAuth();
      router.replace("/auth/login");
    }
  }, [
    clearAuth,
    hasAllowedRole,
    hasHydrated,
    hasValidSession,
    hasVerifiedUser,
    loading,
    router,
  ]);

  if (!hasHydrated || (hasValidSession && hasAllowedRole && loading)) {
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

  if (!hasValidSession || !hasAllowedRole || !hasVerifiedUser) {
    return null;
  }

  return <>{children}</>;
}
