import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/theme/colors";
import { useAuth } from "@/hooks/useAuth";
import { listMyReports, type Report } from "@/api/reports";

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "#16A34A";
    case "in_progress":
      return "#D97706";
    case "returned":
      return "#EF4444";
    case "invalid":
      return colors.textMuted;
    case "incoming":
    default:
      return colors.red2;
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    incoming: "Submitted",
    in_progress: "In Progress",
    completed: "Completed",
    returned: "Returned",
    invalid: "Invalid",
  };
  return (
    labels[status] ||
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MyReportsScreen() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "upvotes" | "oldest">(
    "recent",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await listMyReports();
      const reportsList = (res as any)?.data?.reports ?? (res as any)?.reports ?? res ?? [];
      setReports(Array.isArray(reportsList) ? reportsList : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) fetchReports();
    }, [user, fetchReports]),
  );

  const filteredReports = useMemo(() => {
    let list = [...reports];
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q),
      );
    }
    if (sortBy === "recent") {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else if (sortBy === "oldest") {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } else if (sortBy === "upvotes") {
      list.sort((a, b) => (b.upvote_count ?? 0) - (a.upvote_count ?? 0));
    }
    return list;
  }, [reports, sortBy, statusFilter, search]);

  const getThumbnail = (report: Report): string | null => {
    if (report.media_url) return report.media_url;
    if (report.photo_urls && report.photo_urls.length > 0)
      return report.photo_urls[0];
    return null;
  };

  if (loading && reports.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Reports</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: "all", label: "All" },
            { key: "incoming", label: "Submitted" },
            { key: "in_progress", label: "In Progress" },
            { key: "completed", label: "Completed" },
            { key: "returned", label: "Returned" },
          ]}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: chip }) => {
            const active = statusFilter === chip.key;
            const count =
              chip.key === "all"
                ? reports.length
                : reports.filter((r) => r.status === chip.key).length;
            return (
              <Pressable
                onPress={() => setStatusFilter(chip.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {chip.label} ({count})
                </Text>
              </Pressable>
            );
          }}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          {(
            [
              { key: "recent", label: "Recent" },
              { key: "upvotes", label: "Most Upvoted" },
              { key: "oldest", label: "Oldest" },
            ] as const
          ).map((opt) => {
            const active = sortBy === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setSortBy(opt.key)}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    active && styles.sortChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={14}
            color={colors.textMuted}
            style={{ marginRight: 6 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or category"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {!loading && reports.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="megaphone-outline" size={64} color={colors.border} />
          <Text style={styles.emptyTitle}>No Reports Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start reporting issues in your community
          </Text>
          <Pressable
            style={styles.reportBtn}
            onPress={() => router.push("/(camera)/camera")}
          >
            <Ionicons name="camera-outline" size={18} color={colors.white} />
            <Text style={styles.reportBtnText}>Report Issue</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={fetchReports}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={7}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptySubtitle}>
                No reports match your filters
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const thumbnail = getThumbnail(item);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  pressed && { opacity: 0.92 },
                ]}
                onPress={() => router.push(`/report/${item.id}`)}
              >
                {thumbnail ? (
                  <Image
                    source={{ uri: thumbnail }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Ionicons
                      name="image-outline"
                      size={24}
                      color={colors.textMuted}
                    />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title || "Untitled Report"}
                  </Text>
                  <View style={styles.cardMeta}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: statusColor(item.status) + "18",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: statusColor(item.status) },
                        ]}
                      >
                        {statusLabel(item.status || "incoming")}
                      </Text>
                    </View>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.footerText}>
                      {item.is_public ? "\u{1F30D}" : "\u{1F512}"}{" "}
                      {timeAgo(item.submitted_at || item.created_at)}
                    </Text>
                    <View style={styles.countsRow}>
                      <Ionicons
                        name="arrow-up"
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={styles.countText}>
                        {item.upvote_count ?? 0}
                      </Text>
                      <Ionicons
                        name="chatbubble-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={styles.countText}>
                        {item.comment_count ?? 0}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingTop: Platform.select({ ios: 60, android: 46, default: 46 }),
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

  filtersRow: { paddingBottom: 8 },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: colors.bg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.red2,
  },
  reportBtnText: { color: colors.white, fontWeight: "800", fontSize: 14 },

  chipRow: { paddingHorizontal: 16, gap: 8, marginBottom: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.red2, borderColor: colors.red2 },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  chipTextActive: { color: colors.white },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  sortLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  sortChipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  sortChipTextActive: { color: colors.bg },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0 },

  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: {
    backgroundColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: { flex: 1, padding: 10, justifyContent: "space-between" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  categoryText: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  footerText: { fontSize: 11, color: colors.textMuted },
  countsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  countText: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
});
