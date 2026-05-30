import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { colors } from "@/theme/colors";
import { useAuth } from "@/hooks/useAuth";
import { useChatRoom } from "@/hooks/useChatRoom";
import { useChatStore } from "@/store/chat";
import MessageBubble, {
  type DisplayMessage,
  type MessageStatus,
} from "@/components/chat/MessageBubble";
import ChatComposer from "@/components/chat/ChatComposer";
import {
  sendMessage as apiSendMessage,
  uploadAttachment,
  listChats,
  attachmentUrl,
  authImageHeaders,
  type ChatAttachment,
  type ChatMessage,
  type LocalAttachment,
} from "@/api/chat";
import { getAccessToken } from "@/lib/session";

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function chatTitleFallback(type?: string): string {
  switch (type) {
    case "ward_municipality":
      return "Municipality";
    case "officer_ward":
      return "Ward";
    case "complaint_case":
      return "Case";
    default:
      return "Chat";
  }
}

export default function OfficerChatRoom() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    type?: string;
  }>();
  const chatId = String(params.id);
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const {
    connected,
    messages,
    isTyping,
    deliveredIds,
    othersLastReadMsgId,
    loadingInitial,
    loadingMore,
    hasMore,
    loadMore,
    markRead,
    sendTyping,
  } = useChatRoom(chatId);

  const clearUnread = useChatStore((s) => s.clearUnread);
  const [pending, setPending] = useState<DisplayMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imageHeaders, setImageHeaders] = useState<Record<string, string>>({});
  const [headerTitle, setHeaderTitle] = useState<string>(
    params.title ? String(params.title) : chatTitleFallback(params.type),
  );
  const lastMarkedRef = useRef<string | null>(null);

  // Auth headers for streaming protected image attachments.
  useEffect(() => {
    authImageHeaders().then(setImageHeaders);
  }, []);

  // Resolve a nicer title if we only have the id (e.g. opened from a toast).
  useEffect(() => {
    if (params.title) return;
    listChats()
      .then((chats) => {
        const c = chats.find((x) => x.id === chatId);
        if (c) setHeaderTitle(c.title ?? chatTitleFallback(c.type));
      })
      .catch(() => {});
  }, [chatId, params.title]);

  useEffect(() => {
    clearUnread(chatId);
  }, [chatId, clearUnread]);

  // Reconcile: drop optimistic rows once their confirmed twin arrives.
  const confirmedClientIds = useMemo(
    () =>
      new Set(
        messages.map((m) => m.client_msg_id).filter(Boolean) as string[],
      ),
    [messages],
  );
  useEffect(() => {
    setPending((prev) =>
      prev.filter(
        (p) => !p.client_msg_id || !confirmedClientIds.has(p.client_msg_id),
      ),
    );
  }, [confirmedClientIds]);

  const merged = useMemo<DisplayMessage[]>(() => {
    const visiblePending = pending.filter(
      (p) => !p.client_msg_id || !confirmedClientIds.has(p.client_msg_id),
    );
    return [...messages, ...visiblePending];
  }, [messages, pending, confirmedClientIds]);

  // Mark the latest message read whenever it changes.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && connected && lastMarkedRef.current !== last.id) {
      lastMarkedRef.current = last.id;
      markRead(last.id);
      clearUnread(chatId);
    }
  }, [messages, connected, markRead, clearUnread, chatId]);

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of merged) map.set(m.id, m);
    return map;
  }, [merged]);

  // Index of the furthest message the other party has read (chronological).
  const lastReadIdx = useMemo(() => {
    if (!othersLastReadMsgId) return -1;
    return merged.findIndex((m) => m.id === othersLastReadMsgId);
  }, [merged, othersLastReadMsgId]);

  const statusFor = useCallback(
    (m: DisplayMessage, idx: number): MessageStatus | null => {
      const mine = m.sender_kind === "officer" && m.sender_id === myId;
      if (!mine) return null;
      if (m._status === "sending" || m._status === "failed") return m._status;
      if (lastReadIdx >= 0 && idx <= lastReadIdx) return "read";
      if (deliveredIds.has(m.id)) return "delivered";
      return "sent";
    },
    [myId, lastReadIdx, deliveredIds],
  );

  // Inverted list renders newest at the bottom; reverse the chronological data.
  const inverted = useMemo(() => [...merged].reverse(), [merged]);

  const handleSendText = useCallback(
    async (body: string) => {
      const clientMsgId = uuidv4();
      const optimistic: DisplayMessage = {
        id: `pending-${clientMsgId}`,
        chat_id: chatId,
        sender_kind: "officer",
        sender_id: myId ?? "",
        type: "text",
        body,
        reply_to_message_id: replyTo?.id ?? null,
        client_msg_id: clientMsgId,
        created_at: new Date().toISOString(),
        _status: "sending",
      };
      setPending((p) => [...p, optimistic]);
      setReplyTo(null);
      try {
        await apiSendMessage(chatId, {
          body,
          type: "text",
          clientMsgId,
          replyToMessageId: optimistic.reply_to_message_id,
        });
        // Confirmed copy arrives via socket; reconcile effect removes this.
      } catch {
        setPending((p) =>
          p.map((m) =>
            m.client_msg_id === clientMsgId ? { ...m, _status: "failed" } : m,
          ),
        );
      }
    },
    [chatId, myId, replyTo],
  );

  const handleSendAttachment = useCallback(
    async (file: LocalAttachment, kind: "image" | "file") => {
      const clientMsgId = uuidv4();
      const replyToId = replyTo?.id ?? null;
      const optimistic: DisplayMessage = {
        id: `pending-${clientMsgId}`,
        chat_id: chatId,
        sender_kind: "officer",
        sender_id: myId ?? "",
        type: kind,
        body: null,
        reply_to_message_id: replyToId,
        client_msg_id: clientMsgId,
        created_at: new Date().toISOString(),
        _status: "sending",
        _localUri: kind === "image" ? file.uri : null,
      };
      setPending((p) => [...p, optimistic]);
      setReplyTo(null);
      try {
        await uploadAttachment(chatId, file, { clientMsgId, replyToMessageId: replyToId });
      } catch (err) {
        setPending((p) =>
          p.map((m) =>
            m.client_msg_id === clientMsgId ? { ...m, _status: "failed" } : m,
          ),
        );
        Alert.alert("Upload failed", (err as Error)?.message ?? "Try again.");
      }
    },
    [chatId, myId, replyTo],
  );

  const handleOpenFile = useCallback(async (att: ChatAttachment) => {
    try {
      const token = await getAccessToken();
      const dest = `${LegacyFS.cacheDirectory}${att.id}-${att.file_name}`;
      const { uri } = await LegacyFS.downloadAsync(
        attachmentUrl(att.id),
        dest,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: att.mime_type });
      }
    } catch (err) {
      Alert.alert("Could not open file", (err as Error)?.message ?? "");
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: DisplayMessage; index: number }) => {
      const mine = item.sender_kind === "officer" && item.sender_id === myId;
      const chronoIdx = inverted.length - 1 - index;
      const replyMsg = item.reply_to_message_id
        ? byId.get(item.reply_to_message_id) ?? null
        : null;
      return (
        <MessageBubble
          message={item}
          isMine={mine}
          status={statusFor(item, chronoIdx)}
          replyTo={replyMsg}
          imageHeaders={imageHeaders}
          onReply={(m) => setReplyTo(m)}
          onOpenFile={handleOpenFile}
        />
      );
    },
    [myId, inverted.length, byId, statusFor, imageHeaders, handleOpenFile],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.avatar}>
          <Ionicons name="chatbubbles" size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <Text style={styles.headerSub}>
            {isTyping ? "typing…" : connected ? "Online" : "Connecting…"}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {loadingInitial ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.red2} />
          </View>
        ) : merged.length === 0 ? (
          <View style={styles.center}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={48}
              color={colors.border}
            />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySub}>Say hello 👋</Text>
          </View>
        ) : (
          <FlatList
            data={inverted}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            onEndReached={() => {
              if (hasMore) loadMore();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  style={{ marginVertical: 12 }}
                  color={colors.red2}
                />
              ) : null
            }
            keyboardShouldPersistTaps="handled"
          />
        )}

        <ChatComposer
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSendText={handleSendText}
          onSendAttachment={handleSendAttachment}
          onTyping={sendTyping}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { padding: 2 },
  avatar: {
    height: 38,
    width: 38,
    borderRadius: 19,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyText: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  emptySub: { fontSize: 13, color: colors.textMuted },
  listContent: { paddingVertical: 10 },
});
