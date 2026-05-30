import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import { useOfficerRouteAccess } from "@/components/ui/auth/OfficerRouteGuard";
import {
  getOfficerNotifications,
  markOfficerNotificationRead,
  markAllOfficerNotificationsRead,
  type OfficerNotification,
} from "@/api/officerApi";
import { navigateFromNotification } from "@/lib/notificationRouting";

const TYPE_ICONS: Record<string, string> = {
  task_assigned: "clipboard-outline",
  task_returned: "arrow-undo-outline",
  task_invalidated: "close-circle-outline",
  task_escalated: "arrow-up-circle-outline",
  task_completed: "checkmark-circle-outline",
  task_status_updated: "sync-outline",
  task_comment: "chatbubble-outline",
  report_post_comment: "chatbubbles-outline",
  report_post_reply: "return-up-forward-outline",
  report_comment: "chatbubbles-outline",
  task_reopened: "refresh-outline",
  task_reassigned: "swap-horizontal-outline",
  priority_updated: "flag-outline",
  status_updated: "sync-outline",
};

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotificationItem({
  notif,
  onPress,
}: {
  notif: OfficerNotification;
  onPress: () => void;
}) {
  const icon = TYPE_ICONS[notif.type] || "notifications-outline";

  return (
    <Pressable
      style={[styles.notifCard, !notif.is_read && styles.unreadCard]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, !notif.is_read && styles.iconWrapUnread]}>
        <Ionicons
          name={icon as any}
          size={20}
          color={notif.is_read ? colors.textMuted : colors.red2}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.notifTitle, !notif.is_read && { fontWeight: "900" }]}>
          {notif.title}
        </Text>
        {notif.body && (
          <Text style={styles.notifBody} numberOfLines={2}>
            {notif.body}
          </Text>
        )}
        {(notif.task_title || notif.report_title) && (
          <Text style={styles.notifMeta} numberOfLines={1}>
            {notif.task_title || notif.report_title}
          </Text>
        )}
        <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
      </View>
      {!notif.is_read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

export default function OfficerNotificationsScreen() {
  const { loading: authLoading, isAllowed } = useOfficerRouteAccess();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["officerNotifications"],
    queryFn: () => getOfficerNotifications(),
    enabled: isAllowed,
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleTap = async (notif: OfficerNotification) => {
    // Mark as read
    if (!notif.is_read) {
      await markOfficerNotificationRead(notif.id);
      queryClient.invalidateQueries({ queryKey: ["officerNotifications"] });
      queryClient.invalidateQueries({ queryKey: ["officerUnreadCount"] });
    }

    navigateFromNotification({
      link: notif.link,
      type: notif.type,
      reportId: notif.related_report_id ?? null,
      taskId: notif.related_task_id ?? null,
      metadata: notif.metadata ?? null,
    });
  };

  const handleMarkAllRead = async () => {
    await markAllOfficerNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["officerNotifications"] });
    queryClient.invalidateQueries({ queryKey: ["officerUnreadCount"] });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
        {unreadCount === 0 && <View style={{ width: 80 }} />}
      </View>

      {authLoading || query.isLoading || !isAllowed ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem notif={item} onPress={() => handleTap(item)} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isLoading}
              onRefresh={() => query.refetch()}
              colors={[colors.red2]}
              tintColor={colors.red2}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySubtitle}>
                You&apos;ll receive notifications when tasks are assigned, updated, or
                when someone comments on your work.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: colors.text },
  markAllText: { fontSize: 12, fontWeight: "700", color: colors.red2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingVertical: 8 },

  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  unreadCard: {
    backgroundColor: colors.red2 + "06",
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapUnread: {
    backgroundColor: colors.red2 + "14",
  },

  notifTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  notifBody: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  notifMeta: {
    fontSize: 12,
    color: colors.red2,
    fontWeight: "700",
    marginTop: 4,
  },
  notifTime: { fontSize: 11, color: colors.textMuted, marginTop: 4 },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red2,
    marginTop: 6,
  },

  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 12 },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
});
