// Socket.IO singleton. Attached to the existing HTTP server in server.ts
// (not a separate process) so it shares JWT auth and the pg pool. The chat
// namespace + room model keep this Redis-adapter-ready: swapping in
// @socket.io/redis-adapter later needs zero schema change.

import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { registerChatNamespace } from "./chat-namespace";

export const CHAT_NAMESPACE = "/chat";

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): Server {
  if (io) return io;

  io = new Server(httpServer, {
    cors: { origin: "*" },
    // Reconnecting clients replay missed messages via the history endpoint
    // (keyset cursor), so a short connection-state buffer is enough.
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });

  registerChatNamespace(io);
  console.log(`Socket.IO listening on namespace ${CHAT_NAMESPACE}`);
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Realtime not initialized");
  return io;
}

export function chatRoom(chatId: string): string {
  return `chat:${chatId}`;
}

export function principalRoom(kind: string, id: string): string {
  return `principal:${kind}:${id}`;
}

/** Emit an event to everyone currently joined to a chat's room. */
export function emitToChat(
  chatId: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.of(CHAT_NAMESPACE).to(chatRoom(chatId)).emit(event, payload);
}

/** Emit to a principal's personal room (badge/unread/announcement fan-out). */
export function emitToPrincipal(
  kind: string,
  id: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.of(CHAT_NAMESPACE).to(principalRoom(kind, id)).emit(event, payload);
}

/** True if the principal has at least one live socket in this chat's room. */
export async function isPrincipalInChatRoom(
  kind: string,
  id: string,
  chatId: string,
): Promise<boolean> {
  if (!io) return false;
  const sockets = await io
    .of(CHAT_NAMESPACE)
    .in(chatRoom(chatId))
    .fetchSockets();
  return sockets.some(
    (s) => s.data?.principal?.kind === kind && s.data?.principal?.id === id,
  );
}
