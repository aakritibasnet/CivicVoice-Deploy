import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { useOfficerRouteAccess } from "@/components/ui/auth/OfficerRouteGuard";
import { getOfficerReportDetail, addReportComment, type ReportComment } from "@/api/officerApi";

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getOfficerTag(c: ReportComment) {
  if (c.public_tag) return c.public_tag;
  if (c.author_role === "officer" && c.author_ward_name) {
    return `${c.author_ward_name} Officer`;
  }
  if (c.author_role === "officer") return "Officer";
  if (c.author_role === "supervisor") return "Supervisor";
  if (c.author_role === "administrator") return "Administrator";
  return null;
}

export default function OfficerReportDetailScreen() {
  const { loading: authLoading, isAllowed } = useOfficerRouteAccess();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const query = useQuery({
    queryKey: ["officerReportDetail", reportId],
    queryFn: () => getOfficerReportDetail(reportId),
    enabled: !!reportId && isAllowed,
  });

  const report = query.data?.report;
  const comments = query.data?.comments ?? [];

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    try {
      setSubmitting(true);
      await addReportComment(reportId, comment.trim());
      setComment("");
      query.refetch();
      showToast({
        type: "success",
        title: "Comment posted",
        message: "Your officer comment was added.",
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

  if (authLoading || query.isLoading || !isAllowed) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="newspaper-outline" size={56} color={colors.border} />
        <Text style={styles.emptyTitle}>Report not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerBarTitle}>Report Detail</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Report Title */}
        <Text style={styles.reportTitle}>{report.title}</Text>

        {/* Status */}
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {report.status?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(report.submitted_at || report.created_at).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            })}
          </Text>
        </View>

        {/* Description */}
        {report.description && (
          <Text style={styles.description}>{report.description}</Text>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Category</Text>
            <Text style={styles.infoValue}>{report.category}</Text>
          </View>
          {report.ward_name && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Ward</Text>
              <Text style={styles.infoValue}>{report.ward_name}</Text>
            </View>
          )}
          {report.address_text && (
            <View style={styles.infoRow}>
              <Ionicons name="map-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{report.address_text}</Text>
            </View>
          )}
          {(report as any).reporter_name && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Reporter</Text>
              <Text style={styles.infoValue}>{(report as any).reporter_name}</Text>
            </View>
          )}
        </View>

        {/* Photos */}
        {report.photo_urls && report.photo_urls.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {report.photo_urls.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photo} />
              ))}
            </ScrollView>
          </View>
        )}

        {report.media_url && (!report.photo_urls || report.photo_urls.length === 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Media</Text>
            <Image source={{ uri: report.media_url }} style={styles.photo} />
          </View>
        )}

        {/* Comments Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comments ({comments.length})</Text>
          {comments.map((c) => {
            const tag = getOfficerTag(c);
            return (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{tag || c.author_name || "User"}</Text>
                  {tag && (
                    <View style={styles.officerTag}>
                      <Ionicons name="shield-checkmark" size={10} color={colors.red2} />
                      <Text style={styles.officerTagText}>Official</Text>
                    </View>
                  )}
                  <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                </View>
                <Text style={styles.commentContent}>{c.content}</Text>
              </View>
            );
          })}

          {/* Add Comment */}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment as officer..."
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
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
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

  reportTitle: { fontSize: 22, fontWeight: "900", color: colors.text, marginBottom: 8 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.red2 + "14",
  },
  statusText: { fontSize: 12, fontWeight: "800", color: colors.red2 },
  dateText: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },

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
  infoLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, width: 75 },
  infoValue: { fontSize: 13, fontWeight: "700", color: colors.text, flex: 1 },

  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: colors.text, marginBottom: 12 },

  photo: {
    width: 160,
    height: 120,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: colors.border,
  },

  commentRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
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
});
