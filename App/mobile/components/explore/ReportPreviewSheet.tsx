import React, { forwardRef, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "@/theme/colors";
import { getCategoryMarkerConfig } from "./CustomMarker";
import { toggleUpvote } from "@/api/reports";
import { toggleFollow } from "@/api/followers";
import { getAccessToken } from "@/lib/session";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFriendlyErrorMessage } from "@/lib/feedback";

export type ExploreReport = {
  id: string;
  title?: string | null;
  category?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  photo_urls?: string[] | null;
  location_lat?: number | null;
  location_lng?: number | null;
  address?: string | null;
  address_text?: string | null;
  upvote_count?: number | null;
  comment_count?: number | null;
  status?: string | null;
  is_public?: boolean;
  ward_name?: string | null;
  created_at: string;
};

type Props = {
  report: ExploreReport | null;
  onClose: () => void;
  onUpvoted?: (reportId: string) => void;
  onFollowed?: (reportId: string, following: boolean) => void;
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

function statusColor(status: string) {
  switch (status) {
    case "incoming":
      return "#3B82F6";
    case "in_progress":
      return "#F59E0B";
    case "completed":
      return "#16A34A";
    case "returned":
      return "#EA580C";
    case "invalid":
      return "#DC2626";
    default:
      return colors.textMuted;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "incoming":
      return "Incoming";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "returned":
      return "Returned";
    case "invalid":
      return "Invalid";
    default:
      return status;
  }
}

const ReportPreviewSheet = forwardRef<BottomSheet, Props>(
  function ReportPreviewSheet({ report, onClose, onUpvoted, onFollowed }, ref) {
    const snapPoints = useMemo(() => ["38%", "55%"], []);
    const [upvoting, setUpvoting] = useState(false);
    const [following, setFollowing] = useState(false);
    const { showToast } = useToast();

    if (!report) return null;

    const categoryConfig = getCategoryMarkerConfig(report.category);
    const displayAddress = report.address_text || report.address;
    const imageUrl =
      report.media_url ||
      (report.photo_urls && report.photo_urls.length > 0 ? report.photo_urls[0] : null);
    const isActive = report.status === "incoming" || report.status === "in_progress";

    const handleUpvote = async () => {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Login Required", "Please log in to upvote reports.", [
          { text: "Cancel", style: "cancel" },
          { text: "Login", onPress: () => router.push("/(auth)/login") },
        ]);
        return;
      }
      setUpvoting(true);
      try {
        await toggleUpvote(report.id);
        onUpvoted?.(report.id);
        showToast({
          type: "success",
          title: "Report upvoted",
          message: "Thanks for supporting this report.",
        });
      } catch (error) {
        showToast({
          type: "error",
          title: "Couldn't upvote",
          message: getFriendlyErrorMessage(
            error,
            "Something went wrong. Please try again.",
          ),
        });
      } finally {
        setUpvoting(false);
      }
    };

    const handleFollow = async () => {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Login Required", "Please log in to follow reports.", [
          { text: "Cancel", style: "cancel" },
          { text: "Login", onPress: () => router.push("/(auth)/login") },
        ]);
        return;
      }
      setFollowing(true);
      try {
        const result = await toggleFollow(report.id);
        onFollowed?.(report.id, result.following);
        showToast({
          type: "success",
          title: result.following ? "Following report" : "Notifications turned off",
          message: result.following
            ? "You'll get updates when this report changes."
            : "You won't receive updates for this report anymore.",
        });
      } catch (error) {
        showToast({
          type: "error",
          title: "Couldn't update follow",
          message: getFriendlyErrorMessage(
            error,
            "Something went wrong. Please try again.",
          ),
        });
      } finally {
        setFollowing(false);
      }
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.content}>
          {!!imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          )}

          <Text style={styles.title} numberOfLines={2}>
            {report.title || "Untitled report"}
          </Text>

          <View style={styles.metaRow}>
            {/* Status badge */}
            {report.status && (
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusColor(report.status) + "18" },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor(report.status) },
                  ]}
                />
                <Text
                  style={[styles.statusText, { color: statusColor(report.status) }]}
                >
                  {statusLabel(report.status)}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.categoryPill,
                { backgroundColor: `${categoryConfig.color}22` },
              ]}
            >
              <Text
                style={[styles.categoryText, { color: categoryConfig.color }]}
              >
                {report.category || "General"}
              </Text>
            </View>

            <Text style={styles.timeText}>{timeAgo(report.created_at)}</Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statWrap}>
              <Ionicons
                name="arrow-up-circle-outline"
                size={16}
                color={colors.textMuted}
              />
              <Text style={styles.statText}>
                {report.upvote_count ?? 0} upvotes
              </Text>
            </View>

            <View style={styles.statWrap}>
              <Ionicons
                name="chatbubble-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.statText}>
                {report.comment_count ?? 0} comments
              </Text>
            </View>

            {report.ward_name && (
              <View style={styles.statWrap}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.statText}>{report.ward_name}</Text>
              </View>
            )}
          </View>

          {!!displayAddress && (
            <Text style={styles.address} numberOfLines={2}>
              {displayAddress}
            </Text>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {isActive && (
              <Pressable
                style={styles.upvoteBtn}
                onPress={handleUpvote}
                disabled={upvoting}
              >
                <Ionicons name="arrow-up-circle" size={20} color="#3B82F6" />
                <Text style={styles.upvoteBtnText}>
                  {upvoting ? "..." : "Upvote"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.followBtn}
              onPress={handleFollow}
              disabled={following}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color="#8B5CF6"
              />
              <Text style={styles.followBtnText}>
                {following ? "..." : "Follow"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.cta, { flex: 1 }]}
              onPress={() =>
                router.push({
                  pathname: "/report/[id]",
                  params: { id: String(report.id) },
                })
              }
            >
              <Text style={styles.ctaText}>View Full Details</Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

export default ReportPreviewSheet;

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: "#FFFFFF",
  },
  handle: {
    backgroundColor: "#D1D5DB",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 10,
  },
  image: {
    width: "100%",
    height: 124,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timeText: {
    marginLeft: "auto",
    fontSize: 12,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  statWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
  },
  address: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  upvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#3B82F6" + "14",
    borderWidth: 1,
    borderColor: "#3B82F6" + "30",
  },
  upvoteBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#3B82F6",
  },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#8B5CF6" + "14",
    borderWidth: 1,
    borderColor: "#8B5CF6" + "30",
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#8B5CF6",
  },
  cta: {
    flex: 1,
    backgroundColor: colors.red2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  ctaText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
});
