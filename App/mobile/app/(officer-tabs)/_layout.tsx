import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PagerView, {
  type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import OfficerRouteGuard from "@/components/ui/auth/OfficerRouteGuard";
import ChatToast from "@/components/chat/ChatToast";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useChatStore } from "@/store/chat";
import { useArchiveStore } from "@/store/archive";
import { colors } from "@/theme/colors";

import OfficerTasksScreen from "./tasks";
import OfficerReportsScreen from "./reports";
import OfficerChatsScreen from "./chats";
import OfficerProfileScreen from "./profile";

type IoniconName =
  | "clipboard-outline"
  | "newspaper-outline"
  | "chatbubbles-outline"
  | "person-outline";

const TABS: { label: string; icon: IoniconName }[] = [
  { label: "Tasks",   icon: "clipboard-outline" },
  { label: "Reports", icon: "newspaper-outline" },
  { label: "Chats",   icon: "chatbubbles-outline" },
  { label: "Profile", icon: "person-outline" },
];

export default function OfficerTabLayout() {
  useChatRealtime(true);
  const queryClient = useQueryClient();
  const unreadByChat = useChatStore((s) => s.unreadByChat);
  const archivedChatIds = useArchiveStore((s) => s.archivedChatIds);
  // Archived chats are intentionally left out of the tab badge — their unread
  // is surfaced (muted) on the Archived entry inside the Messages screen.
  const totalUnread = useMemo(() => {
    const archived = new Set(archivedChatIds);
    return Object.entries(unreadByChat).reduce(
      (sum, [chatId, count]) =>
        archived.has(chatId) ? sum : sum + (count || 0),
      0,
    );
  }, [unreadByChat, archivedChatIds]);
  const chatBadge =
    totalUnread > 0 ? (totalUnread > 99 ? "99+" : String(totalUnread)) : null;

  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const insets = useSafeAreaInsets();

  // PagerView pages are plain components, not routes — they don't get
  // router focus events. Refetch from the layout level instead so the
  // chat list (and ward org section) always reflects the latest state
  // when the user navigates back from a chat screen.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["officerChats"] });
      queryClient.invalidateQueries({ queryKey: ["wardOrgs"] });
      queryClient.invalidateQueries({ queryKey: ["municipalityOrgs"] });
      queryClient.invalidateQueries({ queryKey: ["chatPeers"] });
    }, [queryClient]),
  );

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
    <OfficerRouteGuard>
      <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageSelected={handlePageSelected}
          overdrag={false}
          offscreenPageLimit={1}
        >
          <View key="tasks" collapsable={false} style={styles.page}>
            <OfficerTasksScreen />
          </View>
          <View key="reports" collapsable={false} style={styles.page}>
            <OfficerReportsScreen />
          </View>
          <View key="chats" collapsable={false} style={styles.page}>
            <OfficerChatsScreen />
          </View>
          <View key="profile" collapsable={false} style={styles.page}>
            <OfficerProfileScreen />
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
            const showBadge = label === "Chats" && chatBadge;
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
                      <Text style={styles.badgeText}>{chatBadge}</Text>
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
      <ChatToast />
    </OfficerRouteGuard>
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
