import React, { useCallback, useMemo, useState } from "react";
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
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { colors } from "@/theme/colors";
import {
  listChats,
  listWardOrgs,
  listMunicipalityOrgs,
  createChat,
  type ChatSummary,
  type WardOrg,
  type MunicipalityOrg,
} from "@/api/chat";
import { useAuth } from "@/hooks/useAuth";
import { useChatStore } from "@/store/chat";
import { useArchiveStore } from "@/store/archive";
import { formatTime, preview, titleFor, iconFor } from "@/lib/chatDisplay";

function participantKey(chat: ChatSummary): string | null {
  if (chat.other_participant_kind && chat.other_participant_id) {
    return `${chat.other_participant_kind}:${chat.other_participant_id}`;
  }
  return null;
}

function chatSortTime(chat: ChatSummary): number {
  const value = chat.last_message_at ?? chat.created_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function dedupeChatsByParticipant(chats: ChatSummary[]): ChatSummary[] {
  const byParticipant = new Map<string, ChatSummary>();
  const withoutParticipant: ChatSummary[] = [];

  for (const chat of chats) {
    const key = participantKey(chat);
    if (!key) {
      withoutParticipant.push(chat);
      continue;
    }

    const current = byParticipant.get(key);
    if (!current || chatSortTime(chat) > chatSortTime(current)) {
      byParticipant.set(key, chat);
    }
  }

  return [...byParticipant.values(), ...withoutParticipant].sort(
    (a, b) => chatSortTime(b) - chatSortTime(a),
  );
}

export default function OfficerChatsScreen() {
  const { user } = useAuth();
  const unreadByChat = useChatStore((s) => s.unreadByChat);
  const archivedChatIds = useArchiveStore((s) => s.archivedChatIds);
  const archiveChat = useArchiveStore((s) => s.archiveChat);
  const archivedSet = useMemo(
    () => new Set(archivedChatIds),
    [archivedChatIds],
  );
  const [openingWardOrgId, setOpeningWardOrgId] = useState<string | null>(null);
  const [openingMunicipalityOrgId, setOpeningMunicipalityOrgId] =
    useState<string | null>(null);
  const isMunicipalityOfficer = user?.type === "municipality_officer";
  const isWardOfficer = user?.type === "ward_officer";

  const chatsQuery = useQuery({
    queryKey: ["officerChats"],
    queryFn: listChats,
  });

  const wardOrgsQuery = useQuery({
    queryKey: ["wardOrgs"],
    queryFn: listWardOrgs,
  });

  const municipalityOrgsQuery = useQuery({
    queryKey: ["municipalityOrgs"],
    queryFn: listMunicipalityOrgs,
    enabled: isMunicipalityOfficer,
  });

  // Refetch whenever the tab gains focus so previews/order stay fresh.
  useFocusEffect(
    useCallback(() => {
      chatsQuery.refetch();
      wardOrgsQuery.refetch();
      if (isMunicipalityOfficer) municipalityOrgsQuery.refetch();
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Officers are NOT org-level accounts — they must not see ward_municipality
  // chats (those belong to the ward/municipality dashboard users).
  const chats = useMemo(
    () =>
      (chatsQuery.data ?? []).filter(
        (c) => c.type !== "ward_municipality",
      ),
    [chatsQuery.data],
  );

  const wardOrgs = wardOrgsQuery.data ?? [];
  const municipalityOrgs = municipalityOrgsQuery.data ?? [];
  const chatsByParticipant = useMemo(() => {
    const map = new Map<string, ChatSummary>();
    for (const chat of dedupeChatsByParticipant(chats)) {
      const key = participantKey(chat);
      if (key) map.set(key, chat);
    }
    return map;
  }, [chats]);
  const peerChats = useMemo(
    () =>
      dedupeChatsByParticipant(
        chats.filter(
          (chat) =>
            chat.other_participant_kind === "officer" &&
            (chat.type === "officer_ward" ||
              chat.type === "municipality_internal"),
        ),
      ).filter((chat) => !archivedSet.has(chat.id)),
    [chats, archivedSet],
  );
  const otherChats = useMemo(
    () =>
      chats.filter(
        (chat) =>
          chat.type === "complaint_case" && !archivedSet.has(chat.id),
      ),
    [chats, archivedSet],
  );
  // Unread sitting in archived chats: surfaced (muted) on the Archived entry,
  // and deliberately excluded from the highlighted lists below.
  const archivedUnread = useMemo(
    () =>
      archivedChatIds.reduce((sum, id) => sum + (unreadByChat[id] ?? 0), 0),
    [archivedChatIds, unreadByChat],
  );
  const hasVisibleRows =
    wardOrgs.length > 0 ||
    municipalityOrgs.length > 0 ||
    peerChats.length > 0 ||
    otherChats.length > 0;

  const confirmArchive = useCallback(
    (chat: ChatSummary) => {
      Alert.alert(
        "Archive conversation",
        `Move "${titleFor(chat)}" to Archived?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Archive", onPress: () => archiveChat(chat.id) },
        ],
      );
    },
    [archiveChat],
  );

  const openWardOrgChat = async (wardOrg: WardOrg) => {
    setOpeningWardOrgId(wardOrg.id);
    try {
      const chat = await createChat({
        type: "officer_ward",
        title: wardOrg.ward_name,
        participants: [{ kind: "user", id: wardOrg.id }],
      });
      router.push({
        pathname: "/officer-chat/[id]",
        params: { id: chat.id, title: wardOrg.ward_name, type: chat.type },
      });
    } finally {
      setOpeningWardOrgId(null);
    }
  };

  const openMunicipalityOrgChat = async (org: MunicipalityOrg) => {
    setOpeningMunicipalityOrgId(org.id);
    try {
      const chat = await createChat({
        type: "municipality_internal",
        title: org.municipality_name,
        participants: [{ kind: "user", id: org.id }],
      });
      router.push({
        pathname: "/officer-chat/[id]",
        params: {
          id: chat.id,
          title: org.municipality_name,
          type: chat.type,
        },
      });
    } finally {
      setOpeningMunicipalityOrgId(null);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: ChatSummary }) => {
      const unread = unreadByChat[item.id] ?? 0;
      return (
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: "/officer-chat/[id]",
              params: {
                id: item.id,
                title: titleFor(item),
                type: item.type,
              },
            })
          }
          onLongPress={() => confirmArchive(item)}
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
              <Text
                style={[styles.preview, unread > 0 && styles.previewUnread]}
                numberOfLines={1}
              >
                {preview(item.last_message)}
              </Text>
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
    [unreadByChat, confirmArchive],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.archiveEntry}
          onPress={() => router.push("/officer-chat/archived")}
          hitSlop={8}
        >
          <Ionicons name="archive-outline" size={22} color={colors.text} />
          <Text style={styles.archiveLabel}>Archived</Text>
          {archivedUnread > 0 && (
            <View style={styles.archiveCount}>
              <Text style={styles.archiveCountText}>
                {archivedUnread > 99 ? "99+" : archivedUnread}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={styles.composeBtn}
          onPress={() => router.push("/officer-chat/new")}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={22} color={colors.white} />
        </Pressable>
      </View>

      {/* Persistent Municipality Dashboard contact for municipality officers. */}
      {isMunicipalityOfficer &&
        !municipalityOrgsQuery.isLoading &&
        municipalityOrgs.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>MUNICIPALITY DASHBOARD</Text>
            {municipalityOrgs.map((org) => {
              const chat = chatsByParticipant.get(`user:${org.id}`);
              return (
                <Pressable
                  key={org.id}
                  style={styles.wardRow}
                  onPress={() => openMunicipalityOrgChat(org)}
                  disabled={openingMunicipalityOrgId === org.id}
                >
                  <View style={styles.wardAvatar}>
                    <Ionicons name="business" size={20} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wardTitle}>{org.municipality_name}</Text>
                    <Text style={styles.wardSub}>
                      {chat ? preview(chat.last_message) : "No messages yet"}
                    </Text>
                  </View>
                  {openingMunicipalityOrgId === org.id ? (
                    <ActivityIndicator color={colors.red2} size="small" />
                  ) : (
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

      {/* Persistent Ward Dashboard contacts, visible before any message exists. */}
      {!wardOrgsQuery.isLoading && wardOrgs.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>
            {wardOrgs.length === 1 ? "WARD DASHBOARD" : "WARD DASHBOARDS"}
          </Text>
          {wardOrgs.map((wardOrg) => (
            <Pressable
              key={wardOrg.id}
              style={styles.wardRow}
              onPress={() => openWardOrgChat(wardOrg)}
              disabled={openingWardOrgId === wardOrg.id}
            >
              <View style={styles.wardAvatar}>
                <Ionicons name="business" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wardTitle}>{wardOrg.ward_name}</Text>
                <Text style={styles.wardSub}>Ward dashboard · {wardOrg.name}</Text>
              </View>
              {openingWardOrgId === wardOrg.id ? (
                <ActivityIndicator color={colors.red2} size="small" />
              ) : (
                <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {peerChats.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>
            {isWardOfficer ? "WARD COLLEAGUES" : "MUNICIPALITY COLLEAGUES"}
          </Text>
          {peerChats.map((chat) => (
            <React.Fragment key={chat.id}>
              {renderItem({ item: chat })}
            </React.Fragment>
          ))}
        </View>
      )}

      {chatsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={otherChats}
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
            hasVisibleRows ? null :
            <View style={styles.empty}>
              <Ionicons
                name="chatbubbles-outline"
                size={56}
                color={colors.border}
              />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySub}>
                Tap the compose button to start a chat.
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  archiveEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  archiveLabel: { fontSize: 22, fontWeight: "800", color: colors.text },
  // Muted on purpose: archived unread is shown but never highlighted like the
  // active chats below (no red badge).
  archiveCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveCountText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  composeBtn: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
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
  previewUnread: { color: colors.text, fontWeight: "600" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  wardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  wardAvatar: {
    height: 50,
    width: 50,
    borderRadius: 25,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  wardTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  wardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
