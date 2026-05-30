import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/theme/colors";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { useOfficerRouteAccess } from "@/components/ui/auth/OfficerRouteGuard";
import {
  getOfficerTaskDetail,
  updateTaskStatus,
  uploadTaskProof,
  addTaskComment,
} from "@/api/officerApi";

// ─── Helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  todo: "#6B7280",
  in_progress: "#F59E0B",
  completed: "#16A34A",
  invalid: "#DC2626",
};

// Accepted range: matches the backend priority_level enum.
const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function friendlyStatus(s: string) {
  return { todo: "Todo", in_progress: "In Progress", completed: "Completed", invalid: "Invalid" }[s] || s;
}

function friendlyPriority(priority?: string | null) {
  if (!priority) return "Medium";
  return PRIORITY_LABELS[priority] ?? priority;
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

// ─── Proof Upload Section ──────────────────────────────────────────────

function ProofUploadSection({
  taskId,
  proofType = "completion",
  onUploaded,
  showToast,
}: {
  taskId: string;
  proofType?: "completion" | "invalidation";
  onUploaded: () => void;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");

  const isInvalidation = proofType === "invalidation";
  const title = isInvalidation ? "Invalidation Proof" : "Upload Proof";
  const placeholder = "Describe the proof (required)...";

  const pickImage = async (source: "camera" | "gallery") => {
    if (!note.trim()) {
      showToast({
        type: "error",
        title: "Description required",
        message: "Please describe the proof before uploading it.",
      });
      return;
    }

    let result;
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showToast({
          type: "info",
          title: "Permission needed",
          message: "Camera access is required to take proof photos.",
        });
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
    }

    if (result.canceled || !result.assets?.[0]) return;

    try {
      setUploading(true);
      await uploadTaskProof(taskId, result.assets[0].uri, proofType, note.trim());
      setNote("");
      showToast({
        type: "success",
        title: "Proof uploaded",
        message: "Your proof image was uploaded successfully.",
      });
      onUploaded();
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Upload failed",
        message: err.message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.section, isInvalidation && { borderColor: "#DC262640" }]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {isInvalidation && (
        <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "700", marginBottom: 8 }}>
          Upload proof and describe why this task is invalid (e.g., duplicate report, cannot be resolved).
        </Text>
      )}
      <TextInput
        style={styles.noteInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <View style={styles.proofBtnRow}>
        <Pressable
          style={[styles.proofBtn, isInvalidation && { backgroundColor: "#DC2626" }, uploading && { opacity: 0.5 }]}
          onPress={() => pickImage("camera")}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="camera" size={20} color={colors.white} />
              <Text style={styles.proofBtnText}>Camera</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.proofBtn, styles.proofBtnSecondary, uploading && { opacity: 0.5 }]}
          onPress={() => pickImage("gallery")}
          disabled={uploading}
        >
          <Ionicons name="images" size={20} color={colors.red2} />
          <Text style={[styles.proofBtnText, { color: colors.red2 }]}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────

