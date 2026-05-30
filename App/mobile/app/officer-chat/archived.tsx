import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { colors } from "@/theme/colors";
import { listChats, type ChatSummary } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import { useArchiveStore } from "@/store/archive";
import { formatTime, preview, titleFor, iconFor } from "@/lib/chatDisplay";

export default function ArchivedChatsScreen() {
  const unreadByChat = useChatStore((s) => s.unreadByChat);
  const archivedChatIds = useArchiveStore((s) => s.archivedChatIds);
  const unarchiveChat = useArchiveStore((s) => s.unarchiveChat);
  const archivedSet = useMemo(
    () => new Set(archivedChatIds),
    [archivedChatIds],
  );

  const chatsQuery = useQuery({
    queryKey: ["officerChats"],
    queryFn: listChats,
  });

  const archivedChats = useMemo(
    () => (chatsQuery.data ?? []).filter((c) => archivedSet.has(c.id)),
    [chatsQuery.data, archivedSet],
  );

  const confirmUnarchive = useCallback(
    (chat: ChatSummary) => {
      Alert.alert(
        "Unarchive conversation",
        `Move "${titleFor(chat)}" back to your messages?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unarchive", onPress: () => unarchiveChat(chat.id) },
        ],
      );
    },
    [unarchiveChat],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatSummary }) => {
      const unread = unreadByChat[item.id] ?? 0;
      return (
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: "/officer-chat/[id]",
              params: { id: item.id, title: titleFor(item), type: item.type },
            })
          }
          onLongPress={() => confirmUnarchive(item)}
          delayLongPress={350}
        >
          <View style={styles.avatar}>
            <Ionicons name={iconFor(item.type)} size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <Text style={styles.title} numberOfLines={1}>
                {titleFor(item)}
              </Text>
              <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.preview} numberOfLines={1}>
                {preview(item.last_message)}
              </Text>
              {/* Archived: count shown but never highlighted (muted, not red). */}
              {unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [unreadByChat, confirmUnarchive],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Archived</Text>
        <View style={styles.backBtn} />
      </View>

      {chatsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={archivedChats}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={chatsQuery.isRefetching}
              onRefresh={() => chatsQuery.refetch()}
              tintColor={colors.red2}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="archive-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>No archived chats</Text>
              <Text style={styles.emptySub}>
                Long-press a conversation to archive it.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 20, fontWeight: "800", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    height: 50,
    width: 50,
    borderRadius: 25,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  time: { fontSize: 12, color: colors.textMuted },
  preview: { flex: 1, fontSize: 13.5, color: colors.textMuted },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
});
