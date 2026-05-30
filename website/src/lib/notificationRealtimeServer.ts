import { EventEmitter } from "node:events";
import { Client } from "pg";

export type NotificationRealtimeAction = "created" | "updated" | "deleted";

export interface RealtimeNotificationRecord {
  id: string;
  user_id: string;
  report_id: string | null;
  title: string;
  message: string;
  type: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationRealtimeEvent {
  action: NotificationRealtimeAction;
  notification: RealtimeNotificationRecord;
}

type NotificationRealtimeState = {
  emitter: EventEmitter;
  startPromise: Promise<void> | null;
  retryTimeout: NodeJS.Timeout | null;
};

const globalForNotificationRealtime = globalThis as typeof globalThis & {
  __notificationRealtimeState?: NotificationRealtimeState;
};

function getState(): NotificationRealtimeState {
  if (!globalForNotificationRealtime.__notificationRealtimeState) {
    globalForNotificationRealtime.__notificationRealtimeState = {
      emitter: new EventEmitter(),
      startPromise: null,
      retryTimeout: null,
    };
  }

  return globalForNotificationRealtime.__notificationRealtimeState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEvent(payload: unknown): NotificationRealtimeEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  const action = payload.action;
  const notification = payload.notification;

  if (
    (action !== "created" && action !== "updated" && action !== "deleted") ||
    !isRecord(notification)
  ) {
    return null;
  }

  if (
    typeof notification.id !== "string" ||
    typeof notification.user_id !== "string" ||
    typeof notification.title !== "string" ||
    typeof notification.message !== "string" ||
    typeof notification.type !== "string" ||
    typeof notification.is_read !== "boolean"
  ) {
    return null;
  }

  return {
    action,
    notification: {
      id: notification.id,
      user_id: notification.user_id,
      report_id:
        typeof notification.report_id === "string" ? notification.report_id : null,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      link: typeof notification.link === "string" ? notification.link : null,
      metadata: isRecord(notification.metadata)
        ? notification.metadata
        : null,
      is_read: notification.is_read,
      created_at:
        typeof notification.created_at === "string"
          ? notification.created_at
          : new Date().toISOString(),
    },
  };
}

async function startListener() {
  const state = getState();

  if (state.startPromise) {
    return state.startPromise;
  }

  state.startPromise = (async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    const restart = () => {
      if (state.retryTimeout) {
        return;
      }

      state.retryTimeout = setTimeout(() => {
        state.retryTimeout = null;
        state.startPromise = null;
        void startListener();
      }, 2_000);
    };

    client.on("notification", (message) => {
      if (!message.payload) {
        return;
      }

      try {
        const parsed = JSON.parse(message.payload);
        const event = normalizeEvent(parsed);

        if (event) {
          state.emitter.emit("notification", event);
        }
      } catch (error) {
        console.error("Failed to parse notification realtime payload", error);
      }
    });

    client.on("error", (error) => {
      console.error("Notification realtime listener error", error);
      restart();
    });

    client.on("end", () => {
      restart();
    });

    await client.connect();
    await client.query("LISTEN notification_events");
  })().catch((error) => {
    console.error("Failed to start notification realtime listener", error);
    state.startPromise = null;
    throw error;
  });

  return state.startPromise;
}

export function subscribeToUserNotificationEvents(
  userId: string,
  callback: (event: NotificationRealtimeEvent) => void,
) {
  const state = getState();

  void startListener().catch(() => {
    // The route will remain open and retry logic will reattach later.
  });

  const handler = (event: NotificationRealtimeEvent) => {
    if (event.notification.user_id === userId) {
      callback(event);
    }
  };

  state.emitter.on("notification", handler);

  return () => {
    state.emitter.off("notification", handler);
  };
}
