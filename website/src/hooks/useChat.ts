"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/src/store/auth-store";
import { getChatSocket, disconnectChatSocket } from "@/src/lib/chat-socket";
import type { Socket } from "socket.io-client";

export type ChatAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  resource_type: string;
  size_bytes: number;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  sender_kind: string;
  sender_id: string;
  type: string;
  body: string | null;
  priority: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  client_msg_id?: string | null;
  reply_to_message_id?: string | null;
  attachments?: ChatAttachment[];
};

type UnreadMap = Record<string, number>;

export function useChat(chatId?: string) {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState<UnreadMap>({});
  const [isTyping, setIsTyping] = useState(false);
  // Tracks message IDs delivered to at least one other party.
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(new Set());
  // ID of the furthest message the other party has marked read.
  const [othersLastReadMsgId, setOthersLastReadMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const sock = getChatSocket(token);
    socketRef.current = sock;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    if (sock.connected) setConnected(true);

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
    };
  }, [token]);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock || !chatId) return;

    // Join with ack so we surface server-side access errors early.
    sock.emit(
      "chat:join",
      { chatId },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) {
          console.error("[chat] join failed:", res?.error ?? "unknown");
        }
      },
    );

    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const onMessage = (data: { message: ChatMessage }) => {
      if (!data?.message) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      sock.emit("message.delivered", { chatId, messageIds: [data.message.id] });
    };

    const onEdited = (data: {
      message: Pick<ChatMessage, "id" | "body" | "edited_at">;
    }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.message.id ? { ...m, ...data.message } : m,
        ),
      );
    };

    const onDeleted = (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, deleted_at: new Date().toISOString() }
            : m,
        ),
      );
    };

    const onUnread = (data: { chatId: string; unread: number }) => {
      setUnread((prev) => ({ ...prev, [data.chatId]: data.unread }));
    };

    const onDelivered = (data: {
      chatId: string;
      messageIds: string[];
      by: { kind: string; id: string };
    }) => {
      if (data.chatId !== chatId) return;
      setDeliveredIds((prev) => {
        const next = new Set(prev);
        for (const id of data.messageIds) next.add(id);
        return next;
      });
    };

    const onRead = (data: {
      chatId: string;
      lastReadMessageId: string;
      by: { kind: string; id: string };
    }) => {
      if (data.chatId !== chatId) return;
      setOthersLastReadMsgId(data.lastReadMessageId);
    };

    const onTypingStarted = (data: {
      chatId: string;
      principal: { kind: string; id: string };
    }) => {
      if (data.chatId !== chatId) return;
      const key = `${data.principal.kind}:${data.principal.id}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.set(
        key,
        setTimeout(() => {
          typingTimers.delete(key);
          setIsTyping(typingTimers.size > 0);
        }, 5000),
      );
      setIsTyping(true);
    };

    const onTypingStopped = (data: {
      chatId: string;
      principal: { kind: string; id: string };
    }) => {
      if (data.chatId !== chatId) return;
      const key = `${data.principal.kind}:${data.principal.id}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
      setIsTyping(typingTimers.size > 0);
    };

    sock.on("message.created", onMessage);
    sock.on("message.edited", onEdited);
    sock.on("message.deleted", onDeleted);
    sock.on("unread.updated", onUnread);
    sock.on("receipt.delivered", onDelivered);
    sock.on("receipt.read", onRead);
    sock.on("typing.started", onTypingStarted);
    sock.on("typing.stopped", onTypingStopped);

    return () => {
      sock.emit("chat:leave", { chatId });
      sock.off("message.created", onMessage);
      sock.off("message.edited", onEdited);
      sock.off("message.deleted", onDeleted);
      sock.off("unread.updated", onUnread);
      sock.off("receipt.delivered", onDelivered);
      sock.off("receipt.read", onRead);
      sock.off("typing.started", onTypingStarted);
      sock.off("typing.stopped", onTypingStopped);
      for (const t of typingTimers.values()) clearTimeout(t);
      setIsTyping(false);
      setDeliveredIds(new Set());
      setOthersLastReadMsgId(null);
    };
  }, [chatId]);

  const markRead = useCallback(
    (uptoMessageId?: string) => {
      if (!chatId) return;
      socketRef.current?.emit("message.read", { chatId, uptoMessageId });
    },
    [chatId],
  );

  const sendTyping = useCallback(
    (start: boolean) => {
      if (!chatId) return;
      socketRef.current?.emit(start ? "typing:start" : "typing:stop", {
        chatId,
      });
    },
    [chatId],
  );

  const syncUnread = useCallback(() => {
    socketRef.current?.emit(
      "unread:sync",
      {},
      (res: {
        ok: boolean;
        perChat?: { chatId: string; unread: number }[];
      }) => {
        if (res?.ok && res.perChat) {
          const map: UnreadMap = {};
          for (const entry of res.perChat) map[entry.chatId] = entry.unread;
          setUnread(map);
        }
      },
    );
  }, []);

  return {
    connected,
    messages,
    unread,
    isTyping,
    deliveredIds,
    othersLastReadMsgId,
    markRead,
    sendTyping,
    syncUnread,
    disconnect: disconnectChatSocket,
  };
}
