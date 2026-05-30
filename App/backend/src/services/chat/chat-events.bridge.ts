// chat_events Postgres LISTEN/NOTIFY bridge. Mirrors
// realtime-delivery.service.ts exactly: a single backend instance wins a
// pg_try_advisory_lock and fans pg_notify('chat_events', …) payloads out
// to Socket.IO rooms. Decoupling the writer (message.service) from the
// emitter via Postgres is what keeps this multi-instance/Redis-ready.

import { pool } from "@/db/pool";
import { emitToChat } from "@/realtime/io";
import { dispatchMessageNotifications } from "./chat-notify.service";

const CHAT_EVENTS_CHANNEL = "chat_events";
// Distinct from the notification bridge's 24040101.
const CHAT_BRIDGE_LOCK_KEY = 24050191;

let bridgeStarted = false;

type ChatEventPayload = {
  event: "message.created";
  chat_id: string;
  message: Record<string, unknown>;
};

export function publishChatEvent(
  client: { query: (q: string, v: unknown[]) => Promise<unknown> },
  payload: ChatEventPayload,
): Promise<unknown> {
  // pg_notify payload cap is 8000 bytes; message bodies are well under that.
  return client.query("SELECT pg_notify($1, $2)", [
    CHAT_EVENTS_CHANNEL,
    JSON.stringify(payload),
  ]);
}

function handleChatEvent(raw?: string): void {
  if (!raw) return;
  let payload: ChatEventPayload;
  try {
    payload = JSON.parse(raw) as ChatEventPayload;
  } catch (err) {
    console.error("Failed to parse chat event payload:", err);
    return;
  }
  if (payload.event === "message.created" && payload.chat_id) {
    emitToChat(payload.chat_id, "message.created", { message: payload.message });
    // Presence-aware, coalesced push/in-app fan-out happens here on the
    // single elected deliverer so it can't double-send across instances.
    void dispatchMessageNotifications(
      payload.message as Parameters<typeof dispatchMessageNotifications>[0],
    ).catch((err) =>
      console.error("dispatchMessageNotifications error:", err),
    );
  }
}

export async function startChatEventsBridge(): Promise<void> {
  if (bridgeStarted) return;

  const client = await pool.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [CHAT_BRIDGE_LOCK_KEY],
    );

    if (!lock.rows[0]?.acquired) {
      client.release();
      console.log("Chat events bridge already active on another instance");
      return;
    }

    await client.query(`LISTEN ${CHAT_EVENTS_CHANNEL}`);
    client.on("notification", (msg) => handleChatEvent(msg.payload));
    client.on("error", (err) =>
      console.error("Chat events bridge listener error:", err),
    );

    bridgeStarted = true;
    console.log(`Chat events bridge listening on ${CHAT_EVENTS_CHANNEL}`);
  } catch (err) {
    client.release();
    throw err;
  }
}
