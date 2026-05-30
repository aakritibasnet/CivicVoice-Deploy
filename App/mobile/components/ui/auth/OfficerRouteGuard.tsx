import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme/colors";

type OfficerRouteGuardProps = {
  children: React.ReactNode;
  allowMustChangePassword?: boolean;
};

export function useOfficerRouteAccess(options?: {
  allowMustChangePassword?: boolean;
}) {
  const { user, loading } = useAuth();
  const allowMustChangePassword = options?.allowMustChangePassword ?? false;

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace("/(auth)/login" as any);
      return;
    }

    if (user.role !== "officer") {
      router.replace("/(tabs)" as any);
      return;
    }

    if (user.must_change_password && !allowMustChangePassword) {
      router.replace("/(officer-auth)/change-password" as any);
    }
  }, [allowMustChangePassword, loading, user]);

  const isAllowed =
    !!user &&
    user.role === "officer" &&
    (allowMustChangePassword || !user.must_change_password);

  return {
    user,
    loading,
    isAllowed,
  };
}

export default function OfficerRouteGuard({
  children,
  allowMustChangePassword = false,
}: OfficerRouteGuardProps) {
  const { loading, isAllowed } = useOfficerRouteAccess({
    allowMustChangePassword,
  });

  if (loading || !isAllowed) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  return <>{children}</>;
}
