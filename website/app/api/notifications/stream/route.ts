import { NextRequest } from "next/server";

import prisma from "@/src/lib/prisma";
import { verifyToken } from "@/src/lib/auth";
import {
  subscribeToUserNotificationEvents,
  type NotificationRealtimeEvent,
} from "@/src/lib/notificationRealtimeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseMessage(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function getRealtimeUser(request: NextRequest) {
  const token =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);

  if (!payload) {
    return null;
  }

  const user = await prisma.users.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      role: true,
      is_active: true,
      deleted_at: true,
    },
  });

  if (
    !user ||
    !user.is_active ||
    user.deleted_at ||
    !["ward", "municipality", "admin"].includes(user.role)
  ) {
    return null;
  }

  return user;
}

export async function GET(request: NextRequest) {
  const user = await getRealtimeUser(request);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }

        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };

      send("ready", {
        connected: true,
        userId: user.id,
      });

      unsubscribe = subscribeToUserNotificationEvents(
        user.id,
        (event: NotificationRealtimeEvent) => {
          send("notification", event);
        },
      );

      heartbeat = setInterval(() => {
        send("ping", { ts: new Date().toISOString() });
      }, 25_000);

      request.signal.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        },
        { once: true },
      );
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
