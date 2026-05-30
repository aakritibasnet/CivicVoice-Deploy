import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/theme/colors";
import { getBookmarkedPosts, type ReportPost } from "@/api/reportPosts";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function BookmarkedReportsScreen() {
  const [posts, setPosts] = useState<ReportPost[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getBookmarkedPosts()
        .then(setPosts)
        .catch(() => setPosts([]))
        .finally(() => setLoading(false));
    }, []),
  );

  const renderItem = useCallback(({ item }: { item: ReportPost }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: "/report-post/[id]", params: { id: item.id } })}
    >
      <Image
        source={{ uri: item.after_image_url }}
        style={styles.cardImage}
        resizeMode="cover"
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.cardMeta}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          <Text style={styles.cardMetaText}>{item.ward_name}</Text>
          <Text style={styles.cardMetaDot}> · </Text>
          <Text style={styles.cardMetaText}>{item.category}</Text>
        </View>
        <View style={styles.cardStats}>
          <View style={styles.statItem}>
            <Ionicons name="star" size={13} color="#F59E0B" />
            <Text style={styles.statText}>
              {item.rating_average > 0 ? item.rating_average.toFixed(1) : "—"}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
            <Text style={styles.statText}>{item.comment_count}</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.completed_at)}</Text>
        </View>
      </View>
    </Pressable>
  ), []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Bookmarked Reports</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red2} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bookmark-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>No Bookmarks</Text>
          <Text style={styles.emptySubtitle}>
            Reports you bookmark will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.select({ ios: 56, android: 46, default: 46 }),
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },

  listContent: { padding: 16 },

  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardImage: {
    width: 100,
    height: 100,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  cardMetaText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  cardMetaDot: {
    color: colors.textMuted,
    fontSize: 11,
  },
  cardStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: "auto",
  },
});
