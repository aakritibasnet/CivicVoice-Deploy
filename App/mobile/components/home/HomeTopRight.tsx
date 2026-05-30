import React from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import Avatar from "@/components/ui/profile/Avatar";
import NotificationBell from "@/components/ui/notifications/NotificationBell";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { User } from "@/lib/auth";
import { colors } from "@/theme/colors";

type Props = {
  user: User | null;
  avatarUrl: string | null;
  onOpenMenu: () => void;
};

export default function HomeTopRight({ user, avatarUrl, onOpenMenu }: Props) {
  return (
    <View style={styles.topRight}>
      <NotificationBell color={colors.text} />

      {!user ? (
        <AnimatedPressable
          style={styles.anonAvatar}
          onPress={() => router.push("/(auth)/login")}
          tapVariant="nav"
          accessibilityLabel="Login"
        >
          <Ionicons
            name="person-circle-outline"
            size={36}
            color={colors.textMuted}
          />
        </AnimatedPressable>
      ) : (
        <AnimatedPressable
          onPress={() => router.push("/(profile)/profile")}
          style={styles.avatarPress}
          hitSlop={10}
          tapVariant="nav"
        >
          <Avatar name={user.name} imageUrl={avatarUrl} size={38} />
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRight: {
    position: "absolute",
    top: 50,
    right: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    zIndex: 10,
  },
  avatarPress: { borderRadius: 999 },
  anonAvatar: { borderRadius: 999 },
});
