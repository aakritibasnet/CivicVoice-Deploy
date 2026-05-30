import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useSegments, router } from "expo-router";
import { colors } from "@/theme/colors";
import { User } from "@/lib/auth";

type Props = {
  user: User | null;
  loading: boolean;
  redirectTo?: string; // default: "/(camera)/camera"
  children: React.ReactNode;
};

export default function AuthGate({
  user,
  loading,
  redirectTo = "/(camera)/camera",
  children,
}: Props) {
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    // prevent redirect loop (don’t redirect if we are already on camera screen)
    const currentTop = segments?.[0] ?? "";
    const isAlreadyOnCamera = segments.join("/").includes("camera");

    if (user && !isAlreadyOnCamera) {
      router.replace(redirectTo as any);
    }
  }, [user, loading, segments, redirectTo]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  // If logged in, AuthGate will redirect. While it redirects, this screen won't matter much.
  return <>{children}</>;
}
