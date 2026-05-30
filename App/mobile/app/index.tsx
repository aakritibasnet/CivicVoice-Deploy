import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessToken } from "@/lib/session";
import { getMe } from "@/lib/auth";
import { colors } from "@/theme/colors";

/**
 * Root index — decides where to send the user on app launch:
 *  • Not onboarded → onboarding
 *  • No token      → login
 *  • Officer role  → officer tabs (with password-change gate)
 *  • Otherwise     → citizen tabs
 */
export default function RootIndex() {
  useEffect(() => {
    (async () => {
      try {
        // 1. Onboarding check
        const seen = await AsyncStorage.getItem("onboardingSeen");
        if (seen !== "true") {
          router.replace("/onboarding");
          return;
        }

        // 2. Auth check
        const token = await getAccessToken();
        if (!token) {
          router.replace("/(tabs)");
          return;
        }

        // 3. Fetch current user to determine role
        const { user } = await getMe();

        if (user.role === "officer") {
          if (user.must_change_password) {
            router.replace("/(officer-auth)/change-password" as any);
          } else {
            router.replace("/(officer-tabs)/tasks" as any);
          }
        } else {
          router.replace("/(tabs)");
        }
      } catch {
        // Token invalid/expired — go to login
        router.replace("/(tabs)");
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.red2} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
