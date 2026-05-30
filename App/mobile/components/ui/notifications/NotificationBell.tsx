import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AnimatedIconButton } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

type Props = {
  color?: string;
};

export default function NotificationBell({ color = colors.text }: Props) {
  const { unreadCount } = useUnreadNotifications();
  const scale = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > prevCount.current) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.15,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevCount.current = unreadCount;
  }, [scale, unreadCount]);

  const displayCount =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <AnimatedIconButton
      onPress={() => router.push("/notifications")}
      hitSlop={10}
      style={styles.wrap}
      accessibilityLabel="Notifications"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="notifications-outline" size={22} color={color} />
      </Animated.View>

      {displayCount && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{displayCount}</Text>
        </View>
      )}
    </AnimatedIconButton>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 4,
  },
  badge: {
    position: "absolute",
    top: -4,
    left: -2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.white,
    zIndex: 1,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9.5,
    fontWeight: "900",
    lineHeight: 12,
  },
});

