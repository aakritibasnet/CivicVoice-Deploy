"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@apollo/client/react";

import { useNotificationStore } from "@/src/store/notification-store";
import { useAuthStore } from "@/src/store/auth-store";
import {
  GET_NOTIFICATIONS,
  MARK_NOTIFICATION_AS_READ,
  MARK_ALL_NOTIFICATIONS_AS_READ,
  DELETE_NOTIFICATION,
} from "@/src/graphql/operations/notifications";

type NotificationQueryResult = {
  notifications?: Array<{
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
  }>;
};

type NotificationStreamEvent = {
  action: "created" | "updated" | "deleted";
  notification: {
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
  };
};

export function useNotificationRealtime() {
  const { setNotifications, applyRealtimeEvent, setConnected } =
    useNotificationStore();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const canQueryNotifications =
    hasHydrated && isAuthenticated && Boolean(token);
  const hasBootstrappedRef = useRef(false);

  const { data, loading, error } = useQuery<NotificationQueryResult>(
    GET_NOTIFICATIONS,
    {
      fetchPolicy: "cache-and-network",
      skip: !canQueryNotifications,
    },
  );

  useEffect(() => {
    if (!data?.notifications) {
      return;
    }

    setNotifications(data.notifications);
    hasBootstrappedRef.current = true;
  }, [data, setNotifications]);

  useEffect(() => {
    if (!canQueryNotifications || !token) {
      setConnected(false);
      return;
    }

    const streamUrl = new URL(
      process.env.NEXT_PUBLIC_NOTIFICATION_STREAM_URL ??
        "/api/notifications/stream",
      window.location.origin,
    );
    streamUrl.searchParams.set("token", token);

    const source = new EventSource(streamUrl.toString());

    source.addEventListener("ready", () => {
      setConnected(true);
    });

    source.addEventListener("notification", (event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as NotificationStreamEvent;
        applyRealtimeEvent(payload);
      } catch (parseError) {
        console.error("Failed to parse realtime notification event:", parseError);
      }
    });

    source.addEventListener("error", () => {
      setConnected(false);
    });

    return () => {
      setConnected(false);
      source.close();
    };
  }, [applyRealtimeEvent, canQueryNotifications, setConnected, token]);

  useEffect(() => {
    if (error) {
      console.error("Failed to load notifications:", error);
    }
  }, [error]);

  return {
    loading: loading && !hasBootstrappedRef.current,
    error,
  };
}

export function useNotificationActions() {
  const [markAsReadMutation] = useMutation(MARK_NOTIFICATION_AS_READ);
  const [markAllAsReadMutation] = useMutation(MARK_ALL_NOTIFICATIONS_AS_READ);
  const [deleteNotificationMutation] = useMutation(DELETE_NOTIFICATION);

  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await markAsReadMutation({
          variables: { id },
          optimisticResponse: {
            markNotificationAsRead: {
              __typename: "Notification",
              id,
              is_read: true,
            },
          },
        });

        useNotificationStore.getState().markAsRead(id);
      } catch (mutationError) {
        console.error("Failed to mark notification as read:", mutationError);
      }
    },
    [markAsReadMutation],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation();
      useNotificationStore.getState().markAllAsRead();
    } catch (mutationError) {
      console.error("Failed to mark all notifications as read:", mutationError);
    }
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(
    async (id: string) => {
      try {
        await deleteNotificationMutation({
          variables: { id },
        });

        useNotificationStore.getState().deleteNotification(id);
      } catch (mutationError) {
        console.error("Failed to delete notification:", mutationError);
      }
    },
    [deleteNotificationMutation],
  );

  return {
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
