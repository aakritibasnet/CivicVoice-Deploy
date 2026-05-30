import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addComment,
  getComments,
  getReportDetail,
  getReportChangelog,
  toggleBookmark,
  toggleUpvote,
  type ChangelogEvent,
} from "@/api/reports";
import { toggleFollow } from "@/api/followers";
import { getAccessToken } from "@/lib/session";
import { colors } from "@/theme/colors";
import { getCategoryMarkerConfig } from "@/components/explore/CustomMarker";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFriendlyErrorMessage } from "@/lib/feedback";

// ✅ Fixed type to match backend
type ReportDetail = {
  id: string; // ✅ Changed from report_id: number
  title?: string | null;
  description?: string | null;
  category?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  address_text?: string | null; // ✅ Changed from address
  upvote_count?: number | null;
  comment_count?: number | null;
  status?: string | null;
  created_at: string;
  reporter_name?: string | null;
  is_anonymous?: boolean;
  user_upvoted?: boolean;
  user_bookmarked?: boolean;
  user_following?: boolean;
};

type CommentItem = {
  id: string; // ✅ Changed from number
  content: string;
  created_at: string;
  commenter_name?: string | null;
  is_anonymous?: boolean;
};

function timeAgo(dateString: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );
  if (seconds < 30) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function statusLabel(status?: string | null) {
  if (!status) return "";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ─── Changelog helpers ────────────────────────────────────────────────────────

function fmtStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusChipColor(s: string) {
  switch (s) {
    case "incoming":    return "#3B82F6";
    case "in_progress": return "#F59E0B";
    case "completed":   return "#16A34A";
    case "returned":    return "#EA580C";
    case "invalid":     return "#DC2626";
    default:            return colors.textMuted;
  }
}

type EventConfig = {
  icon: string;
  color: string;
  label: (evt: ChangelogEvent) => string;
};

function changelogEventConfig(type: string): EventConfig {
  switch (type) {
    case "submitted":
      return { icon: "enter-outline", color: "#3B82F6", label: () => "Report submitted" };
    case "status_change":
      return { icon: "swap-horizontal-outline", color: "#F59E0B", label: () => "Status updated" };
    case "proof_uploaded":
      return { icon: "camera-outline", color: "#16A34A", label: () => "Proof uploaded" };
    case "comment_added":
      return { icon: "chatbubble-outline", color: "#6B7280", label: () => "Officer note added" };
    case "escalated":
      return { icon: "arrow-up-circle-outline", color: "#7C3AED", label: () => "Escalated to municipality" };
    case "returned_to_ward":
      return { icon: "refresh-circle-outline", color: "#EA580C", label: () => "Returned to ward" };
    default:
      return { icon: "ellipse-outline", color: colors.textMuted, label: (e) => e.event_type.replace(/_/g, " ") };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();

  // ✅ Keep as string (UUID)
  const reportId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw || ""; // ✅ Return string, not Number(raw)
  }, [params.id]);

  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { showToast } = useToast();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getAccessToken().then((token) => {
        if (!active) return;
        setIsLoggedIn(Boolean(token));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const reportQuery = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => getReportDetail(reportId),
    enabled: Boolean(reportId), // ✅ Check if string exists
  });

  const commentsQuery = useQuery({
    queryKey: ["comments", reportId],
    queryFn: () => getComments(reportId),
    enabled: Boolean(reportId),
  });

  const changelogQuery = useQuery({
    queryKey: ["changelog", reportId],
    queryFn: () => getReportChangelog(reportId),
    enabled: Boolean(reportId),
  });

  const report: ReportDetail | undefined = reportQuery.data;
  const comments: CommentItem[] = commentsQuery.data?.comments || [];
  const changelog: ChangelogEvent[] = changelogQuery.data ?? [];
  const loadError = reportQuery.error || commentsQuery.error;

  useEffect(() => {
    if (!loadError) {
      return;
    }

    showToast({
      type: "error",
      title: "Couldn't load report",
      message: getFriendlyErrorMessage(
        loadError,
        "Something went wrong. Please try again.",
      ),
    });
  }, [loadError, showToast]);

  const upvoteMutation = useMutation({
    mutationFn: () => toggleUpvote(reportId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["report", reportId] });
      const previous = queryClient.getQueryData<ReportDetail>([
        "report",
        reportId,
      ]);

      if (previous) {
        const hadUpvoted = Boolean(previous.user_upvoted);
        const currentCount = previous.upvote_count ?? 0;

        queryClient.setQueryData<ReportDetail>(["report", reportId], {
          ...previous,
          user_upvoted: !hadUpvoted,
          upvote_count: Math.max(0, currentCount + (hadUpvoted ? -1 : 1)),
        });
      }

      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["report", reportId], context.previous);
      }
      showToast({
        type: "error",
        title: "Couldn't update upvote",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["report", reportId] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => toggleBookmark(reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report", reportId] });
    },
    onError: (error) => {
      showToast({
        type: "error",
        title: "Couldn't update bookmark",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    },
  });

  const followMutation = useMutation({
    mutationFn: () => toggleFollow(reportId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["report", reportId] });
      const previous = queryClient.getQueryData<ReportDetail>(["report", reportId]);
      if (previous) {
        queryClient.setQueryData<ReportDetail>(["report", reportId], {
          ...previous,
          user_following: !previous.user_following,
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["report", reportId], context.previous);
      }
      showToast({
        type: "error",
        title: "Couldn't update follow",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["report", reportId] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => addComment(reportId, content),
    onSuccess: () => {
      setCommentText("");
      void queryClient.invalidateQueries({ queryKey: ["comments", reportId] });
      void queryClient.invalidateQueries({ queryKey: ["report", reportId] });
      showToast({
        type: "success",
        title: "Comment posted",
        message: "Your comment was added.",
      });
    },
    onError: (error: any) => {
      showToast({
        type: "error",
        title: "Couldn't add comment",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    },
  });

  const askLogin = () => {
    Alert.alert(
      "Login Required",
      "Please log in to interact with this report.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Login", onPress: () => router.push("/(auth)/login") },
      ],
    );
  };

  const handleUpvote = () => {
    if (!isLoggedIn) {
      askLogin();
      return;
    }
    upvoteMutation.mutate();
  };

  const handleBookmark = () => {
    if (!isLoggedIn) {
      askLogin();
      return;
    }
    bookmarkMutation.mutate();
  };

  const handleFollow = () => {
    if (!isLoggedIn) {
      askLogin();
      return;
    }
    followMutation.mutate();
  };

  const handleComment = () => {
    if (!isLoggedIn) {
      askLogin();
      return;
    }

    const trimmed = commentText.trim();
    if (!trimmed) return;

    commentMutation.mutate(trimmed);
  };

  // ✅ Validate UUID string
  if (!reportId || typeof reportId !== "string" || reportId.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Invalid report ID.</Text>
      </View>
    );
  }

  const categoryConfig = getCategoryMarkerConfig(report?.category);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle}>Report Details</Text>

        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Pressable onPress={handleFollow} hitSlop={10}>
            <Ionicons
              name={report?.user_following ? "notifications" : "notifications-outline"}
              size={20}
              color={report?.user_following ? "#3B82F6" : colors.text}
            />
          </Pressable>
          <Pressable onPress={handleBookmark} hitSlop={10}>
            <Ionicons
              name={report?.user_bookmarked ? "bookmark" : "bookmark-outline"}
              size={22}
              color={report?.user_bookmarked ? colors.red2 : colors.text}
            />
          </Pressable>
        </View>
      </View>

      {(reportQuery.isLoading || commentsQuery.isLoading) && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      )}

      {!reportQuery.isLoading && !report && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Report not found.</Text>
        </View>
      )}

      {!!report && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!!report.media_url && (
            <Image
              source={{ uri: report.media_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          )}

          <View style={styles.card}>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: `${categoryConfig.color}22` },
              ]}
            >
              <Text
                style={[styles.categoryText, { color: categoryConfig.color }]}
              >
                {report.category || "General"}
              </Text>
            </View>

            <Text style={styles.title}>
              {report.title || "Untitled Report"}
            </Text>

            {!!report.description && (
              <Text style={styles.description}>{report.description}</Text>
            )}

            <Text style={styles.reporterText}>
              {report.is_anonymous
                ? "Anonymous reporter"
                : report.reporter_name || "Community member"}
            </Text>

            <View style={styles.statsRow}>
              <Pressable style={styles.statAction} onPress={handleUpvote}>
                <Ionicons
                  name={
                    report.user_upvoted
                      ? "arrow-up-circle"
                      : "arrow-up-circle-outline"
                  }
                  size={18}
                  color={report.user_upvoted ? colors.red2 : colors.textMuted}
                />
                <Text style={styles.statValue}>{report.upvote_count ?? 0}</Text>
              </Pressable>

              <View style={styles.statItem}>
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={colors.textMuted}
                />
                <Text style={styles.statValue}>
                  {report.comment_count ?? 0}
                </Text>
              </View>

              <Text style={styles.timeText}>{timeAgo(report.created_at)}</Text>
            </View>

            {!!report.status && (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>
                  {statusLabel(report.status)}
                </Text>
              </View>
            )}
          </View>

          {Number.isFinite(Number(report.location_lat)) &&
            Number.isFinite(Number(report.location_lng)) && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Location</Text>
                <MapView
                  style={styles.locationMap}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  initialRegion={{
                    latitude: Number(report.location_lat),
                    longitude: Number(report.location_lng),
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: Number(report.location_lat),
                      longitude: Number(report.location_lng),
                    }}
                  />
                </MapView>

                {/* ✅ Fixed field name */}
                {!!report.address_text && (
                  <Text style={styles.address}>{report.address_text}</Text>
                )}
              </View>
            )}

          {changelog.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Activity</Text>
              {changelog.map((evt, idx) => {
                const isLast = idx === changelog.length - 1;
                const cfg = changelogEventConfig(evt.event_type);
                return (
                  <View key={evt.id} style={styles.timelineRow}>
                    {/* Left column: dot + connecting line */}
                    <View style={styles.timelineLeft}>
                      <View style={[styles.timelineDot, { backgroundColor: cfg.color }]}>
                        <Ionicons name={cfg.icon as any} size={12} color="#fff" />
                      </View>
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>

                    {/* Right column: content */}
                    <View style={[styles.timelineContent, !isLast && styles.timelineContentSpaced]}>
                      <Text style={styles.timelineEventLabel}>{cfg.label(evt)}</Text>
                      {(evt.from_status || evt.to_status) && (
                        <View style={styles.timelineStatusRow}>
                          {evt.from_status ? (
                            <View style={[styles.timelineStatusChip, { backgroundColor: statusChipColor(evt.from_status) + "22" }]}>
                              <Text style={[styles.timelineStatusChipText, { color: statusChipColor(evt.from_status) }]}>
                                {fmtStatus(evt.from_status)}
                              </Text>
                            </View>
                          ) : null}
                          {evt.from_status && evt.to_status ? (
                            <Ionicons name="arrow-forward" size={11} color={colors.textMuted} style={{ marginHorizontal: 3 }} />
                          ) : null}
                          {evt.to_status ? (
                            <View style={[styles.timelineStatusChip, { backgroundColor: statusChipColor(evt.to_status) + "22" }]}>
                              <Text style={[styles.timelineStatusChipText, { color: statusChipColor(evt.to_status) }]}>
                                {fmtStatus(evt.to_status)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                      {evt.actor_name ? (
                        <Text style={styles.timelineActor}>by {evt.actor_name}</Text>
                      ) : null}
                      {evt.note ? (
                        <Text style={styles.timelineNote}>"{evt.note}"</Text>
                      ) : null}
                      <Text style={styles.timelineTime}>{timeAgo(evt.timestamp)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.card, styles.commentsSection]}>
            <Text style={styles.sectionTitle}>
              Comments ({report.comment_count ?? comments.length})
            </Text>

            <View style={styles.commentInputRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={
                  isLoggedIn ? "Add a comment..." : "Login to comment"
                }
                style={styles.commentInput}
                editable={isLoggedIn}
                multiline
              />
              <Pressable
                onPress={handleComment}
                disabled={
                  !isLoggedIn ||
                  !commentText.trim() ||
                  commentMutation.isPending
                }
                style={[
                  styles.sendBtn,
                  (!isLoggedIn ||
                    !commentText.trim() ||
                    commentMutation.isPending) &&
                    styles.sendBtnDisabled,
                ]}
              >
                <Ionicons name="send" size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            {comments.map((comment) => (
              <View key={comment.id} style={styles.commentCard}>
                <Text style={styles.commentAuthor}>
                  {comment.is_anonymous
                    ? "Anonymous"
                    : comment.commenter_name || "Community member"}
                </Text>
                <Text style={styles.commentText}>{comment.content}</Text>
                <Text style={styles.commentTime}>
                  {timeAgo(comment.created_at)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 62 : 46,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  loaderWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: colors.danger,
    fontWeight: "700",
  },
  heroImage: {
    width: "100%",
    height: 300,
    backgroundColor: "#E5E7EB",
  },
  card: {
    marginTop: 10,
    marginHorizontal: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
  },
  description: {
    color: colors.text,
    lineHeight: 20,
  },
  reporterText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  timeText: {
    marginLeft: "auto",
    color: colors.textMuted,
    fontSize: 12,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  locationMap: {
    width: "100%",
    height: 170,
    borderRadius: 10,
  },
  address: {
    color: colors.textMuted,
    fontSize: 13,
  },
  commentsSection: {
    marginBottom: 10,
  },
  commentInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.red2,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  // ── Timeline
  timelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineLeft: {
    alignItems: "center",
    width: 24,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 4,
  },
  timelineContentSpaced: {
    paddingBottom: 20,
  },
  timelineEventLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  timelineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 4,
  },
  timelineStatusChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timelineStatusChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  timelineActor: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },
  timelineNote: {
    fontSize: 12,
    color: colors.text,
    fontStyle: "italic",
    marginTop: 3,
    lineHeight: 17,
  },
  timelineTime: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },

  commentCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 4,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  commentText: {
    color: colors.text,
    lineHeight: 19,
  },
  commentTime: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
