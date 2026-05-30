import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/session";

const HEARTBEAT_MS = 15000;

export function useNotificationHeartbeat() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const refetchActiveNotificationQueries = async () => {
      const token = await getAccessToken();
      if (!token) return;

      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["notifications"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["notifications-unread-count"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["officerNotifications"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["officerUnreadCount"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["report"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["comments"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["publicReports"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["officerTasks"],
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["officerTaskDetail"],
          type: "active",
        }),
      ]);
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        void refetchActiveNotificationQueries();
      }, HEARTBEAT_MS);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        void refetchActiveNotificationQueries();
        start();
      } else {
        stop();
      }
    };

    handleAppStateChange(AppState.currentState);
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      stop();
      subscription.remove();
    };
  }, [queryClient]);
}
