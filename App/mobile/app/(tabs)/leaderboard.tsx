import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  getLeaderboardApi,
  getMyRankApi,
  type LeaderboardEntry,
  type LeaderboardTimeframe,
} from "@/api/gamification";
import { colors } from "@/theme/colors";

const TIMEFRAMES: { key: LeaderboardTimeframe; label: string }[] = [
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
  { key: "all_time", label: "All Time" },
];

export default function LeaderboardScreen() {
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>("weekly");

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", timeframe],
    queryFn: () => getLeaderboardApi({ timeframe, limit: 20, page: 1 }),
  });

  const myRankQuery = useQuery({
    queryKey: ["leaderboard-rank", timeframe],
    queryFn: () => getMyRankApi({ timeframe }),
  });

  const data = leaderboardQuery.data?.leaderboard ?? [];
  const myRank = myRankQuery.data?.rank ?? null;
  const totalUsers = myRankQuery.data?.rank?.total_users;

  const renderPodium = () => {
    const [first, second, third] = data;

    if (!first && !second && !third) return null;

    const PodiumItem = ({
      entry,
      place,
    }: {
      entry?: LeaderboardEntry;
      place: 1 | 2 | 3;
    }) => {
      if (!entry)
        return <View style={[styles.podiumItem, styles.podiumEmpty]} />;

      const size = place === 1 ? 70 : 56;
      const crownColor =
        place === 1 ? "#FACC15" : place === 2 ? "#9CA3AF" : "#F97316";

      return (
        <View style={styles.podiumItem}>
          <View
            style={[styles.podiumAvatarWrap, { width: size, height: size }]}
          >
            <View
              style={[
                styles.podiumAvatarCircle,
                { width: size, height: size, borderRadius: size / 2 },
              ]}
            >
              <Text style={styles.podiumInitials}>
                {entry.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Ionicons
              name="ribbon-outline"
              size={18}
              color={crownColor}
              style={styles.podiumMedal}
            />
          </View>
          <Text style={styles.podiumName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.podiumStats}>
            {entry.report_count} reports • {entry.total_upvotes} upvotes
          </Text>
          <View
            style={[
              styles.podiumBase,
              place === 1 && styles.podiumBaseFirst,
              place === 2 && styles.podiumBaseSecond,
              place === 3 && styles.podiumBaseThird,
            ]}
          >
            <Text style={styles.podiumPlaceText}>#{place}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.podiumRow}>
        <PodiumItem entry={second} place={2} />
        <PodiumItem entry={first} place={1} />
        <PodiumItem entry={third} place={3} />
      </View>
    );
  };

  const renderRow = ({ item }: { item: LeaderboardEntry }) => {
    const isMe = myRank && item.id === myRank.id;
    return (
      <View
        style={[
          styles.row,
          isMe && { backgroundColor: "rgba(220, 38, 38, 0.06)" },
        ]}
      >
        <Text style={styles.rowRank}>#{item.rank}</Text>
        <View style={styles.rowAvatar}>
          <Text style={styles.rowAvatarInitial}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta}>
            {item.report_count} reports • {item.total_upvotes} upvotes
          </Text>
        </View>
      </View>
    );
  };

  const loading = leaderboardQuery.isLoading;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.segmentWrap}>
        {TIMEFRAMES.map((tf) => {
          const selected = tf.key === timeframe;
          return (
            <Pressable
              key={tf.key}
              onPress={() => setTimeframe(tf.key)}
              style={[styles.segmentItem, selected && styles.segmentItemActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  selected && styles.segmentTextActive,
                ]}
              >
                {tf.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} />
        </View>
      )}

      {!loading && data.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={64} color={colors.border} />
          <Text style={styles.emptyTitle}>No leaders yet</Text>
          <Text style={styles.emptySubtitle}>
            Start reporting issues to climb the leaderboard.
          </Text>
        </View>
      )}

      {!loading && data.length > 0 && (
        <FlatList
          data={data.slice(3)}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <>
              {renderPodium()}
              <Text style={styles.sectionTitle}>Top reporters</Text>
            </>
          }
          renderItem={renderRow}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 100,
          }}
          removeClippedSubviews={true}
          showsVerticalScrollIndicator={false}
        />
      )}

      {myRank && (
        <View style={styles.myRankCard}>
          <Text style={styles.myRankTitle}>Your rank</Text>
          <Text style={styles.myRankValue}>
            #{myRank.rank}{" "}
            {typeof myRank.total_users === "number" &&
            myRank.total_users > 0 ? (
              <Text style={styles.myRankOutOf}>
                out of {myRank.total_users}
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  segmentWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: {
    backgroundColor: colors.red2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.white,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  podiumItem: {
    alignItems: "center",
    flex: 1,
  },
  podiumEmpty: {
    opacity: 0,
  },
  podiumAvatarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  podiumAvatarCircle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.red2,
  },
  podiumInitials: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  podiumMedal: {
    position: "absolute",
    right: -6,
    bottom: -6,
  },
  podiumBase: {
    marginTop: 6,
    width: "70%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 4,
    backgroundColor: colors.card,
  },
  podiumBaseFirst: {
    backgroundColor: "#FBBF24",
  },
  podiumBaseSecond: {
    backgroundColor: "#E5E7EB",
  },
  podiumBaseThird: {
    backgroundColor: "#FDBA74",
  },
  podiumPlaceText: {
    fontSize: 12,
    fontWeight: "900",
    color: colors.text,
  },
  podiumName: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  podiumStats: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sectionTitle: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowRank: {
    width: 32,
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  rowAvatarInitial: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
  },
  rowName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  rowMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  myRankCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myRankTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
  },
  myRankValue: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },
  myRankOutOf: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
});
