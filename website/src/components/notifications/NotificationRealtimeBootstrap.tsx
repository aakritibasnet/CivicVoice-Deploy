"use client";

import { useNotificationRealtime } from "@/src/hooks/useNotifications";

export default function NotificationRealtimeBootstrap() {
  useNotificationRealtime();
  return null;
}
