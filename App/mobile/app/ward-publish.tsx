import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import {
  getPublishPreview,
  publishReport,
  getPublishedReports,
  type PublishPreview,
  type PublishedReport,
} from "@/api/wardPublish";

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

function statusColor(status: string) {
  switch (status) {
    case "resolved": return "#16A34A";
    case "in_progress": case "under_review": return "#F59E0B";
    case "submitted": return "#6B7280";
    case "closed": return "#EF4444";
    default: return colors.textMuted;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WardPublishScreen() {
  const queryClient = useQueryClient();
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const { showToast } = useToast();

  const previewQuery = useQuery({
    queryKey: ["publishPreview"],
    queryFn: getPublishPreview,
  });

  const historyQuery = useQuery({
    queryKey: ["publishedReports"],
    queryFn: () => getPublishedReports(1),
  });

  const publishMutation = useMutation({
    mutationFn: publishReport,
    onSuccess: (data) => {
      setPreviewModalOpen(false);
      showToast({
        type: "success",
        title: "Published",
        message: "The report has been published successfully.",
      });
      void queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
      void queryClient.invalidateQueries({ queryKey: ["publishedReports"] });
    },
    onError: (err: any) => {
      showToast({
        type: "error",
        title: "Publish failed",
        message: getFriendlyErrorMessage(
          err,
          "Something went wrong. Please try again.",
        ),
      });
    },
  });

  const preview: PublishPreview | undefined = previewQuery.data;
  const history: PublishedReport[] = historyQuery.data?.reports ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Report Publishing</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        {preview && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={20} color={colors.red2} />
              <Text style={styles.statusLabel}>
                {preview.days_remaining > 0
                  ? `Auto-publishes in ${preview.days_remaining} day${preview.days_remaining !== 1 ? "s" : ""}`
                  : "Auto-publish is due"}
              </Text>
            </View>

            <View style={styles.overviewGrid}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{preview.current_snapshot.length}</Text>
                <Text style={styles.overviewLabel}>Total Tasks</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{preview.changes_since_last.total_changes}</Text>
                <Text style={styles.overviewLabel}>Changes</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: preview.can_publish ? "#16A34A" : colors.danger }]}>
                  {preview.can_publish ? "Yes" : "No"}
                </Text>
                <Text style={styles.overviewLabel}>Can Publish</Text>
              </View>
            </View>

            {!preview.can_publish && (
              <View style={styles.warningBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.warningText}>{preview.reason}</Text>
              </View>
            )}

            <Pressable
              style={[styles.publishBtn, !preview.can_publish && styles.publishBtnDisabled]}
              onPress={() => setPreviewModalOpen(true)}
              disabled={!preview.can_publish}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.white} />
              <Text style={styles.publishBtnText}>Preview & Publish</Text>
            </Pressable>
          </View>
        )}

        {previewQuery.isLoading && (
          <ActivityIndicator color={colors.red2} style={{ marginVertical: 40 }} />
        )}

        {/* Published History */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Published Reports</Text>
            {history.map((report) => (
              <Pressable
                key={report.id}
                style={styles.historyCard}
                onPress={() => router.push({ pathname: "/published-report/[id]" as any, params: { id: report.id } })}
              >
                <View style={styles.historyTop}>
                  <Text style={styles.historyDate}>{formatDate(report.published_at)}</Text>
                  {report.is_auto_published && (
                    <View style={styles.autoBadge}>
                      <Text style={styles.autoBadgeText}>Auto</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.historySummary} numberOfLines={3}>
                  {report.summary_text}
                </Text>
                {report.published_by_name && (
                  <Text style={styles.historyMeta}>
                    Published by {report.published_by_name}
                  </Text>
                )}
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* Preview & Publish Modal */}
      <Modal
        visible={previewModalOpen}
        animationType="slide"
        onRequestClose={() => setPreviewModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPreviewModalOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Publish Preview</Text>
            <View style={{ width: 24 }} />
          </View>

          {preview && (
            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Summary */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Report Summary</Text>
                <Text style={styles.summaryText}>{preview.summary}</Text>
              </View>

              {/* Changes */}
              {preview.changes_since_last.total_changes > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Changes Since Last Report</Text>
                  {preview.changes_since_last.new_tasks > 0 && (
                    <View style={styles.changeRow}>
                      <Ionicons name="add-circle-outline" size={16} color="#16A34A" />
                      <Text style={styles.changeText}>
                        {preview.changes_since_last.new_tasks} new task{preview.changes_since_last.new_tasks !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                  {preview.changes_since_last.status_changes.map((sc, i) => (
                    <View key={i} style={styles.changeRow}>
                      <Ionicons name="swap-horizontal-outline" size={16} color="#F59E0B" />
                      <Text style={styles.changeText} numberOfLines={2}>
                        {sc.title}: {friendlyStatus(sc.old_status)} → {friendlyStatus(sc.new_status)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Task breakdown */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Current Tasks</Text>
                {preview.current_snapshot.map((task) => (
                  <View key={task.report_id} style={styles.taskRow}>
                    <View style={[styles.taskDot, { backgroundColor: statusColor(task.status) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <Text style={styles.taskMeta}>
                        {friendlyStatus(task.status)}
                        {task.department_name ? ` · ${task.department_name}` : ""}
                        {task.officer_name ? ` · ${task.officer_name}` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Publish button */}
              <Pressable
                style={[styles.publishBtn, publishMutation.isPending && styles.publishBtnDisabled]}
                onPress={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
                    <Text style={styles.publishBtnText}>Publish Report</Text>
                  </>
                )}
              </Pressable>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
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

  content: { padding: 16, paddingBottom: 40 },

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

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },

  overviewGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  overviewItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    lineHeight: 18,
  },

  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.red2,
  },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 15,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginTop: 8,
    marginBottom: 10,
  },

  historyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyDate: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  autoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  historySummary: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  historyMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
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
  modalTitle: { fontSize: 18, fontWeight: "900", color: colors.text },
  modalContent: { padding: 16, paddingBottom: 40 },

  summaryText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },

  changeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  changeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },

  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  taskMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
