"use client";

import { useRouter } from "next/navigation";
import { useApolloClient } from "@apollo/client/react";
import { useAuthStore } from "@/src/store/auth-store";
import { LOGIN_MUTATION } from "@/src/graphql/operations/auth";

interface LoginMutationResponse {
  login: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: "ward" | "municipality" | "admin";
      ward_id: string | null;
      municipality_id: string | null;
      must_change_password: boolean;
      ward?: {
        id: string;
        name: string;
        ward_code: string;
      } | null;
    };
  };
}

export function useAuth() {
  const router = useRouter();
  const apolloClient = useApolloClient();
  const { user, token, isAuthenticated, hasHydrated, setAuth, clearAuth } =
    useAuthStore();

  const login = async (
    email: string,
    password: string,
    callbackUrl?: string,
  ) => {
    const result = await apolloClient.mutate<LoginMutationResponse>({
      mutation: LOGIN_MUTATION,
      variables: { email, password },
      fetchPolicy: "no-cache",
    });

    const payload = result.data?.login;

    if (!payload?.token || !payload?.user) {
      throw new Error("Invalid email or password");
    }

    setAuth(
      {
        id: payload.user.id,
        name: payload.user.name,
        email: payload.user.email,
        role: payload.user.role,
        ward_id: payload.user.ward_id,
        municipality_id: payload.user.municipality_id,
        must_change_password: payload.user.must_change_password,
        ward: payload.user.ward ?? null,
      },
      payload.token,
    );

    router.replace(callbackUrl || "/dashboard");
    router.refresh();
  };

  const logout = async () => {
    clearAuth();
    await apolloClient.clearStore();
    router.replace("/auth/login");
    router.refresh();
  };

  return {
    user,
    token,
    isAuthenticated,
    hasHydrated,
    login,
    logout,
    clearAuth,
  };
}
