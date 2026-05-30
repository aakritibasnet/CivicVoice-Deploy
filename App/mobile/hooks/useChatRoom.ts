// Per-chat realtime hook for the officer app. Mirrors website useChat:
// joins the chat room, streams message.created / edited / deleted, typing
// indicators, and delivery/read receipts. Initial + older history come from
// the REST keyset endpoint. Messages are held oldest→newest (chronological).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ensureChatSocket } from "@/lib/chatSocket";
import { getHistory, type ChatMessage } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import { debugWarn } from "@/lib/debug";

const PAGE_SIZE = 30;

export function useChatRoom(chatId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(new Set());
  const [othersLastReadMsgId, setOthersLastReadMsgId] = useState<string | null>(
    null,
  );
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const setUnread = useChatStore((s) => s.setUnread);

  // ─── Initial history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    setLoadingInitial(true);
    getHistory(chatId, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        // Backend returns newest→oldest; flip to chronological for the list.
        setMessages([...page.messages].reverse());
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
      })
      .catch((err) => debugWarn("chat history load failed", err?.message))
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const loadMore = useCallback(async () => {
    if (!chatId || !hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const page = await getHistory(chatId, {
        limit: PAGE_SIZE,
        before: cursorRef.current,
      });
      const older = [...page.messages].reverse();
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } catch (err) {
      debugWarn("chat load more failed", (err as Error)?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, hasMore, loadingMore]);

  // ─── Socket lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let sock: Socket | null = null;
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onMessage = (data: { message: ChatMessage }) => {
      if (!data?.message || data.message.chat_id !== chatId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      sock?.emit("message.delivered", {
        chatId,
        messageIds: [data.message.id],
      });
      // We're looking at the room — clear our own unread immediately.
      sock?.emit("message.read", { chatId, uptoMessageId: data.message.id });
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
      setUnread(data.chatId, data.unread);
    };

    const onDelivered = (data: { chatId: string; messageIds: string[] }) => {
      if (data.chatId !== chatId) return;
      setDeliveredIds((prev) => {
        const next = new Set(prev);
        for (const id of data.messageIds) next.add(id);
        return next;
      });
    };

    const onRead = (data: { chatId: string; lastReadMessageId: string }) => {
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

    (async () => {
      sock = await ensureChatSocket();
      if (!sock || disposed) return;
      socketRef.current = sock;

      sock.on("connect", onConnect);
      sock.on("disconnect", onDisconnect);
      if (sock.connected) setConnected(true);

      if (chatId) {
        sock.emit(
          "chat:join",
          { chatId },
          (res: { ok: boolean; error?: string }) => {
            if (!res?.ok) debugWarn("chat join failed", res?.error);
          },
        );
        sock.on("message.created", onMessage);
        sock.on("message.edited", onEdited);
        sock.on("message.deleted", onDeleted);
        sock.on("unread.updated", onUnread);
        sock.on("receipt.delivered", onDelivered);
        sock.on("receipt.read", onRead);
        sock.on("typing.started", onTypingStarted);
        sock.on("typing.stopped", onTypingStopped);
      }
    })();

    return () => {
      disposed = true;
      const s = socketRef.current;
      if (s) {
        if (chatId) s.emit("chat:leave", { chatId });
        s.off("connect", onConnect);
        s.off("disconnect", onDisconnect);
        s.off("message.created", onMessage);
        s.off("message.edited", onEdited);
        s.off("message.deleted", onDeleted);
        s.off("unread.updated", onUnread);
        s.off("receipt.delivered", onDelivered);
        s.off("receipt.read", onRead);
        s.off("typing.started", onTypingStarted);
        s.off("typing.stopped", onTypingStopped);
      }
      for (const t of typingTimers.values()) clearTimeout(t);
      setIsTyping(false);
      setDeliveredIds(new Set());
      setOthersLastReadMsgId(null);
    };
  }, [chatId, setUnread]);

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

  return {
    connected,
    messages,
    setMessages,
    isTyping,
    deliveredIds,
    othersLastReadMsgId,
    loadingInitial,
    loadingMore,
    hasMore,
    loadMore,
    markRead,
    sendTyping,
  };
}
