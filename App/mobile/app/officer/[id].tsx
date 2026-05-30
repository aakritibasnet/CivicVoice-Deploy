import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicOfficerDetailApi,
  type PublicOfficerActivity,
  type PublicOfficerDetail,
} from "@/api/search";
import { colors } from "@/theme/colors";
import Avatar from "@/components/ui/profile/Avatar";

function friendlyStatus(status: string) {
  const map: Record<string, string> = {
    submitted: "Planned",
    under_review: "Under Review",
    in_progress: "In Progress",
    resolved: "Completed",
    closed: "Closed",
  };
  return map[status] || status;
}

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

function StatCard({ icon, color, value, label }: {
  icon: string; color: string; value: number; label: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function OfficerDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const officerId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  const detailQuery = useQuery({
    queryKey: ["officerDetail", officerId],
    queryFn: () => getPublicOfficerDetailApi(officerId),
    enabled: !!officerId,
  });

  const officer: PublicOfficerDetail | undefined = detailQuery.data?.officer;
  const activity: PublicOfficerActivity[] = detailQuery.data?.activity ?? [];

  const completionRate = officer && officer.assigned_tasks > 0
    ? Math.round((officer.completed_tasks / officer.assigned_tasks) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Officer Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      {detailQuery.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} size="large" />
        </View>
      )}

      {!detailQuery.isLoading && !officer && (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Officer not found</Text>
        </View>
      )}

      {officer && (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Profile Header */}
          <View style={styles.profileCard}>
            <Avatar name={officer.name} imageUrl={officer.profile_image_url} size={72} />
            <Text style={styles.officerName}>{officer.name}</Text>

            {officer.department_name && (
              <View style={styles.deptBadge}>
                <Ionicons name="business-outline" size={14} color={colors.red2} />
                <Text style={styles.deptText}>{officer.department_name}</Text>
              </View>
            )}

            {officer.ward_name && (
              <Text style={styles.memberSince}>
                {officer.ward_name}
                {officer.ward_code ? ` (${officer.ward_code})` : ""}
              </Text>
            )}

            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{officer.role.toUpperCase()}</Text>
            </View>

            <Text style={styles.memberSince}>
              Member since {new Date(officer.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <StatCard icon="clipboard-outline" color="#2563EB" value={officer.assigned_tasks} label="Assigned" />
            <StatCard icon="checkmark-done" color="#16A34A" value={officer.completed_tasks} label="Completed" />
            <StatCard icon="flash-outline" color="#F59E0B" value={officer.active_tasks} label="Active" />
            <StatCard icon="trending-up-outline" color="#8B5CF6" value={completionRate} label="% Complete" />
          </View>

          {/* Completion Progress */}
          {officer.assigned_tasks > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Completion Rate</Text>
              <View style={styles.progressBarOuter}>
                <View
                  style={[
                    styles.progressBarInner,
                    { width: `${Math.max(4, completionRate)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {officer.completed_tasks} of {officer.assigned_tasks} tasks completed
              </Text>
            </View>
          )}

          {/* Recent Activity */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
            {activity.length === 0 ? (
              <Text style={styles.noActivity}>No recent activity</Text>
            ) : (
              activity.map((item) => (
                <View key={item.id} style={styles.activityRow}>
                  <View style={styles.activityDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>
                      {item.report_title}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {item.old_status
                        ? `${friendlyStatus(item.old_status)} → ${friendlyStatus(item.new_status)}`
                        : friendlyStatus(item.new_status)}
                    </Text>
                    {item.notes && (
                      <Text style={styles.activityNotes} numberOfLines={2}>{item.notes}</Text>
                    )}
                  </View>
                  <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: colors.text },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "900", color: colors.text },

  content: { padding: 16, paddingBottom: 40 },

  profileCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  officerName: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  deptBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.red2 + "12",
  },
  deptText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.red2,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1,
  },
  memberSince: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 10,
  },

  progressBarOuter: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.red2,
  },
  progressText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
  },

  noActivity: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red2,
    marginTop: 5,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  activityMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  activityNotes: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  activityTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
