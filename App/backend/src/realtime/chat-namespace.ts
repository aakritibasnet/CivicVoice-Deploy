// The /chat Socket.IO namespace. One room per chat (joined only after an
// assertChatAccess check) and one personal room per principal for
// badge/unread fan-out. Message delivery itself comes from the chat_events
// Postgres bridge, not directly from these handlers — that keeps the
// single-instance design Redis-adapter-ready.

import type { Server, Socket } from "socket.io";
import { assertChatAccess } from "@/services/chat/access";
import type { ResolvedPrincipal } from "@/services/chat/principal";
import {
  recordDelivered,
  recordRead,
  getUnreadSummary,
} from "@/services/chat/receipts.service";
import { acknowledgeMessage } from "@/services/chat/workflow.service";
import {
  CHAT_NAMESPACE,
  chatRoom,
  principalRoom,
} from "./io";
import { socketAuthMiddleware, type SocketData } from "./socket-auth";
import { shouldAllowTyping } from "@/middleware/chat-rate-limit";

function principalOf(socket: Socket): ResolvedPrincipal {
  return (socket.data as SocketData).principal;
}

export function registerChatNamespace(io: Server): void {
  const nsp = io.of(CHAT_NAMESPACE);
  nsp.use(socketAuthMiddleware);

  nsp.on("connection", (socket: Socket) => {
    const me = principalOf(socket);
    // Personal room: unread/badge/announcement fan-out targets this.
    socket.join(principalRoom(me.kind, me.id));

    socket.on(
      "chat:join",
      async (
        payload: { chatId?: string },
        ack?: (res: { ok: boolean; error?: string }) => void,
      ) => {
        const chatId = payload?.chatId;
        if (!chatId) return ack?.({ ok: false, error: "chatId required" });
        try {
          await assertChatAccess(me, chatId, "read");
          await socket.join(chatRoom(chatId));
          socket
            .to(chatRoom(chatId))
            .emit("user.online", { chatId, principal: { kind: me.kind, id: me.id } });
          ack?.({ ok: true });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Access denied";
          ack?.({ ok: false, error: msg });
        }
      },
    );

    socket.on(
      "chat:leave",
      (payload: { chatId?: string }) => {
        const chatId = payload?.chatId;
        if (!chatId) return;
        socket.leave(chatRoom(chatId));
        socket
          .to(chatRoom(chatId))
          .emit("user.offline", {
            chatId,
            principal: { kind: me.kind, id: me.id },
          });
      },
    );

    // Typing indicators are only honored from sockets actually in the room.
    const inRoom = (chatId: string) =>
      socket.rooms.has(chatRoom(chatId));

    socket.on("typing:start", (payload: { chatId?: string }) => {
      const chatId = payload?.chatId;
      if (!chatId || !inRoom(chatId)) return;
      if (!shouldAllowTyping(socket)) return; // throttle spam
      socket.to(chatRoom(chatId)).emit("typing.started", {
        chatId,
        principal: { kind: me.kind, id: me.id },
      });
    });

    socket.on("typing:stop", (payload: { chatId?: string }) => {
      const chatId = payload?.chatId;
      if (!chatId || !inRoom(chatId)) return;
      socket.to(chatRoom(chatId)).emit("typing.stopped", {
        chatId,
        principal: { kind: me.kind, id: me.id },
      });
    });

    // Receipts. Clients emit message.delivered on receipt and message.read
    // when the message scrolls into view. Both fan a tick out to the room.
    socket.on(
      "message.delivered",
      async (
        payload: { chatId?: string; messageIds?: string[] },
        ack?: (res: { ok: boolean; count?: number; error?: string }) => void,
      ) => {
        try {
          const { chatId, messageIds } = payload ?? {};
          if (!chatId || !Array.isArray(messageIds)) {
            return ack?.({ ok: false, error: "chatId + messageIds required" });
          }
          const count = await recordDelivered(me, chatId, messageIds);
          socket.to(chatRoom(chatId)).emit("receipt.delivered", {
            chatId,
            messageIds,
            by: { kind: me.kind, id: me.id },
          });
          ack?.({ ok: true, count });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "error",
          });
        }
      },
    );

    socket.on(
      "message.read",
      async (
        payload: { chatId?: string; uptoMessageId?: string | null },
        ack?: (res: {
          ok: boolean;
          unread?: number;
          error?: string;
        }) => void,
      ) => {
        try {
          const chatId = payload?.chatId;
          if (!chatId) return ack?.({ ok: false, error: "chatId required" });
          const { unread, lastReadMessageId } = await recordRead(
            me,
            chatId,
            payload?.uptoMessageId ?? null,
          );
          socket.to(chatRoom(chatId)).emit("receipt.read", {
            chatId,
            lastReadMessageId,
            by: { kind: me.kind, id: me.id },
          });
          // Caller's own badge for this chat is now clear.
          socket.emit("unread.updated", { chatId, unread });
          ack?.({ ok: true, unread });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "error",
          });
        }
      },
    );

    socket.on(
      "message.acknowledge",
      async (
        payload: { chatId?: string; messageId?: string },
        ack?: (res: { ok: boolean; error?: string }) => void,
      ) => {
        try {
          const { chatId, messageId } = payload ?? {};
          if (!chatId || !messageId) {
            return ack?.({ ok: false, error: "chatId + messageId required" });
          }
          await acknowledgeMessage(me, chatId, messageId);
          ack?.({ ok: true });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "error",
          });
        }
      },
    );

    socket.on(
      "unread:sync",
      async (
        _payload: unknown,
        ack?: (res: {
          ok: boolean;
          total?: number;
          perChat?: { chatId: string; unread: number }[];
        }) => void,
      ) => {
        try {
          const summary = await getUnreadSummary(me);
          ack?.({ ok: true, ...summary });
        } catch {
          ack?.({ ok: false });
        }
      },
    );

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("chat:")) {
          socket.to(room).emit("user.offline", {
            chatId: room.slice("chat:".length),
            principal: { kind: me.kind, id: me.id },
          });
        }
      }
    });
  });
}
