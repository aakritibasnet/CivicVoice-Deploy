import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  clearAllNotificationsApi,
  type Notification,
} from "@/api/notifications";
import { colors } from "@/theme/colors";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { navigateFromNotification } from "@/lib/notificationRouting";

type Section = {
  title: string;
  data: Notification[];
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  return `${days}d ago`;
}

function getSectionTitle(dateStr: string): string {
  const created = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  return "Earlier";
}

function groupByDate(notifications: Notification[]): Section[] {
  const buckets: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const key = getSectionTitle(n.created_at);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(n);
  }
  return Object.entries(buckets).map(([title, data]) => ({ title, data }));
}

function iconForType(type: Notification["type"]) {
  switch (type) {
    case "status_change":
      return { name: "checkmark-circle-outline", color: "#16A34A" };
    case "comment":
      return { name: "chatbubble-ellipses-outline", color: "#2563EB" };
    case "comment_reply":
    case "report_post_reply":
      return { name: "return-up-forward-outline", color: "#7C3AED" };
    case "report_post_comment":
      return { name: "chatbubbles-outline", color: "#0F766E" };
    case "upvote_milestone":
      return { name: "trophy-outline", color: "#D97706" };
    case "badge_earned":
      return { name: "ribbon-outline", color: "#8B5CF6" };
    case "leaderboard_rank":
      return { name: "podium-outline", color: "#D97706" };
    case "nearby_resolved":
      return { name: "location-outline", color: "#0D9488" };
    case "report_assigned":
      return { name: "document-text-outline", color: "#2563EB" };
    case "report_escalated":
      return { name: "arrow-up-circle-outline", color: "#7C3AED" };
    case "report_returned":
      return { name: "arrow-undo-outline", color: "#EA580C" };
    case "task_assigned":
      return { name: "clipboard-outline", color: "#2563EB" };
    case "task_comment":
      return { name: "chatbubble-outline", color: "#2563EB" };
    case "task_completed":
      return { name: "checkmark-circle-outline", color: "#16A34A" };
    case "task_invalidated":
      return { name: "close-circle-outline", color: "#DC2626" };
    case "task_reassigned":
      return { name: "swap-horizontal-outline", color: "#8B5CF6" };
    case "task_returned":
      return { name: "arrow-undo-outline", color: "#EA580C" };
    case "task_escalated":
      return { name: "arrow-up-circle-outline", color: "#7C3AED" };
    case "task_status_updated":
      return { name: "sync-outline", color: "#0F766E" };
    default:
      return { name: "notifications-outline", color: colors.textMuted };
  }
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { refetch: refetchUnread } = useUnreadNotifications();

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotificationsApi({ limit: 100 }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationReadApi(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void refetchUnread();
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsReadApi(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void refetchUnread();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => clearAllNotificationsApi(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void refetchUnread();
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const sections = groupByDate(notifications);
  const hasUnread = notifications.some((n) => !n.is_read);

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Notifications",
      "This will permanently delete all your notifications. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => clearAllMutation.mutate(),
        },
      ],
    );
  };

  const onPressNotification = (n: Notification) => {
    if (!n.is_read) {
      markOneMutation.mutate(n.id);
    }

    navigateFromNotification({
      link: n.link,
      type: n.type,
      reportId: n.report_id,
      metadata: n.metadata,
    });
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = iconForType(item.type);
    return (
      <Pressable
        onPress={() => onPressNotification(item)}
        style={({ pressed }) => [
          styles.item,
          !item.is_read && styles.itemUnread,
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
          {!item.is_read && <View style={styles.unreadDot} />}
        </View>

        <View style={styles.itemBody}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.itemMessage} numberOfLines={2}>
            {item.message}
          </Text>
        </View>

        <Text style={styles.itemTime}>{timeAgo(item.created_at)}</Text>
      </Pressable>
    );
  };

  if (notificationsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable
          onPress={() => router.push("/notification-settings")}
          hitSlop={10}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Action buttons */}
      {notifications.length > 0 && (
        <View style={styles.actionRow}>
          {hasUnread && (
            <Pressable
              style={styles.actionChip}
              onPress={() => markAllMutation.mutate()}
            >
              <Ionicons name="checkmark-done-outline" size={14} color={colors.red2} />
              <Text style={styles.actionChipText}>Mark all read</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.actionChip, styles.actionChipDanger]}
            onPress={handleClearAll}
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text style={[styles.actionChipText, { color: colors.danger }]}>Clear all</Text>
          </Pressable>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="notifications-off-outline"
            size={64}
            color={colors.border}
          />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>
            You'll see updates here when your reports get activity.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          onRefresh={() => notificationsQuery.refetch()}
          refreshing={notificationsQuery.isFetching}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionChipDanger: {
    borderColor: colors.danger + "30",
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.red2,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 10,
  },
  itemUnread: {
    backgroundColor: "#EEF2FF",
  },
  iconWrap: {
    width: 28,
    alignItems: "center",
  },
  unreadDot: {
    position: "absolute",
    left: -2,
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB",
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 2,
  },
  itemMessage: {
    fontSize: 12,
    color: colors.textMuted,
  },
  itemTime: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 6,
  },
});
