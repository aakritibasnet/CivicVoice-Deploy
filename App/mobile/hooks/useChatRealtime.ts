// App-wide chat realtime listener, mounted once in the officer layout while a
// session is active. Keeps the shared socket alive, hydrates per-chat unread
// counts (tab badge), and turns `chat.notify` principal-room events into
// in-app toasts — works in Expo Go without a push build.

import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { ensureChatSocket } from "@/lib/chatSocket";
import { useChatStore } from "@/store/chat";

export function useChatRealtime(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const setUnread = useChatStore((s) => s.setUnread);
  const setUnreadMap = useChatStore((s) => s.setUnreadMap);
  const pushToast = useChatStore((s) => s.pushToast);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let sock: Socket | null = null;

    const syncUnread = (s: Socket) => {
      s.emit(
        "unread:sync",
        {},
        (res: {
          ok: boolean;
          perChat?: { chatId: string; unread: number }[];
        }) => {
          if (res?.ok && res.perChat) {
            const map: Record<string, number> = {};
            for (const e of res.perChat) map[e.chatId] = e.unread;
            setUnreadMap(map);
          }
        },
      );
    };

    const onConnect = () => {
      if (sock) syncUnread(sock);
    };

    const onUnread = (data: { chatId: string; unread: number }) => {
      setUnread(data.chatId, data.unread);
    };

    const onNotify = (data: {
      chatId: string;
      type: string;
      title: string;
      body: string;
    }) => {
      if (!data?.chatId) return;
      pushToast({
        chatId: data.chatId,
        title: data.title ?? "New message",
        body: data.body ?? "",
        type: data.type ?? "chat_message",
      });
      // Refresh the chat list so the preview text and ordering update live.
      void queryClient.invalidateQueries({ queryKey: ["officerChats"] });
      // Keep the notifications screen/badge in sync with the new row.
      void queryClient.invalidateQueries({ queryKey: ["officerNotifications"] });
      void queryClient.invalidateQueries({ queryKey: ["officerUnreadCount"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    (async () => {
      sock = await ensureChatSocket();
      if (!sock || disposed) return;
      sock.on("connect", onConnect);
      sock.on("unread.updated", onUnread);
      sock.on("chat.notify", onNotify);
      if (sock.connected) syncUnread(sock);
    })();

    return () => {
      disposed = true;
      if (sock) {
        sock.off("connect", onConnect);
        sock.off("unread.updated", onUnread);
        sock.off("chat.notify", onNotify);
      }
    };
  }, [enabled, queryClient, setUnread, setUnreadMap, pushToast]);
}
