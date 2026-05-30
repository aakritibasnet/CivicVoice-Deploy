import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import { colors } from "@/theme/colors";
import { getAccessToken } from "@/lib/session";
import { AnimatedIconButton } from "@/components/ui/tap-feedback";
import { ReportListSkeleton } from "@/components/ui/feedback/Skeleton";
import EmptyState from "@/components/ui/feedback/EmptyState";
import {
  getReportPostsFeed,
  rateReportPost,
  toggleReportPostBookmark,
  type ReportPost,
  type FeedSort,
} from "@/api/reportPosts";
import {
  getPublicReports,
  toggleUpvote,
  type Report,
  type PublicReportsParams,
} from "@/api/reports";
import { getCategoriesList } from "@/api/wards";
import {
  getPublishedReportsFeed,
  type PublishedFeedReport,
} from "@/api/wardPublish";
import { useLocationFilter } from "@/hooks/useLocationFilter";
import { FlatList } from "react-native";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubTab = "all" | "completed" | "incoming" | "escalated" | "invalid" | "published";

const STATUS_OPTIONS: { key: SubTab; label: string; icon: string }[] = [
  { key: "all",       label: "All",       icon: "apps-outline" },
  { key: "completed", label: "Completed", icon: "checkmark-circle-outline" },
  { key: "incoming",  label: "Incoming",  icon: "arrow-down-circle-outline" },
  { key: "escalated", label: "Escalated", icon: "arrow-up-circle-outline" },
  { key: "invalid",   label: "Invalid",   icon: "close-circle-outline" },
  { key: "published", label: "Published", icon: "newspaper-outline" },
];

const SORT_OPTIONS: { key: FeedSort; label: string; icon: string }[] = [
  { key: "latest",     label: "Latest",     icon: "time-outline" },
  { key: "top_rated",  label: "Top Rated",  icon: "star-outline" },
  { key: "most_liked", label: "Most Liked", icon: "heart-outline" },
];

// Municipality-level radius in metres (~30 km covers most Nepali municipalities)
const MUNICIPALITY_RADIUS_M = 30000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDaysToComplete(start: string, end: string) {
  const hrs = Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000,
  );
  if (hrs < 1) return "< 1h";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function statusColor(status: string, escalated?: boolean) {
  if (escalated) return "#7C3AED";
  switch (status) {
    case "incoming":   return "#3B82F6";
    case "in_progress":return "#F59E0B";
    case "completed":  return "#16A34A";
    case "returned":   return "#EA580C";
    case "invalid":    return "#DC2626";
    case "escalated":  return "#7C3AED";
    default:           return colors.textMuted;
  }
}

function statusLabel(status: string, escalated?: boolean) {
  if (escalated) return "Escalated";
  switch (status) {
    case "incoming":    return "Incoming";
    case "in_progress": return "In Progress";
    case "completed":   return "Completed";
    case "returned":    return "Returned";
    case "invalid":     return "Invalid";
    default:            return status;
  }
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({
  value, average, count, onRate, disabled,
}: {
  value: number | null;
  average: number;
  count: number;
  onRate: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => !disabled && onRate(n)} hitSlop={4}>
          <Ionicons
            name={
              value
                ? n <= value ? "star" : "star-outline"
                : n <= Math.round(average) ? "star" : "star-outline"
            }
            size={20}
            color={
              value
                ? "#F59E0B"
                : n <= Math.round(average) ? "#F59E0B" : colors.border
            }
          />
        </Pressable>
      ))}
      <Text style={styles.ratingText}>
        {average > 0 ? average.toFixed(1) : "—"} ({count})
      </Text>
    </View>
  );
}

// ─── Before/After ────────────────────────────────────────────────────────────