export default function OfficerTaskDetailScreen() {
  const { loading: authLoading, isAllowed } = useOfficerRouteAccess();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const taskId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showInvalidSection, setShowInvalidSection] = useState(false);
  const { showToast } = useToast();

  const detailQuery = useQuery({
    queryKey: ["officerTaskDetail", taskId],
    queryFn: () => getOfficerTaskDetail(taskId),
    enabled: !!taskId && isAllowed,
  });

  const task = detailQuery.data?.task;
  const activity = detailQuery.data?.activity ?? [];
  const comments = detailQuery.data?.comments ?? [];
  const proof = detailQuery.data?.proof ?? [];

  const onRefresh = useCallback(() => {
    detailQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ["officerTasks"] });
  }, [detailQuery, queryClient]);

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;

    if (newStatus === "completed" && proof.filter(p => p.type === "completion").length === 0) {
      showToast({
        type: "error",
        title: "Proof required",
        message:
          "Upload at least one proof image before completing this task.",
      });
      return;
    }

    if (newStatus === "invalid" && proof.filter(p => p.type === "invalidation").length === 0) {
      showToast({
        type: "error",
        title: "Invalidation proof required",
        message:
          "Upload an invalidation proof image with a description before marking this task invalid.",
      });
      return;
    }

    const confirmMsg =
      newStatus === "in_progress"
        ? "Start working on this task?"
        : newStatus === "invalid"
        ? "Mark this task as invalid? This cannot be undone."
        : "Mark this task as completed?";

    Alert.alert("Confirm", confirmMsg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          try {
            setSubmitting(true);
            await updateTaskStatus(taskId, newStatus);
            showToast({
              type: "success",
              title: "Task updated",
              message: `Task moved to ${friendlyStatus(newStatus)}.`,
            });
            onRefresh();
          } catch (err: any) {
            showToast({
              type: "error",
              title: "Couldn't update task",
              message: err.message,
            });
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    try {
      setSubmitting(true);
      await addTaskComment(taskId, comment.trim());
      setComment("");
      onRefresh();
      showToast({
        type: "success",
        title: "Comment posted",
        message: "Your task comment was added.",
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Couldn't add comment",
        message: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (authLoading || detailQuery.isLoading || !isAllowed) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="clipboard-outline" size={56} color={colors.border} />
        <Text style={styles.emptyTitle}>Task not found</Text>
      </View>
    );
  }

  const isCompleted = task.status === "completed";
  const isInvalid = task.status === "invalid";
  const isFinalStatus = isCompleted || isInvalid;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerBarTitle} numberOfLines={1}>Task Detail</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[task.status] + "18" }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[task.status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[task.status] }]}>
              {friendlyStatus(task.status)}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.taskTitle}>{task.title}</Text>

        {/* Description */}
        {task.description && (
          <Text style={styles.description}>{task.description}</Text>
        )}

        {/* Info Grid */}
        <View style={styles.infoCard}>
          {task.category && (
            <InfoRow icon="pricetag-outline" label="Category" value={task.category} />
          )}
          <InfoRow icon="flag-outline" label="Priority" value={friendlyPriority(task.priority)} />
          {task.ward_name && (
            <InfoRow icon="location-outline" label="Ward" value={task.ward_name} />
          )}
          {task.location_text && (
            <InfoRow icon="map-outline" label="Location" value={task.location_text} />
          )}
          {task.department_name && (
            <InfoRow icon="business-outline" label="Department" value={task.department_name} />
          )}
          {task.officer_name && (
            <InfoRow icon="person-outline" label="Assigned To" value={task.officer_name} />
          )}
          <InfoRow
            icon="calendar-outline"
            label="Assigned"
            value={new Date(task.assigned_at).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            })}
          />
          {task.started_at && (
            <InfoRow
              icon="play-outline"
              label="Started"
              value={new Date(task.started_at).toLocaleDateString(undefined, {
                year: "numeric", month: "short", day: "numeric",
              })}
            />
          )}
          {task.completed_at && (
            <InfoRow
              icon="checkmark-outline"
              label="Completed"
              value={new Date(task.completed_at).toLocaleDateString(undefined, {
                year: "numeric", month: "short", day: "numeric",
              })}
            />
          )}
          {task.escalated_from && (
            <InfoRow icon="arrow-up-outline" label="Escalated" value="Yes" />
          )}
        </View>

        {/* Map / Navigate — only when the task carries map coordinates */}
        {Number.isFinite(Number(task.location_lat)) &&
          Number.isFinite(Number(task.location_lng)) && (
            <Pressable
              style={styles.mapCard}
              onPress={() =>
                router.push({
                  pathname: "/task-map",
                  params: {
                    lat: String(task.location_lat),
                    lng: String(task.location_lng),
                    title: task.title,
                    address: task.location_text ?? "",
                  },
                })
              }
            >
              <View style={styles.mapIcon}>
                <Ionicons name="map" size={20} color={colors.red2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mapLabel}>View on Map</Text>
                <Text style={styles.mapSub} numberOfLines={1}>
                  See this location and get directions
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}

        {/* Linked Report */}
        {task.report_title && (
          <Pressable
            style={styles.linkedReportCard}
            onPress={() => task.linked_report_id && router.push(`/officer-report/${task.linked_report_id}` as any)}
          >
            <View style={styles.linkedIcon}>
              <Ionicons name="document-text-outline" size={20} color={colors.red2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkedLabel}>Linked Report</Text>
              <Text style={styles.linkedTitle} numberOfLines={2}>{task.report_title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        {/* Report Images */}
        {task.report_photo_urls && task.report_photo_urls.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Report Images</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.report_photo_urls.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.reportImage} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Proof Images */}
        {proof.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Proof ({proof.length} {proof.length === 1 ? "image" : "images"})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {proof.map((p) => (
                <View key={p.id} style={styles.proofItem}>
                  <Image source={{ uri: p.image_url }} style={styles.proofImage} />
                  {p.note && <Text style={styles.proofNote} numberOfLines={1}>{p.note}</Text>}
                  <Text style={styles.proofTime}>{timeAgo(p.created_at)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Upload Completion Proof (only when in_progress and NOT showing invalid section) */}
        {task.status === "in_progress" && !showInvalidSection && (
          <ProofUploadSection
            taskId={taskId}
            onUploaded={onRefresh}
            showToast={showToast}
          />
        )}

        {/* Invalidation Proof Section (shown when officer clicks Mark as Invalid) */}
        {!isFinalStatus && showInvalidSection && (
          <ProofUploadSection
            taskId={taskId}
            proofType="invalidation"
            onUploaded={onRefresh}
            showToast={showToast}
          />
        )}

        {/* Activity Timeline */}
        {activity.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Timeline</Text>
            {activity.map((a) => (
              <View key={a.id} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityText}>
                    <Text style={styles.activityActor}>{a.actor_name || "System"}</Text>
                    {" "}
                    {a.action === "status_change"
                      ? `changed status from ${friendlyStatus(a.from_status || "")} to ${friendlyStatus(a.to_status || "")}`
                      : a.action === "proof_uploaded"
                      ? "uploaded proof"
                      : a.action === "comment_added"
                      ? "added a comment"
                      : a.action}
                  </Text>
                  {a.note && <Text style={styles.activityNote}>{a.note}</Text>}
                </View>
                <Text style={styles.activityTime}>{timeAgo(a.created_at)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Comments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Comments ({comments.length})
          </Text>
          {comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>
                  {c.public_tag || c.author_name || "Unknown"}
                </Text>
                {c.public_tag && (
                  <View style={styles.officerTag}>
                    <Ionicons name="shield-checkmark" size={10} color={colors.red2} />
                    <Text style={styles.officerTagText}>Official</Text>
                  </View>
                )}
                <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              </View>
              <Text style={styles.commentContent}>{c.content}</Text>
            </View>
          ))}

          {/* Add Comment */}
          {!isFinalStatus && (
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                placeholderTextColor={colors.textMuted}
                value={comment}
                onChangeText={setComment}
                multiline
              />
              <Pressable
                style={[styles.sendBtn, !comment.trim() && { opacity: 0.4 }]}
                onPress={handleAddComment}
                disabled={!comment.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {!isFinalStatus && (
          <View style={styles.actionSection}>
            {showInvalidSection ? (
              <>
                {/* Invalidation mode: confirm or cancel */}
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}
                  onPress={() => handleStatusChange("invalid")}
                  disabled={submitting}
                >
                  <Ionicons name="close-circle" size={20} color={colors.white} />
                  <Text style={styles.actionBtnText}>Confirm Invalid</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnOutline, { marginTop: 10 }]}
                  onPress={() => setShowInvalidSection(false)}
                >
                  <Ionicons name="arrow-back" size={18} color={colors.textMuted} />
                  <Text style={[styles.actionBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Normal mode */}
                {task.status === "todo" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]}
                    onPress={() => handleStatusChange("in_progress")}
                    disabled={submitting}
                  >
                    <Ionicons name="play" size={20} color={colors.white} />
                    <Text style={styles.actionBtnText}>Start Task</Text>
                  </Pressable>
                )}
                {task.status === "in_progress" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#16A34A" }]}
                    onPress={() => handleStatusChange("completed")}
                    disabled={submitting}
                  >
                    <Ionicons name="checkmark-done" size={20} color={colors.white} />
                    <Text style={styles.actionBtnText}>Mark as Completed</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: "#DC2626", marginTop: 10 }]}
                  onPress={() => setShowInvalidSection(true)}
                  disabled={submitting}
                >
                  <Ionicons name="close-circle" size={20} color={colors.white} />
                  <Text style={styles.actionBtnText}>Mark as Invalid</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Info Row Component ────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerContent: { alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 12 },

  headerBar: {
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
  headerBarTitle: { fontSize: 17, fontWeight: "900", color: colors.text },

  content: { padding: 16 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "800" },

  taskTitle: { fontSize: 22, fontWeight: "900", color: colors.text, marginBottom: 8 },
  description: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 16 },

  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, width: 85 },
  infoValue: { fontSize: 13, fontWeight: "700", color: colors.text, flex: 1 },

  linkedReportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.red2 + "30",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  linkedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  linkedLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  linkedTitle: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 2 },

  mapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  mapIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  mapLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  mapSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: colors.text, marginBottom: 12 },

  reportImage: {
    width: 140,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: colors.border,
  },

  proofItem: { marginRight: 12 },
  proofImage: {
    width: 120,
    height: 90,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  proofNote: { fontSize: 11, color: colors.text, fontWeight: "600", marginTop: 4, width: 120 },
  proofTime: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

  noteInput: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proofBtnRow: { flexDirection: "row", gap: 10 },
  proofBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.red2,
    borderRadius: 12,
    paddingVertical: 14,
  },
  proofBtnSecondary: {
    backgroundColor: colors.red2 + "12",
  },
  proofBtnText: { fontSize: 14, fontWeight: "800", color: colors.white },

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
    marginTop: 6,
  },
  activityText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  activityActor: { fontWeight: "800" },
  activityNote: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 2 },
  activityTime: { fontSize: 11, color: colors.textMuted, minWidth: 50, textAlign: "right" },

  commentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  commentAuthor: { fontSize: 13, fontWeight: "800", color: colors.text },
  officerTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.red2 + "14",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  officerTagText: { fontSize: 9, fontWeight: "800", color: colors.red2 },
  commentTime: { fontSize: 11, color: colors.textMuted, marginLeft: "auto" },
  commentContent: { fontSize: 13, color: colors.text, lineHeight: 18 },

  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },

  actionSection: { marginBottom: 16 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  actionBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: { fontSize: 16, fontWeight: "900", color: colors.white },
});
