import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PagerView, {
  type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { colors } from "@/theme/colors";

import HomeScreen from "./index";
import ReportsScreen from "./reports";
import LeaderboardScreen from "./leaderboard";
import ProfileTab from "./profile-tab";

type IoniconName =
  | "home-outline"
  | "newspaper-outline"
  | "trophy-outline"
  | "person-outline";

const TABS: { label: string; icon: IoniconName }[] = [
  { label: "Home",    icon: "home-outline" },
  { label: "Reports", icon: "newspaper-outline" },
  { label: "Leaders", icon: "trophy-outline" },
  { label: "Profile", icon: "person-outline" },
];

export default function TabLayout() {
  const { unreadCount } = useUnreadNotifications();
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const insets = useSafeAreaInsets();

  const badge =
    unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;

  const handleTabPress = useCallback((index: number) => {
    setActiveIndex(index);
    pagerRef.current?.setPage(index);
  }, []);

  const handlePageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      setActiveIndex(e.nativeEvent.position);
    },
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
        overdrag={false}
        offscreenPageLimit={1}
      >
        <View key="home" collapsable={false} style={styles.page}>
          <HomeScreen />
        </View>
        <View key="reports" collapsable={false} style={styles.page}>
          <ReportsScreen />
        </View>
        <View key="leaderboard" collapsable={false} style={styles.page}>
          <LeaderboardScreen />
        </View>
        <View key="profile" collapsable={false} style={styles.page}>
          <ProfileTab />
        </View>
      </PagerView>

      <View
        style={[
          styles.tabBar,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        {TABS.map(({ label, icon }, index) => {
          const active = activeIndex === index;
          const showBadge = label === "Profile" && badge;
          return (
            <Pressable
              key={label}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => handleTabPress(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={icon}
                  size={24}
                  color={active ? colors.red2 : colors.textMuted}
                />
                {showBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.red2 : colors.textMuted },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 14,
    marginHorizontal: 4,
    marginTop: 2,
  },
  tabItemActive: {
    backgroundColor: colors.red2 + "12",
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: colors.red2,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "800",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
