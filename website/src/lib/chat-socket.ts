// Singleton Socket.IO client for the /chat namespace.
// Call getChatSocket(token) to get (and lazily create) the connection.
// Call disconnectChatSocket() to tear it down (e.g., on logout).
//
// The socket is a module-level singleton so multiple React components
// can subscribe to the same connection without duplicating it.

import { io, type Socket } from "socket.io-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_CHAT_SOCKET_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:5000";

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getChatSocket(token: string): Socket {
  if (socket && socket.connected && currentToken === token) {
    return socket;
  }
  // Token changed or socket disconnected — reconnect.
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentToken = token;
  socket = io(`${BACKEND_URL}/chat`, {
    auth: { token },
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
  return socket;
}

export function disconnectChatSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

export function getChatSocketIfConnected(): Socket | null {
  return socket?.connected ? socket : null;
}
