import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import { getOfficerTasks, getOfficerProfileApi, type OfficerTask, type TaskFilters } from "@/api/officerApi";
import { getOfficerUnreadCount } from "@/api/officerApi";

// ─── Constants ─────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "todo", label: "Todo", color: "#6B7280", icon: "ellipse-outline" },
  { key: "in_progress", label: "In Progress", color: "#F59E0B", icon: "play-circle-outline" },
  { key: "completed", label: "Completed", color: "#16A34A", icon: "checkmark-circle-outline" },
  { key: "invalid", label: "Invalid", color: "#DC2626", icon: "close-circle-outline" },
] as const;

// Accepted range: matches the backend priority_level enum.
const PRIORITY_COLORS: Record<OfficerTask["priority"], string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#F59E0B",
  low: "#16A34A",
};

function friendlyPriority(priority: OfficerTask["priority"]) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

// ─── Task Card ─────────────────────────────────────────────────────────

function TaskCard({ task }: { task: OfficerTask }) {
  const priorityColor = PRIORITY_COLORS[task.priority] ?? colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
      onPress={() => router.push(`/officer-task/${task.id}` as any)}
    >
      {task.proof_count > 0 && (
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }} />
          <View style={styles.proofBadge}>
            <Ionicons name="camera" size={12} color={colors.white} />
            <Text style={styles.proofCount}>{task.proof_count}</Text>
          </View>
        </View>
      )}

      <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>

      <View style={[styles.priorityBadge, { backgroundColor: priorityColor + "18" }]}>
        <Ionicons name="flag-outline" size={11} color={priorityColor} />
        <Text style={[styles.priorityText, { color: priorityColor }]}>
          {friendlyPriority(task.priority)}
        </Text>
      </View>

      {task.category && (
        <View style={styles.categoryBadge}>
          <Ionicons name="pricetag-outline" size={11} color={colors.red2} />
          <Text style={styles.categoryText}>{task.category}</Text>
        </View>
      )}

      <View style={styles.cardMeta}>
        {task.ward_name && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{task.location_text || task.ward_name}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {new Date(task.assigned_at).toLocaleDateString(undefined, {
              month: "short", day: "numeric",
            })}
          </Text>
        </View>
      </View>

      {task.report_title && (
        <View style={styles.linkedReport}>
          <Ionicons name="link-outline" size={12} color={colors.textMuted} />
          <Text style={styles.linkedText} numberOfLines={1}>{task.report_title}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────

export default function OfficerTasksScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<string>("todo");
  const hasAutoSwitched = useRef(false);

  // Probe in-progress tasks once on mount to decide the default tab.
  const inProgressProbe = useQuery({
    queryKey: ["officerTasks", { status: "in_progress" }],
    queryFn: () => getOfficerTasks({ status: "in_progress" }),
  });

  useEffect(() => {
    if (hasAutoSwitched.current || inProgressProbe.data === undefined) return;
    hasAutoSwitched.current = true;
    if (inProgressProbe.data.length > 0) {
      setActiveTab("in_progress");
    }
  }, [inProgressProbe.data]);

  const profileQuery = useQuery({
    queryKey: ["officerProfile"],
    queryFn: getOfficerProfileApi,
  });

  const isMunicipalityOfficer = profileQuery.data?.type === "municipality_officer";

  const filters: TaskFilters = {
    status: activeTab,
  };

  const tasksQuery = useQuery({
    queryKey: ["officerTasks", filters],
    queryFn: () => getOfficerTasks(filters),
  });

  const unreadQuery = useQuery({
    queryKey: ["officerUnreadCount"],
    queryFn: getOfficerUnreadCount,
  });

  const tasks = tasksQuery.data ?? [];
  const unreadCount = unreadQuery.data ?? 0;
  const headerSubtitle = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} assigned to you`;

  const onRefresh = useCallback(() => {
    tasksQuery.refetch();
    unreadQuery.refetch();
  }, [tasksQuery, unreadQuery]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>
            {isMunicipalityOfficer ? "Municipality Tasks" : "My Tasks"}
          </Text>
          <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
        </View>
        <Pressable
          style={styles.notifBtn}
          onPress={() => router.push("/officer-notifications" as any)}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifDot}>
              <Text style={styles.notifDotText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Status Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 3 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={isActive ? tab.color : colors.textMuted}
              />
              <Text style={[styles.tabText, isActive && { color: tab.color, fontWeight: "900" }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Task List */}
      {(tasksQuery.isLoading || (!hasAutoSwitched.current && inProgressProbe.isLoading)) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TaskCard task={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={tasksQuery.isFetching && !tasksQuery.isLoading}
              onRefresh={onRefresh}
              colors={[colors.red2]}
              tintColor={colors.red2}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={activeTab === "completed" ? "checkmark-done-circle-outline" : "clipboard-outline"}
                size={56}
                color={colors.border}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === "completed" ? "No completed tasks"
                  : activeTab === "invalid" ? "No invalid tasks"
                  : "No tasks here"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === "todo"
                  ? "New tasks will appear here when assigned to you"
                  : activeTab === "in_progress"
                  ? "Start working on a task to see it here"
                  : activeTab === "invalid"
                  ? "Tasks marked as invalid will appear here"
                  : "Completed tasks will show up as you finish work"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, fontWeight: "700", marginTop: 2 },
  notifBtn: { position: "relative", padding: 6 },
  notifDot: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: colors.red2,
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.white,
    zIndex: 1,
  },
  notifDotText: { color: colors.white, fontSize: 9.5, fontWeight: "900", lineHeight: 12 },

  tabBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: "visible",
  },
  tabBarContent: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    overflow: "visible",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
  },

  listContent: { padding: 16, paddingBottom: 100 },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  proofBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.red2,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  proofCount: { fontSize: 10, fontWeight: "900", color: colors.white },

  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },
  priorityBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  priorityText: { fontSize: 11, fontWeight: "900" },

  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.red2 + "10",
    marginBottom: 8,
  },
  categoryText: { fontSize: 11, fontWeight: "700", color: colors.red2 },

  cardMeta: { gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: "600", flex: 1 },

  linkedReport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  linkedText: { fontSize: 11, color: colors.textMuted, fontWeight: "600", flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 12 },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
});