function BeforeAfterImage({
  before, after,
}: { before: string | null; after: string }) {
  if (!before) {
    return (
      <Image source={{ uri: after }} style={styles.soloImage} resizeMode="cover" />
    );
  }
  return (
    <View style={styles.splitContainer}>
      <View style={styles.splitHalf}>
        <Image source={{ uri: before }} style={styles.splitImage} resizeMode="cover" />
        <View style={styles.splitLabel}>
          <Text style={styles.splitLabelText}>BEFORE</Text>
        </View>
      </View>
      <View style={styles.splitDivider} />
      <View style={styles.splitHalf}>
        <Image source={{ uri: after }} style={styles.splitImage} resizeMode="cover" />
        <View style={[styles.splitLabel, styles.splitLabelAfter]}>
          <Text style={styles.splitLabelText}>AFTER</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Picker Modal ────────────────────────────────────────────────────────────

function PickerModal<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { key: T; label: string; icon?: string }[];
  selected: T;
  onSelect: (key: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>{title}</Text>
        {options.map((opt) => {
          const active = selected === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.modalOpt, active && styles.modalOptActive]}
              onPress={() => { onSelect(opt.key); onClose(); }}
            >
              {opt.icon ? (
                <Ionicons
                  name={opt.icon as any}
                  size={18}
                  color={active ? colors.red2 : colors.textMuted}
                />
              ) : null}
              <Text style={[styles.modalOptText, active && styles.modalOptTextActive]}>
                {opt.label}
              </Text>
              {active ? (
                <Ionicons name="checkmark" size={18} color={colors.red2} style={{ marginLeft: "auto" }} />
              ) : null}
            </Pressable>
          );
        })}
        <View style={{ height: 20 }} />
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsFeedTab() {
  // ── Tab & view state
  const [activeTab, setActiveTab] = useState<SubTab>("all");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [sortBy, setSortBy] = useState<FeedSort>("latest");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { showToast } = useToast();

  // ── Location
  const { location, loading: locationLoading, permissionGranted, requestPermission } =
    useLocationFilter();

  // ── All tab state
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);

  // ── Completed tab state
  const [posts, setPosts] = useState<ReportPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [refreshingPosts, setRefreshingPosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  // ── Incoming tab state
  const [incomingReports, setIncomingReports] = useState<Report[]>([]);
  const [loadingIncoming, setLoadingIncoming] = useState(true);
  const [refreshingIncoming, setRefreshingIncoming] = useState(false);

  // ── Escalated tab state
  const [escalatedReports, setEscalatedReports] = useState<Report[]>([]);
  const [loadingEscalated, setLoadingEscalated] = useState(true);
  const [refreshingEscalated, setRefreshingEscalated] = useState(false);

  // ── Invalid tab state
  const [invalidReports, setInvalidReports] = useState<Report[]>([]);
  const [loadingInvalid, setLoadingInvalid] = useState(true);
  const [refreshingInvalid, setRefreshingInvalid] = useState(false);

  // ── Published tab state
  const [publishedReports, setPublishedReports] = useState<PublishedFeedReport[]>([]);
  const [loadingPublished, setLoadingPublished] = useState(true);
  const [refreshingPublished, setRefreshingPublished] = useState(false);
  const [publishedPage, setPublishedPage] = useState(1);
  const [publishedHasMore, setPublishedHasMore] = useState(false);
  const [loadingMorePublished, setLoadingMorePublished] = useState(false);

  // ─── Location params helper ───────────────────────────────────────────────

  const locationParams = useMemo((): Partial<PublicReportsParams> => {
    if (!location) return {};
    return { lat: location.lat, lng: location.lng, radius: MUNICIPALITY_RADIUS_M };
  }, [location]);

  // ─── Fetch: All ───────────────────────────────────────────────────────────

  const fetchAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingAll(true);
      else setLoadingAll(true);
      try {
        const token = await getAccessToken();
        setIsLoggedIn(Boolean(token));
        const res = await getPublicReports({
          ...locationParams,
          category: selectedCategory,
          limit: 50,
        });
        let reports: Report[] = res?.reports ?? res?.data?.reports ?? [];
        if (!Array.isArray(reports)) reports = [];
        if (sortBy === "most_liked") {
          reports = [...reports].sort(
            (a, b) => (b.upvote_count || 0) - (a.upvote_count || 0),
          );
        }
        setAllReports(reports);
      } catch (e: any) {
        debugWarn("Failed to load all reports", e?.message ?? e);
        setAllReports([]);
      } finally {
        setLoadingAll(false);
        setRefreshingAll(false);
      }
    },
    [locationParams, selectedCategory, sortBy],
  );

  // ─── Fetch: Completed ─────────────────────────────────────────────────────

  const fetchCompletedFeed = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingPosts(true);
      else setLoadingPosts(true);
      try {
        const token = await getAccessToken();
        setIsLoggedIn(Boolean(token));
        // Pass "latest" to API for most_liked (client sorts bookmark_count)
        const apiSort = sortBy === "most_liked" ? "latest" : sortBy;
        const res = await getReportPostsFeed({
          sort: apiSort,
          category: selectedCategory,
          limit: 20,
        });
        let nodes = res.nodes;
        if (sortBy === "most_liked") {
          nodes = [...nodes].sort((a, b) => b.bookmark_count - a.bookmark_count);
        }
        setPosts(nodes);
        setEndCursor(res.pageInfo.endCursor);
        setHasMorePosts(res.pageInfo.hasMore);
      } catch (e: any) {
        debugWarn("Failed to load completed feed", e?.message ?? e);
        setPosts([]);
      } finally {
        setLoadingPosts(false);
        setRefreshingPosts(false);
      }
    },
    [sortBy, selectedCategory],
  );

  const loadMoreCompleted = useCallback(async () => {
    if (!hasMorePosts || loadingMorePosts || !endCursor) return;
    setLoadingMorePosts(true);
    try {
      const apiSort = sortBy === "most_liked" ? "latest" : sortBy;
      const res = await getReportPostsFeed({
        sort: apiSort,
        category: selectedCategory,
        cursor: endCursor,
        limit: 20,
      });
      setPosts((prev) => [
        ...prev,
        ...res.nodes.filter((n) => !prev.some((p) => p.id === n.id)),
      ]);
      setEndCursor(res.pageInfo.endCursor);
      setHasMorePosts(res.pageInfo.hasMore);
    } catch {}
    setLoadingMorePosts(false);
  }, [hasMorePosts, loadingMorePosts, endCursor, sortBy, selectedCategory]);

  // ─── Fetch: Incoming ──────────────────────────────────────────────────────

  const fetchIncoming = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingIncoming(true);
      else setLoadingIncoming(true);
      try {
        const token = await getAccessToken();
        setIsLoggedIn(Boolean(token));
        const res = await getPublicReports({
          ...locationParams,
          status: "incoming,in_progress",
          category: selectedCategory,
          limit: 50,
        });
        let reports: Report[] = res?.reports ?? res?.data?.reports ?? [];
        if (!Array.isArray(reports)) reports = [];
        if (sortBy === "most_liked") {
          reports = [...reports].sort((a, b) => (b.upvote_count || 0) - (a.upvote_count || 0));
        }
        setIncomingReports(reports);
      } catch (e: any) {
        debugWarn("Failed to load incoming", e?.message ?? e);
        setIncomingReports([]);
      } finally {
        setLoadingIncoming(false);
        setRefreshingIncoming(false);
      }
    },
    [locationParams, selectedCategory, sortBy],
  );

  // ─── Fetch: Escalated ─────────────────────────────────────────────────────

  const fetchEscalated = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingEscalated(true);
      else setLoadingEscalated(true);
      try {
        const res = await getPublicReports({
          ...locationParams,
          escalated: true,
          category: selectedCategory,
          limit: 50,
        });
        let reports: Report[] = res?.reports ?? res?.data?.reports ?? [];
        if (!Array.isArray(reports)) reports = [];
        setEscalatedReports(reports);
      } catch (e: any) {
        debugWarn("Failed to load escalated", e?.message ?? e);
        setEscalatedReports([]);
      } finally {
        setLoadingEscalated(false);
        setRefreshingEscalated(false);
      }
    },
    [locationParams, selectedCategory],
  );

  // ─── Fetch: Invalid ───────────────────────────────────────────────────────

  const fetchInvalid = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingInvalid(true);
      else setLoadingInvalid(true);
      try {
        const res = await getPublicReports({
          ...locationParams,
          status: "invalid",
          category: selectedCategory,
          limit: 50,
        });
        let reports: Report[] = res?.reports ?? res?.data?.reports ?? [];
        if (!Array.isArray(reports)) reports = [];
        setInvalidReports(reports);
      } catch (e: any) {
        debugWarn("Failed to load invalid", e?.message ?? e);
        setInvalidReports([]);
      } finally {
        setLoadingInvalid(false);
        setRefreshingInvalid(false);
      }
    },
    [locationParams, selectedCategory],
  );

  // ─── Fetch: Published ─────────────────────────────────────────────────────

  const fetchPublished = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingPublished(true);
      else setLoadingPublished(true);
      try {
        const res = await getPublishedReportsFeed(1, 10);
        setPublishedReports(res.reports);
        setPublishedPage(1);
        setPublishedHasMore(res.pagination.page < res.pagination.totalPages);
      } catch (e: any) {
        debugWarn("Failed to load published", e?.message ?? e);
        showToast({
          type: "error",
          title: "Couldn't load published reports",
          message: getFriendlyErrorMessage(e, "Something went wrong."),
        });
        setPublishedReports([]);
      } finally {
        setLoadingPublished(false);
        setRefreshingPublished(false);
      }
    },
    [showToast],
  );

  const loadMorePublished = useCallback(async () => {
    if (!publishedHasMore || loadingMorePublished) return;
    setLoadingMorePublished(true);
    try {
      const next = publishedPage + 1;
      const res = await getPublishedReportsFeed(next, 10);
      setPublishedReports((prev) => [
        ...prev,
        ...res.reports.filter((n) => !prev.some((p) => p.id === n.id)),
      ]);
      setPublishedPage(next);
      setPublishedHasMore(res.pagination.page < res.pagination.totalPages);
    } catch {}
    setLoadingMorePublished(false);
  }, [publishedHasMore, loadingMorePublished, publishedPage]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    getCategoriesList().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "all")       fetchAll();
    else if (activeTab === "completed") fetchCompletedFeed();
    else if (activeTab === "incoming")  fetchIncoming();
    else if (activeTab === "escalated") fetchEscalated();
    else if (activeTab === "invalid")   fetchInvalid();
    else if (activeTab === "published") fetchPublished();
  }, [
    activeTab,
    fetchAll,
    fetchCompletedFeed,
    fetchIncoming,
    fetchEscalated,
    fetchInvalid,
    fetchPublished,
  ]);

  // ─── Interactions ─────────────────────────────────────────────────────────

  const askLogin = () => {
    Alert.alert("Login Required", "Please log in to interact with reports.", [
      { text: "Cancel", style: "cancel" },
      { text: "Login", onPress: () => router.push("/(auth)/login") },
    ]);
  };

  const handleRate = useCallback(
    async (postId: string, rating: number) => {
      if (!isLoggedIn) return askLogin();
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const hadRating = p.viewer_rating != null;
          const newCount = hadRating ? p.rating_count : p.rating_count + 1;
          const newAvg = hadRating
            ? (p.rating_average * p.rating_count - (p.viewer_rating ?? 0) + rating) /
              Math.max(newCount, 1)
            : (p.rating_average * p.rating_count + rating) / newCount;
          return { ...p, viewer_rating: rating, rating_average: newAvg, rating_count: newCount };
        }),
      );
      try {
        await rateReportPost(postId, rating);
      } catch {
        fetchCompletedFeed(true);
      }
    },
    [fetchCompletedFeed, isLoggedIn],
  );

  const handleBookmark = useCallback(
    async (postId: string) => {
      if (!isLoggedIn) return askLogin();
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return {
            ...p,
            is_bookmarked: !p.is_bookmarked,
            bookmark_count: p.bookmark_count + (p.is_bookmarked ? -1 : 1),
          };
        }),
      );
      try {
        await toggleReportPostBookmark(postId);
      } catch {
        fetchCompletedFeed(true);
      }
    },
    [fetchCompletedFeed, isLoggedIn],
  );

  const handleUpvote = useCallback(
    async (reportId: string, source: "all" | "incoming" | "escalated" | "invalid") => {
      if (!isLoggedIn) return askLogin();
      const setter =
        source === "all"      ? setAllReports :
        source === "incoming" ? setIncomingReports :
        source === "escalated"? setEscalatedReports : setInvalidReports;
      setter((prev) =>
        prev.map((r) => {
          if (r.id !== reportId) return r;
          const had = Boolean(r.user_upvoted);
          return { ...r, user_upvoted: !had, upvote_count: Math.max(0, r.upvote_count + (had ? -1 : 1)) };
        }),
      );
      try {
        const result = await toggleUpvote(reportId);
        setter((prev) =>
          prev.map((r) =>
            r.id !== reportId ? r : {
              ...r,
              user_upvoted: result.upvoted,
              upvote_count: typeof result.upvote_count === "number" ? result.upvote_count : r.upvote_count,
            },
          ),
        );
      } catch {
        if (source === "all")       fetchAll(true);
        else if (source === "incoming")  fetchIncoming(true);
        else if (source === "escalated") fetchEscalated(true);
        else                             fetchInvalid(true);
      }
    },
    [fetchAll, fetchIncoming, fetchEscalated, fetchInvalid, isLoggedIn],
  );

  const handleShare = async (title: string) => {
    try {
      await Share.share({ message: `Check out this civic report: ${title}` });
    } catch {}
  };

  const openReportDetail = useCallback((id: string) => {
    router.push({ pathname: "/report/[id]", params: { id } });
  }, []);

  const stopPropagation = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation();
  }, []);

  // ─── Map markers ──────────────────────────────────────────────────────────

  type MapMarker = { id: string; title: string; lat: number; lng: number; status: string };

  const mapMarkers = useMemo((): MapMarker[] => {
    if (activeTab === "completed") {
      return posts
        .filter((p) => p.location_lat != null && p.location_lng != null)
        .map((p) => ({ id: p.id, title: p.title, lat: p.location_lat!, lng: p.location_lng!, status: "completed" }));
    }
    const source: Report[] =
      activeTab === "all"       ? allReports :
      activeTab === "incoming"  ? incomingReports :
      activeTab === "escalated" ? escalatedReports :
      activeTab === "invalid"   ? invalidReports : [];
    return source
      .filter((r) => r.location_lat != null && r.location_lng != null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        lat: r.location_lat!,
        lng: r.location_lng!,
        status: r.escalated_to_municipality ? "escalated" : r.status,
      }));
  }, [activeTab, posts, allReports, incomingReports, escalatedReports, invalidReports]);

  // ─── Tab switching helper ─────────────────────────────────────────────────

  const switchTab = useCallback((key: SubTab) => {
    setActiveTab(key);
    setSelectedCategory(undefined);
    setSortBy("latest");
    setViewMode("list");
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const activeTabLabel = STATUS_OPTIONS.find((o) => o.key === activeTab)?.label ?? "All";
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Latest";
  const showSort = activeTab !== "published" && activeTab !== "escalated" && activeTab !== "invalid";

  const isLoading =
    activeTab === "all"       ? loadingAll :
    activeTab === "completed" ? loadingPosts :
    activeTab === "incoming"  ? loadingIncoming :
    activeTab === "escalated" ? loadingEscalated :
    activeTab === "published" ? loadingPublished :
    loadingInvalid;

  const handleRefresh = () => {
    if (activeTab === "all")       fetchAll(true);
    else if (activeTab === "completed") fetchCompletedFeed(true);
    else if (activeTab === "incoming")  fetchIncoming(true);
    else if (activeTab === "escalated") fetchEscalated(true);
    else if (activeTab === "published") fetchPublished(true);
    else fetchInvalid(true);
  };

  const isRefreshing =
    activeTab === "all"       ? refreshingAll :
    activeTab === "completed" ? refreshingPosts :
    activeTab === "incoming"  ? refreshingIncoming :
    activeTab === "escalated" ? refreshingEscalated :
    activeTab === "published" ? refreshingPublished :
    refreshingInvalid;

  // ─── Location bar visibility ──────────────────────────────────────────────

  const showLocationBar =
    (activeTab === "all" || activeTab === "incoming" || activeTab === "escalated" || activeTab === "invalid") &&
    location != null;

  // ─── Render: Completed card ───────────────────────────────────────────────

  const renderCompletedCard = useCallback(
    ({ item }: { item: ReportPost }) => (
      <Pressable
        style={styles.card}
        onPress={() => router.push({ pathname: "/report-post/[id]", params: { id: item.id } })}
      >
        <BeforeAfterImage before={item.before_image_url} after={item.after_image_url} />
        <View style={styles.cardContent}>
          <View style={styles.tagsRow}>
            <View style={styles.tag}>
              <Ionicons name="location-outline" size={11} color={colors.textMuted} />
              <Text style={styles.tagText}>{item.ward_name}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.category}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={styles.timelineLabel}>Reported</Text>
              <Text style={styles.timelineValue}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={styles.timelineArrow}>→</Text>
            <View style={styles.timelineItem}>
              <Ionicons name="checkmark-circle-outline" size={13} color="#16A34A" />
              <Text style={styles.timelineLabel}>Completed</Text>
              <Text style={styles.timelineValue}>{formatDate(item.completed_at)}</Text>
            </View>
            <Text style={styles.resolvedIn}>
              {getDaysToComplete(item.created_at, item.completed_at)}
            </Text>
          </View>
          <View style={styles.completedByRow}>
            <Ionicons name="person-outline" size={13} color={colors.textMuted} />
            <Text style={styles.completedByText}>
              Completed by{" "}
              <Text style={styles.completedByName}>{item.completed_by_name}</Text>
            </Text>
            {item.completed_by_role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {item.completed_by_role.replace(/_/g, " ")}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionBar}>
            <StarRating
              value={item.viewer_rating}
              average={item.rating_average}
              count={item.rating_count}
              onRate={(n) => handleRate(item.id, n)}
              disabled={!isLoggedIn}
            />
            <View style={styles.actionRight}>
              <Pressable style={styles.actionBtn} onPress={() => handleShare(item.title)} hitSlop={6}>
                <Ionicons name="share-social-outline" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: "/report-post/[id]", params: { id: item.id } })}
                hitSlop={6}
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                {item.comment_count > 0 ? (
                  <Text style={styles.actionText}>{item.comment_count}</Text>
                ) : null}
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => handleBookmark(item.id)} hitSlop={6}>
                <Ionicons
                  name={item.is_bookmarked ? "bookmark" : "bookmark-outline"}
                  size={18}
                  color={item.is_bookmarked ? colors.red2 : colors.textMuted}
                />
                {item.bookmark_count > 0 ? (
                  <Text style={styles.actionText}>{item.bookmark_count}</Text>
                ) : null}
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    ),
    [handleBookmark, handleRate, isLoggedIn],
  );

  // ─── Render: Generic Report card (All / Incoming / Escalated / Invalid) ───

  const renderReportCard = useCallback(
    (source: "all" | "incoming" | "escalated" | "invalid") =>
      ({ item }: { item: Report }) => {
        const isEscalated = source === "escalated" || item.escalated_to_municipality;
        const color = statusColor(item.status, isEscalated);
        const label = statusLabel(item.status, isEscalated);
        return (
          <Pressable style={styles.card} onPress={() => openReportDetail(item.id)}>
            {item.media_url ? (
              <Image source={{ uri: item.media_url }} style={styles.soloImage} resizeMode="cover" />
            ) : item.photo_urls && item.photo_urls.length > 0 ? (
              <Image source={{ uri: item.photo_urls[0] }} style={styles.soloImage} resizeMode="cover" />
            ) : null}
            <View style={styles.cardContent}>
              <View style={styles.tagsRow}>
                <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
                  <View style={[styles.statusDot, { backgroundColor: color }]} />
                  <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
                </View>
                {item.ward_name ? (
                  <View style={styles.tag}>
                    <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                    <Text style={styles.tagText}>{item.ward_name}</Text>
                  </View>
                ) : null}
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.category}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}
              {item.address_text ? (
                <View style={styles.addressRow}>
                  <Ionicons name="navigate-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.addressText} numberOfLines={1}>{item.address_text}</Text>
                </View>
              ) : null}

              {/* Escalation reason */}
              {isEscalated && item.pathway_reason ? (
                <View style={styles.reasonBox}>
                  <View style={styles.reasonHeader}>
                    <Ionicons name="arrow-up-circle" size={14} color="#7C3AED" />
                    <Text style={[styles.reasonTitle, { color: "#7C3AED" }]}>Escalation Reason</Text>
                  </View>
                  <Text style={styles.reasonText}>{item.pathway_reason}</Text>
                </View>
              ) : null}

              {/* Invalid reason */}
              {source === "invalid" && item.return_reasoning ? (
                <View style={styles.reasonBox}>
                  <View style={styles.reasonHeader}>
                    <Ionicons name="close-circle" size={14} color="#DC2626" />
                    <Text style={[styles.reasonTitle, { color: "#DC2626" }]}>Reason</Text>
                  </View>
                  <Text style={styles.reasonText}>{item.return_reasoning}</Text>
                </View>
              ) : null}

              <View style={styles.incomingMeta}>
                <Text style={styles.metaTime}>{timeAgo(item.submitted_at || item.created_at)}</Text>
              </View>
              <View style={styles.actionBar}>
                <Pressable
                  style={styles.upvoteBtn}
                  onPress={(e) => { stopPropagation(e); handleUpvote(item.id, source); }}
                >
                  <Ionicons
                    name={item.user_upvoted ? "arrow-up-circle" : "arrow-up-circle-outline"}
                    size={22}
                    color={item.user_upvoted ? colors.red2 : "#3B82F6"}
                  />
                  <Text style={styles.upvoteCount}>{item.upvote_count || 0}</Text>
                  <Text style={[styles.upvoteLabel, item.user_upvoted ? { color: colors.red2 } : null]}>
                    {item.user_upvoted ? "Upvoted" : "Upvote"}
                  </Text>
                </Pressable>
                <View style={styles.actionRight}>
                  <Pressable style={styles.actionBtn} onPress={(e) => { stopPropagation(e); handleShare(item.title); }} hitSlop={6}>
                    <Ionicons name="share-social-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        );
      },
    [handleUpvote, handleShare, openReportDetail, stopPropagation],
  );

  const renderAllCard = useMemo(() => renderReportCard("all"), [renderReportCard]);
  const renderIncomingCard = useMemo(() => renderReportCard("incoming"), [renderReportCard]);
  const renderEscalatedCard = useMemo(() => renderReportCard("escalated"), [renderReportCard]);
  const renderInvalidCard = useMemo(() => renderReportCard("invalid"), [renderReportCard]);

  // ─── Render: Published card ───────────────────────────────────────────────

  const renderPublishedCard = useCallback(
    ({ item }: { item: PublishedFeedReport }) => (
      <Pressable
        style={styles.card}
        onPress={() => router.push({ pathname: "/published-report/[id]", params: { id: item.id } })}
      >
        <View style={styles.publishedBanner}>
          <Ionicons name="document-text" size={20} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.publishedWard}>{item.ward_name}</Text>
            <Text style={styles.publishedPeriod}>
              {formatDate(item.period_start)} — {formatDate(item.period_end)}
            </Text>
          </View>
          {item.is_auto_published && (
            <View style={styles.autoBadge}>
              <Ionicons name="time-outline" size={10} color={colors.white} />
              <Text style={styles.autoBadgeText}>Auto</Text>
            </View>
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.publishedStats}>
            {[
              { value: item.overview.total_tasks, label: "Total",   color: colors.text },
              { value: item.overview.planned,     label: "Planned", color: "#6B7280" },
              { value: item.overview.in_progress, label: "Active",  color: "#F59E0B" },
              { value: item.overview.completed,   label: "Done",    color: "#16A34A" },
            ].map(({ value, label, color }) => (
              <View key={label} style={styles.publishedStat}>
                <Text style={[styles.publishedStatValue, { color }]}>{value}</Text>
                <Text style={styles.publishedStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {item.summary_text ? (
            <Text style={styles.publishedSummary} numberOfLines={3}>{item.summary_text}</Text>
          ) : null}
          <View style={styles.publishedFooter}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.publishedDate}>Published {formatDate(item.published_at)}</Text>
            {item.published_by_name ? (
              <>
                <Text style={styles.publishedDot}>·</Text>
                <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                <Text style={styles.publishedDate}>{item.published_by_name}</Text>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>
    ),
    [],
  );

  // ─── Key extractors ───────────────────────────────────────────────────────

  const postKey    = useCallback((item: ReportPost) => item.id, []);
  const reportKey  = useCallback((item: Report) => item.id, []);
  const pubKey     = useCallback((item: PublishedFeedReport) => item.id, []);

  // ─── Map region ───────────────────────────────────────────────────────────

  const mapRegion = useMemo(() => ({
    latitude:  location?.lat ?? 27.7172,
    longitude: location?.lng ?? 85.3240,
    latitudeDelta:  0.15,
    longitudeDelta: 0.15,
  }), [location]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Civic Reports</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerIconBtn}
              onPress={() => setViewMode((v) => (v === "list" ? "map" : "list"))}
              accessibilityLabel={viewMode === "map" ? "Switch to list view" : "Switch to map view"}
            >
              <Ionicons
                name={viewMode === "map" ? "list-outline" : "map-outline"}
                size={20}
                color={viewMode === "map" ? colors.red2 : colors.text}
              />
            </Pressable>
            <AnimatedIconButton
              onPress={() => router.push("/search")}
              hitSlop={8}
              style={styles.headerIconBtn}
              accessibilityLabel="Search reports"
            >
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </AnimatedIconButton>
          </View>
        </View>
      </View>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        {/* Status dropdown button */}
        <Pressable
          style={styles.filterChip}
          onPress={() => setShowStatusModal(true)}
        >
          <Ionicons
            name={(STATUS_OPTIONS.find((o) => o.key === activeTab)?.icon ?? "apps-outline") as any}
            size={14}
            color={colors.red2}
          />
          <Text style={styles.filterChipText}>{activeTabLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
        </Pressable>

        {/* Sort dropdown button */}
        {showSort ? (
          <Pressable style={styles.filterChip} onPress={() => setShowSortModal(true)}>
            <Ionicons name="swap-vertical-outline" size={14} color={colors.textMuted} />
            <Text style={styles.filterChipText}>{sortLabel}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Category dropdown button */}
        {activeTab !== "published" ? (
          <Pressable
            style={[styles.filterChip, selectedCategory ? styles.filterChipActive : null]}
            onPress={() => setShowCategoryModal(true)}
          >
            <Ionicons
              name="grid-outline"
              size={14}
              color={selectedCategory ? colors.white : colors.textMuted}
            />
            <Text
              style={[styles.filterChipText, selectedCategory ? styles.filterChipTextActive : null]}
              numberOfLines={1}
            >
              {selectedCategory ?? "Category"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={12}
              color={selectedCategory ? colors.white : colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {/* ── Location bar ────────────────────────────────────────────────── */}
      {showLocationBar ? (
        <Pressable
          style={styles.locationBar}
          onPress={permissionGranted ? undefined : requestPermission}
          disabled={permissionGranted}
        >
          <Ionicons
            name={location!.isGps ? "navigate" : "location-outline"}
            size={13}
            color={location!.isGps ? colors.red2 : colors.textMuted}
          />
          <Text style={styles.locationText}>
            {location!.cityName}
            {!location!.isGps ? "  ·  Approx. area" : "  ·  GPS"}
          </Text>
          {!permissionGranted ? (
            <Text style={styles.locationCta}>Use GPS →</Text>
          ) : null}
        </Pressable>
      ) : null}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {viewMode === "map" && activeTab !== "published" ? (
        /* ── Map view ── */
        <View style={{ flex: 1 }}>
          <MapView style={StyleSheet.absoluteFill} initialRegion={mapRegion}>
            {mapMarkers.map((m) => (
              <Marker
                key={m.id}
                coordinate={{ latitude: m.lat, longitude: m.lng }}
                title={m.title}
                pinColor={statusColor(m.status)}
                onPress={() => openReportDetail(m.id)}
              />
            ))}
          </MapView>
          {!isLoading && mapMarkers.length === 0 ? (
            <View style={styles.mapEmpty}>
              <Ionicons name="map-outline" size={44} color={colors.textMuted} />
              <Text style={styles.mapEmptyText}>No reports with location data</Text>
            </View>
          ) : null}
        </View>
      ) : isLoading ? (
        <ReportListSkeleton />
      ) : activeTab === "all" ? (
        allReports.length === 0 ? (
          <EmptyState icon="apps-outline" title="No Reports" subtitle="No civic reports found in your area yet." />
        ) : (
          <FlatList
            data={allReports}
            keyExtractor={reportKey}
            renderItem={renderAllCard}
            refreshing={refreshingAll}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={6}
            windowSize={7}
            initialNumToRender={4}
          />
        )
      ) : activeTab === "completed" ? (
        posts.length === 0 ? (
          <EmptyState icon="newspaper-outline" title="No Completions Yet" subtitle="Completed reports with before & after will appear here." />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={postKey}
            renderItem={renderCompletedCard}
            refreshing={refreshingPosts}
            onRefresh={handleRefresh}
            onEndReached={loadMoreCompleted}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={6}
            windowSize={7}
            initialNumToRender={4}
            ListFooterComponent={
              loadingMorePosts ? (
                <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.red2} />
              ) : null
            }
          />
        )
      ) : activeTab === "incoming" ? (
        incomingReports.length === 0 ? (
          <EmptyState icon="arrow-down-circle-outline" title="No Incoming Reports" subtitle="New reports from citizens will appear here." />
        ) : (
          <FlatList
            data={incomingReports}
            keyExtractor={reportKey}
            renderItem={renderIncomingCard}
            refreshing={refreshingIncoming}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={6}
            windowSize={7}
            initialNumToRender={4}
          />
        )
      ) : activeTab === "escalated" ? (
        escalatedReports.length === 0 ? (
          <EmptyState icon="arrow-up-circle-outline" title="No Escalated Reports" subtitle="Reports escalated to the municipality appear here." />
        ) : (
          <FlatList
            data={escalatedReports}
            keyExtractor={reportKey}
            renderItem={renderEscalatedCard}
            refreshing={refreshingEscalated}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={6}
            windowSize={7}
            initialNumToRender={4}
          />
        )
      ) : activeTab === "published" ? (
        publishedReports.length === 0 ? (
          <EmptyState icon="newspaper-outline" title="No Published Reports" subtitle="Weekly ward reports appear here when published." />
        ) : (
          <FlatList
            data={publishedReports}
            keyExtractor={pubKey}
            renderItem={renderPublishedCard}
            refreshing={refreshingPublished}
            onRefresh={handleRefresh}
            onEndReached={loadMorePublished}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={6}
            windowSize={7}
            initialNumToRender={4}
            ListFooterComponent={
              loadingMorePublished ? (
                <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.red2} />
              ) : null
            }
          />
        )
      ) : /* invalid */ invalidReports.length === 0 ? (
        <EmptyState icon="close-circle-outline" title="No Invalid Reports" subtitle="Reports marked as invalid will appear here." />
      ) : (
        <FlatList
          data={invalidReports}
          keyExtractor={reportKey}
          renderItem={renderInvalidCard}
          refreshing={refreshingInvalid}
          onRefresh={handleRefresh}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={6}
          windowSize={7}
          initialNumToRender={4}
        />
      )}

      {/* ── Status picker modal ─────────────────────────────────────────── */}
      <PickerModal
        visible={showStatusModal}
        title="Filter by Status"
        options={STATUS_OPTIONS}
        selected={activeTab}
        onSelect={switchTab}
        onClose={() => setShowStatusModal(false)}
      />

      {/* ── Sort picker modal ───────────────────────────────────────────── */}
      <PickerModal
        visible={showSortModal}
        title="Sort by"
        options={SORT_OPTIONS}
        selected={sortBy}
        onSelect={setSortBy}
        onClose={() => setShowSortModal(false)}
      />

      {/* ── Category picker modal ───────────────────────────────────────── */}
      <PickerModal
        visible={showCategoryModal}
        title="Filter by Category"
        options={[
          { key: "" as any, label: "All Categories", icon: "grid-outline" },
          ...categories.map((c) => ({ key: c as any, label: c })),
        ]}
        selected={(selectedCategory ?? "") as any}
        onSelect={(v) => setSelectedCategory(v || undefined)}
        onClose={() => setShowCategoryModal(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ── Header
  header: {
    paddingTop: Platform.select({ ios: 60, android: 50, default: 50 }),
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // ── Filter row
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexWrap: "wrap",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.red2,
    borderColor: colors.red2,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    maxWidth: 90,
  },
  filterChipTextActive: {
    color: colors.white,
  },

  // ── Location bar
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  locationCta: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.red2,
  },

  // ── Map
  mapEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.bg + "CC",
  },
  mapEmptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },

  // ── Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modalOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalOptActive: {
    backgroundColor: colors.red2 + "12",
  },
  modalOptText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  modalOptTextActive: {
    color: colors.red2,
  },

  // ── List content
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  // ── Card
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: "900", color: colors.text },
  cardDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },

  // ── Before/After
  splitContainer: { flexDirection: "row", height: 200 },
  splitHalf: { flex: 1, position: "relative" },
  splitImage: { width: "100%", height: "100%" },
  splitDivider: { width: 2, backgroundColor: colors.white },
  splitLabel: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  splitLabelAfter: {
    left: undefined as any,
    right: 8,
    backgroundColor: "rgba(22,163,74,0.8)",
  },
  splitLabelText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  soloImage: { width: "100%", height: 220, backgroundColor: colors.border },

  // ── Tags
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  // ── Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },

  // ── Address
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  addressText: { flex: 1, fontSize: 12, color: colors.textMuted },

  // ── Reason box (escalated / invalid)
  reasonBox: {
    marginTop: 8,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  reasonHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  reasonTitle: { fontSize: 12, fontWeight: "800" },
  reasonText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  // ── Timeline (completed)
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  timelineItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  timelineLabel: { fontSize: 11, color: colors.textMuted },
  timelineValue: { fontSize: 11, fontWeight: "700", color: colors.text },
  timelineArrow: { fontSize: 12, color: colors.textMuted },
  resolvedIn: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: "800",
    color: "#16A34A",
  },

  // ── Completed-by
  completedByRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  completedByText: { fontSize: 12, color: colors.textMuted },
  completedByName: { fontWeight: "800", color: colors.text },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.red2 + "15",
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 10, fontWeight: "800", color: colors.red2 },

  // ── Stars
  starRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 12, color: colors.textMuted, marginLeft: 4 },

  // ── Actions
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 6,
  },
  actionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, color: colors.textMuted },

  // ── Upvote
  upvoteBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  upvoteCount: { fontSize: 14, fontWeight: "800", color: colors.text },
  upvoteLabel: { fontSize: 13, fontWeight: "700", color: "#3B82F6" },

  // ── Meta
  incomingMeta: { marginTop: 6 },
  metaTime: { fontSize: 12, color: colors.textMuted },

  // ── Published
  publishedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.red2,
    padding: 14,
  },
  publishedWard: { fontSize: 14, fontWeight: "900", color: colors.white },
  publishedPeriod: { fontSize: 11, color: colors.white + "CC" },
  autoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autoBadgeText: { fontSize: 9, fontWeight: "800", color: colors.white },
  publishedStats: { flexDirection: "row", gap: 12, marginBottom: 10 },
  publishedStat: { alignItems: "center" },
  publishedStatValue: { fontSize: 18, fontWeight: "900", color: colors.text },
  publishedStatLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  publishedSummary: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 10,
  },
  publishedFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 8,
  },
  publishedDate: { fontSize: 11, color: colors.textMuted },
  publishedDot: { color: colors.textMuted, fontSize: 11 },
});
