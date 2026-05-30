import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { colors } from "@/theme/colors";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import { getAccessToken } from "@/lib/session";
import {
  getReportPostDetail,
  getReportPostComments,
  addReportPostComment,
  rateReportPost,
  toggleReportPostBookmark,
  type ReportPost,
  type PostComment,
} from "@/api/reportPosts";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDaysToComplete(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  if (hrs < 1) return "< 1 hour";
  if (hrs < 24) return `${hrs} hours`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""}`;
}

// ─── Star Rating ───

function StarRating({
  value,
  average,
  count,
  onRate,
  size = 24,
}: {
  value: number | null;
  average: number;
  count: number;
  onRate: (n: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onRate(n)} hitSlop={6}>
          <Ionicons
            name={
              value
                ? n <= value
                  ? "star"
                  : "star-outline"
                : n <= Math.round(average)
                  ? "star"
                  : "star-outline"
            }
            size={size}
            color={value ? "#F59E0B" : n <= Math.round(average) ? "#F59E0B" : colors.border}
          />
        </Pressable>
      ))}
      <Text style={styles.ratingLabel}>
        {average > 0 ? average.toFixed(1) : "—"} ({count} rating{count !== 1 ? "s" : ""})
      </Text>
    </View>
  );
}

// ─── Fullscreen Image Viewer ───

function FullscreenImage({
  uri,
  label,
  visible,
  onClose,
}: {
  uri: string;
  label: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullscreenOverlay}>
        <Pressable style={styles.fullscreenClose} onPress={onClose}>
          <Ionicons name="close" size={28} color={colors.white} />
        </Pressable>
        <Text style={styles.fullscreenLabel}>{label}</Text>
        <Image
          source={{ uri }}
          style={styles.fullscreenImage}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}

// ─── Comment Item ───

function CommentItem({ comment }: { comment: PostComment }) {
  const canNavigate = !!comment.user_id;

  const handlePress = () => {
    if (canNavigate) {
      router.push({ pathname: "/user/[id]", params: { id: comment.user_id! } });
    }
  };

  return (
    <View style={styles.commentItem}>
      <Pressable onPress={handlePress} disabled={!canNavigate}>
        <View style={styles.commentAvatar}>
          {comment.user_profile_image ? (
            <Image
              source={{ uri: comment.user_profile_image }}
              style={styles.commentAvatarImage}
            />
          ) : (
            <Ionicons name="person" size={16} color={colors.textMuted} />
          )}
        </View>
      </Pressable>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Pressable onPress={handlePress} disabled={!canNavigate}>
            <Text style={[styles.commentName, canNavigate && { color: colors.red2 }]}>
              {comment.user_name || comment.anonymous_name}
            </Text>
          </Pressable>
          <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={styles.commentText}>{comment.content}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ───

export default function ReportPostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [post, setPost] = useState<ReportPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  const [fullscreenLabel, setFullscreenLabel] = useState("");
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      setIsLoggedIn(Boolean(token));

      const [postData, commentsData] = await Promise.all([
        getReportPostDetail(id!),
        getReportPostComments(id!),
      ]);
      setPost(postData);
      setComments(commentsData);
    } catch (e: any) {
      debugWarn("Failed to load report post detail", e?.message ?? e);
      showToast({
        type: "error",
        title: "Couldn't load post",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const askLogin = () => {
    Alert.alert("Login Required", "Please log in to interact.", [
      { text: "Cancel", style: "cancel" },
      { text: "Login", onPress: () => router.push("/(auth)/login") },
    ]);
  };

  const handleRate = async (rating: number) => {
    if (!isLoggedIn) return askLogin();
    if (!post) return;

    const prev = { ...post };
    const hadRating = post.viewer_rating != null;
    const newCount = hadRating ? post.rating_count : post.rating_count + 1;
    const newAvg = hadRating
      ? (post.rating_average * post.rating_count - (post.viewer_rating ?? 0) + rating) /
        Math.max(newCount, 1)
      : (post.rating_average * post.rating_count + rating) / newCount;

    setPost({ ...post, viewer_rating: rating, rating_average: newAvg, rating_count: newCount });

    try {
      await rateReportPost(post.id, rating);
    } catch (error) {
      setPost(prev);
      showToast({
        type: "error",
        title: "Couldn't save rating",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    }
  };

  const handleBookmark = async () => {
    if (!isLoggedIn) return askLogin();
    if (!post) return;

    const prev = { ...post };
    setPost({
      ...post,
      is_bookmarked: !post.is_bookmarked,
      bookmark_count: post.bookmark_count + (post.is_bookmarked ? -1 : 1),
    });

    try {
      await toggleReportPostBookmark(post.id);
    } catch (error) {
      setPost(prev);
      showToast({
        type: "error",
        title: "Couldn't update bookmark",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    }
  };

  const handleSubmitComment = async () => {
    if (!isLoggedIn) return askLogin();
    const text = newComment.trim();
    if (!text || !post) return;

    setSubmitting(true);
    try {
      const comment = await addReportPostComment(post.id, text);
      setComments((prev) => [...prev, comment]);
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
      setNewComment("");
      showToast({
        type: "success",
        title: "Comment posted",
        message: "Your comment was added successfully.",
      });
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Couldn't post comment",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
        <Text style={styles.errorText}>Post not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {post.title}
        </Text>
        <Pressable onPress={handleBookmark} hitSlop={10}>
          <Ionicons
            name={post.is_bookmarked ? "bookmark" : "bookmark-outline"}
            size={22}
            color={post.is_bookmarked ? colors.red2 : colors.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Before / After images */}
        {post.before_image_url ? (
          <View style={styles.imageSection}>
            <Pressable
              style={styles.imageHalf}
              onPress={() => {
                setFullscreenUri(post.before_image_url!);
                setFullscreenLabel("BEFORE");
              }}
            >
              <Image
                source={{ uri: post.before_image_url }}
                style={styles.detailImage}
                resizeMode="cover"
              />
              <View style={styles.imgLabel}>
                <Text style={styles.imgLabelText}>BEFORE</Text>
              </View>
              <View style={styles.expandIcon}>
                <Ionicons name="expand-outline" size={16} color={colors.white} />
              </View>
            </Pressable>

            <Pressable
              style={styles.imageHalf}
              onPress={() => {
                setFullscreenUri(post.after_image_url);
                setFullscreenLabel("AFTER");
              }}
            >
              <Image
                source={{ uri: post.after_image_url }}
                style={styles.detailImage}
                resizeMode="cover"
              />
              <View style={[styles.imgLabel, styles.imgLabelAfter]}>
                <Text style={styles.imgLabelText}>AFTER</Text>
              </View>
              <View style={styles.expandIcon}>
                <Ionicons name="expand-outline" size={16} color={colors.white} />
              </View>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setFullscreenUri(post.after_image_url);
              setFullscreenLabel("COMPLETION");
            }}
          >
            <Image
              source={{ uri: post.after_image_url }}
              style={styles.soloDetailImage}
              resizeMode="cover"
            />
            <View style={styles.expandIcon}>
              <Ionicons name="expand-outline" size={16} color={colors.white} />
            </View>
          </Pressable>
        )}

        {/* Post details */}
        <View style={styles.detailBody}>
          {/* Tags */}
          <View style={styles.tagsRow}>
            <View style={styles.tag}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.tagText}>{post.ward_name}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{post.category}</Text>
            </View>
            <View style={[styles.tag, styles.priorityTag]}>
              <Text style={styles.tagText}>{post.priority}</Text>
            </View>
          </View>

          <Text style={styles.postTitle}>{post.title}</Text>
          {post.description ? (
            <Text style={styles.postDesc}>{post.description}</Text>
          ) : null}

          {/* Timeline */}
          <View style={styles.timelineCard}>
            <View style={styles.timelineRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <View>
                <Text style={styles.timelineLabel}>Reported</Text>
                <Text style={styles.timelineValue}>{formatDate(post.created_at)}</Text>
              </View>
            </View>
            <View style={styles.timelineConnector} />
            <View style={styles.timelineRow}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <View>
                <Text style={styles.timelineLabel}>Completed</Text>
                <Text style={styles.timelineValue}>{formatDate(post.completed_at)}</Text>
              </View>
            </View>
            <Text style={styles.resolvedTime}>
              Resolved in {getDaysToComplete(post.created_at, post.completed_at)}
            </Text>
          </View>

          {/* Completed by */}
          <View style={styles.completedByCard}>
            <Ionicons name="person-circle-outline" size={32} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.completedByName}>{post.completed_by_name}</Text>
              {post.completed_by_role ? (
                <Text style={styles.completedByRole}>
                  {post.completed_by_role.replace(/_/g, " ")}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Rating */}
          <View style={styles.ratingCard}>
            <Text style={styles.sectionTitle}>Rate this completion</Text>
            <StarRating
              value={post.viewer_rating}
              average={post.rating_average}
              count={post.rating_count}
              onRate={handleRate}
              size={28}
            />
          </View>

          {/* Location map */}
          {post.location_lat != null && post.location_lng != null && (
            <View style={styles.mapSection}>
              <Text style={styles.sectionTitle}>Report Location</Text>
              {post.address_text ? (
                <View style={styles.mapAddressRow}>
                  <Ionicons name="location" size={14} color={colors.red2} />
                  <Text style={styles.mapAddressText} numberOfLines={2}>
                    {post.address_text}
                  </Text>
                </View>
              ) : null}
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  initialRegion={{
                    latitude: Number(post.location_lat),
                    longitude: Number(post.location_lng),
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: Number(post.location_lat),
                      longitude: Number(post.location_lng),
                    }}
                    pinColor={colors.red2}
                  />
                </MapView>
              </View>
            </View>
          )}

          {/* Comments section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>
              Comments ({post.comment_count})
            </Text>

            {comments.length === 0 ? (
              <Text style={styles.noComments}>
                No comments yet. Be the first to share your thoughts!
              </Text>
            ) : (
              comments.map((c) => <CommentItem key={c.id} comment={c} />)
            )}
          </View>
        </View>
      </ScrollView>

      {/* Comment input bar */}
      <View style={styles.commentInputBar}>
        <TextInput
          ref={inputRef}
          style={styles.commentInput}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          editable={!submitting}
        />
        <Pressable
          style={[
            styles.sendBtn,
            (!newComment.trim() || submitting) && styles.sendBtnDisabled,
          ]}
          onPress={handleSubmitComment}
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size={16} color={colors.white} />
          ) : (
            <Ionicons name="send" size={18} color={colors.white} />
          )}
        </Pressable>
      </View>

      {/* Fullscreen image viewer */}
      {fullscreenUri && (
        <FullscreenImage
          uri={fullscreenUri}
          label={fullscreenLabel}
          visible={!!fullscreenUri}
          onClose={() => setFullscreenUri(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 12,
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.red2,
  },
  backBtnText: { color: colors.white, fontWeight: "800" },

  // Header
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: Platform.select({ ios: 56, android: 46, default: 46 }),
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Images
  imageSection: {
    flexDirection: "row",
    height: 240,
  },
  imageHalf: {
    flex: 1,
    position: "relative",
  },
  detailImage: { width: "100%", height: "100%" },
  soloDetailImage: {
    width: "100%",
    height: 280,
    backgroundColor: colors.border,
  },
  imgLabel: {
    position: "absolute",
    bottom: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  imgLabelAfter: {
    left: undefined as any,
    right: 10,
    backgroundColor: "rgba(22,163,74,0.85)",
  },
  imgLabelText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  expandIcon: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Body
  detailBody: { padding: 16 },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityTag: {},
  tagText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },

  postTitle: { fontSize: 22, fontWeight: "900", color: colors.text },
  postDesc: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: 8,
  },

  // Timeline
  timelineCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timelineConnector: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 7,
    marginVertical: 2,
  },
  timelineLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  timelineValue: { fontSize: 13, fontWeight: "900", color: colors.text },
  resolvedTime: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
    textAlign: "right",
  },

  // Completed by
  completedByCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  completedByName: { fontSize: 14, fontWeight: "900", color: colors.text },
  completedByRole: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "capitalize",
    marginTop: 2,
  },

  // Rating
  ratingCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    alignItems: "center",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text,
  },

  // Comments
  // ─── Location map ───
  mapSection: {
    marginTop: 20,
  },
  mapAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  mapAddressText: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
  mapContainer: {
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    width: "100%",
    height: "100%",
  },

  commentsSection: {
    marginTop: 20,
  },
  noComments: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    textAlign: "center",
    fontStyle: "italic",
  },
  commentItem: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  commentAvatarImage: { width: 34, height: 34, borderRadius: 17 },
  commentBody: { flex: 1 },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentName: { fontSize: 13, fontWeight: "800", color: colors.text },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
    marginTop: 3,
  },

  // Comment input bar
  commentInputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.select({ ios: 30, default: 10 }),
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },

  // Fullscreen
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: Platform.select({ ios: 56, android: 40, default: 40 }),
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenLabel: {
    position: "absolute",
    top: Platform.select({ ios: 60, android: 44, default: 44 }),
    left: 16,
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
});
