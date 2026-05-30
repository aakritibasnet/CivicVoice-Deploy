import React, { useState } from "react";
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
import { getOfficerHistory, type HistoryItem } from "@/api/officerApi";

const STATUS_COLORS: Record<string, string> = {
  todo: "#6B7280",
  in_progress: "#F59E0B",
  completed: "#16A34A",
};

const TABS = [
  { key: "all", label: "All Tasks" },
  { key: "completed", label: "Completed" },
];

function HistoryCard({ item }: { item: HistoryItem }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={() => router.push(`/officer-task/${item.id}` as any)}
    >
      <View style={styles.cardTop}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || "#6B7280" }]} />
        <Text style={styles.statusLabel}>
          {{ todo: "Todo", in_progress: "In Progress", completed: "Completed" }[item.status] || item.status}
        </Text>
        {item.proof_count > 0 && (
          <View style={styles.proofBadge}>
            <Ionicons name="camera" size={11} color={colors.white} />
            <Text style={styles.proofCount}>{item.proof_count}</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

      <View style={styles.metaGrid}>
        {item.location_text && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{item.location_text}</Text>
          </View>
        )}
        {item.ward_name && !item.location_text && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.ward_name}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            Assigned: {new Date(item.assigned_at).toLocaleDateString(undefined, {
              month: "short", day: "numeric",
            })}
          </Text>
        </View>
        {item.completed_at && (
          <View style={styles.metaItem}>
            <Ionicons name="checkmark-circle-outline" size={12} color="#16A34A" />
            <Text style={[styles.metaText, { color: "#16A34A" }]}>
              Completed: {new Date(item.completed_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric",
              })}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function OfficerHistoryScreen() {
  const [tab, setTab] = useState("all");

  const query = useQuery({
    queryKey: ["officerHistory", tab],
    queryFn: () => getOfficerHistory(tab === "all" ? undefined : tab),
  });

  const items = query.data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSubtitle}>{items.length} tasks</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryCard item={item} />}
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
              <Ionicons name="time-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptySubtitle}>
                {tab === "completed"
                  ? "Complete tasks to build your history"
                  : "Your assigned task history will appear here"}
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

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.red2,
    borderColor: colors.red2,
  },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextActive: { color: colors.white },

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
  proofBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.red2,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proofCount: { fontSize: 10, fontWeight: "900", color: colors.white },

  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },

  metaGrid: { gap: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 12 },
  emptySubtitle: {
    fontSize: 13, color: colors.textMuted, textAlign: "center",
    marginTop: 6, lineHeight: 18,
  },
});
