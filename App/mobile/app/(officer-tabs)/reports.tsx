import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import {
  getOfficerProfileApi,
  getOfficerReports,
  type OfficerReport,
} from "@/api/officerApi";

const STATUS_COLORS: Record<string, string> = {
  incoming: "#6B7280",
  submitted: "#6B7280",
  under_review: "#8B5CF6",
  in_progress: "#F59E0B",
  invalid: "#DC2626",
  resolved: "#16A34A",
  completed: "#16A34A",
  closed: "#DC2626",
};

function ReportCard({ report }: { report: OfficerReport }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={() => router.push(`/officer-report/${report.id}` as any)}
    >
      <View style={styles.cardTop}>
        <View style={[
          styles.statusDot,
          { backgroundColor: STATUS_COLORS[report.status] || "#6B7280" },
        ]} />
        <Text style={styles.statusLabel}>
          {report.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </Text>
        {report.task_status && (
          <View style={styles.taskBadge}>
            <Text style={styles.taskBadgeText}>Task: {report.task_status.replace(/_/g, " ")}</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{report.title}</Text>

      {report.category && (
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{report.category}</Text>
        </View>
      )}

      <View style={styles.metaRow}>
        {report.ward_name && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{report.address_text || report.ward_name}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {new Date(report.submitted_at || report.created_at).toLocaleDateString(undefined, {
              month: "short", day: "numeric",
            })}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="arrow-up" size={14} color={colors.textMuted} />
          <Text style={styles.statText}>{report.upvote_count}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
          <Text style={styles.statText}>{report.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function OfficerReportsScreen() {
  const profileQuery = useQuery({
    queryKey: ["officerProfile"],
    queryFn: getOfficerProfileApi,
  });
  const query = useQuery({
    queryKey: ["officerReports"],
    queryFn: () => getOfficerReports(),
  });

  const reports = query.data ?? [];
  const isMunicipalityOfficer =
    profileQuery.data?.type === "municipality_officer";
  const title = isMunicipalityOfficer ? "Municipality Reports" : "Reports";
  const subtitle = isMunicipalityOfficer
    ? `${reports.length} ${reports.length === 1 ? "report" : "reports"} in ${profileQuery.data?.municipality_name ?? "scope"}`
    : `${reports.length} linked ${reports.length === 1 ? "report" : "reports"}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReportCard report={item} />}
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
              <Ionicons name="newspaper-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>
                {isMunicipalityOfficer ? "No municipality reports" : "No linked reports"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isMunicipalityOfficer
                  ? "Reports from your municipality and its wards will appear here"
                  : "Reports related to your tasks will appear here"}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, fontWeight: "700", marginTop: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, paddingBottom: 100 },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, flex: 1 },
  taskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.red2 + "12",
  },
  taskBadgeText: { fontSize: 10, fontWeight: "700", color: colors.red2 },

  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },

  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.bg,
    marginBottom: 8,
  },
  categoryText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  metaRow: { gap: 4, marginBottom: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 16, marginTop: 4 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 12 },
  emptySubtitle: {
    fontSize: 13, color: colors.textMuted, textAlign: "center",
    marginTop: 6, lineHeight: 18,
  },
});
