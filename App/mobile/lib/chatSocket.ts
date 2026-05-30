// Singleton Socket.IO client for the backend `/chat` namespace.
//
// Mirrors website/src/lib/chat-socket.ts but sources the JWT from
// expo-secure-store. The socket is a module-level singleton so the global
// realtime listener (toasts/unread) and the per-room chat hook share one
// connection. React Native uses the websocket transport only — the XHR
// polling fallback is unreliable on device.

import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";
import { getAccessToken } from "./session";
import { debugWarn } from "./debug";

// API_BASE_URL ends in `/api`; the socket namespace lives at the host root.
const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;
let currentToken: string | null = null;

/** Get (and lazily create) the shared chat socket for the given token. */
export function getChatSocket(token: string): Socket {
  if (socket && currentToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  // Token changed — tear down the old connection first.
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentToken = token;
  socket = io(`${SOCKET_BASE_URL}/chat`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
    timeout: 12000,
  });
  socket.on("connect_error", (err) => {
    debugWarn("chat socket connect_error", err?.message);
  });
  return socket;
}

/** Resolve the current access token and connect. */
export async function ensureChatSocket(): Promise<Socket | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return getChatSocket(token);
}

export function getChatSocketIfConnected(): Socket | null {
  return socket?.connected ? socket : null;
}

export function disconnectChatSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}
