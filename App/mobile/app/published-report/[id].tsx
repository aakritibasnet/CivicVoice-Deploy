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
import { colors } from "@/theme/colors";
import { getPublicPublishedReport, type PublicReport } from "@/api/wardPublish";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function SectionHeader({ icon, title, count }: { icon: string; title: string; count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={colors.red2} />
      <Text style={styles.sectionTitle}>
        {title} ({count})
      </Text>
    </View>
  );
}

function TaskItem({ title, category, officer, department }: {
  title: string;
  category?: string | null;
  officer?: string | null;
  department?: string | null;
}) {
  return (
    <View style={styles.taskItem}>
      <View style={styles.taskBullet} />
      <View style={{ flex: 1 }}>
        <Text style={styles.taskTitle}>{title}</Text>
        <Text style={styles.taskMeta}>
          {[category, department, officer].filter(Boolean).join(" · ") || "General"}
        </Text>
      </View>
    </View>
  );
}

export default function PublishedReportScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  const reportQuery = useQuery({
    queryKey: ["publicPublishedReport", reportId],
    queryFn: () => getPublicPublishedReport(reportId),
    enabled: !!reportId,
  });

  const report: PublicReport | undefined = reportQuery.data;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Ward Report</Text>
        <View style={{ width: 22 }} />
      </View>

      {reportQuery.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} size="large" />
        </View>
      )}

      {!reportQuery.isLoading && !report && (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Report not found</Text>
        </View>
      )}

      {report && (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Ward & Period */}
          <View style={styles.heroCard}>
            <Text style={styles.wardName}>{report.ward_name}</Text>
            <Text style={styles.periodText}>
              Report for {formatDate(report.period.from)} — {formatDate(report.period.to)}
            </Text>
            <Text style={styles.publishedAt}>
              Published {formatDate(report.published_at)}
            </Text>
          </View>

          {/* Overview */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overview</Text>
            <View style={styles.overviewGrid}>
              <OverviewPill label="Total" value={report.overview.total_tasks} color={colors.text} />
              <OverviewPill label="Planned" value={report.overview.planned} color="#6B7280" />
              <OverviewPill label="In Progress" value={report.overview.in_progress} color="#F59E0B" />
              <OverviewPill label="Completed" value={report.overview.completed} color="#16A34A" />
              {report.overview.closed > 0 && (
                <OverviewPill label="Closed" value={report.overview.closed} color="#EF4444" />
              )}
            </View>
          </View>

          {/* What changed */}
          {(report.changes_since_last_report.new_tasks > 0 || report.changes_since_last_report.status_updates.length > 0) && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What Changed Since Last Report</Text>
              {report.changes_since_last_report.new_tasks > 0 && (
                <Text style={styles.changeText}>
                  {report.changes_since_last_report.new_tasks} new task{report.changes_since_last_report.new_tasks !== 1 ? "s" : ""} received
                </Text>
              )}
              {report.changes_since_last_report.status_updates.map((u, i) => (
                <View key={i} style={styles.changeRow}>
                  <Ionicons name="arrow-forward-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.changeText}>
                    <Text style={{ fontWeight: "800" }}>{u.title}</Text>: {u.from} → {u.to}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Completed work */}
          {report.sections.completed_work.length > 0 && (
            <View style={styles.card}>
              <SectionHeader icon="checkmark-circle-outline" title="Work Completed" count={report.sections.completed_work.length} />
              {report.sections.completed_work.map((t, i) => (
                <TaskItem key={i} title={t.title} category={t.category} officer={t.officer} department={t.department} />
              ))}
            </View>
          )}

          {/* In Progress */}
          {report.sections.in_progress.length > 0 && (
            <View style={styles.card}>
              <SectionHeader icon="construct-outline" title="Work In Progress" count={report.sections.in_progress.length} />
              {report.sections.in_progress.map((t, i) => (
                <TaskItem key={i} title={t.title} category={t.category} officer={t.officer} department={t.department} />
              ))}
            </View>
          )}

          {/* Planned */}
          {report.sections.planned_work.length > 0 && (
            <View style={styles.card}>
              <SectionHeader icon="clipboard-outline" title="Planned Work" count={report.sections.planned_work.length} />
              {report.sections.planned_work.map((t, i) => (
                <TaskItem key={i} title={t.title} category={t.category} department={t.department} />
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function OverviewPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.overviewPill}>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
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

  heroCard: {
    backgroundColor: colors.red2,
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
  },
  wardName: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.white,
  },
  periodText: {
    marginTop: 6,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
  },
  publishedAt: {
    marginTop: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
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
    fontSize: 15,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 10,
  },

  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  overviewPill: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 80,
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
  },

  taskItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red2,
    marginTop: 6,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  taskMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  changeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  changeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
});
