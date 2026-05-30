import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import { navigateFromNotification } from "@/lib/notificationRouting";
import { debugError, debugInfo, debugWarn } from "@/lib/debug";

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

type NotificationsModule = typeof import("expo-notifications");
type NotificationSubscription = { remove: () => void };

async function registerForPushNotificationsAsync(
  Notifications: NotificationsModule,
): Promise<string | null> {
  if (!Device.isDevice) {
    debugInfo("Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    debugInfo("Push notification permission not granted");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    debugWarn("No EAS projectId found, skipping push token registration");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const notificationReceivedListener =
    useRef<NotificationSubscription | null>(null);
  const notificationResponseListener =
    useRef<NotificationSubscription | null>(null);

  useEffect(() => {
    if (isExpoGo()) {
      debugInfo(
        "Skipping expo-notifications initialization in Expo Go. Use a development build to test push notifications.",
      );
      return;
    }

    let cancelled = false;

    const invalidateNotificationQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
      void queryClient.invalidateQueries({ queryKey: ["report"] });
      void queryClient.invalidateQueries({ queryKey: ["comments"] });
      void queryClient.invalidateQueries({ queryKey: ["publicReports"] });
      void queryClient.invalidateQueries({
        queryKey: ["officerNotifications"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["officerUnreadCount"],
      });
      void queryClient.invalidateQueries({ queryKey: ["officerTasks"] });
      void queryClient.invalidateQueries({
        queryKey: ["officerTaskDetail"],
      });
    };

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;

        Notifications.setNotificationHandler({
          handleNotification: async () => {
            // Suppress OS banner when the app is foregrounded — in-app toasts
            // (ChatToast / socket chat.notify) already cover the alert.
            const inForeground = AppState.currentState === "active";
            return {
              shouldShowAlert: !inForeground,
              shouldPlaySound: !inForeground,
              shouldSetBadge: true,
              shouldShowBanner: !inForeground,
              shouldShowList: true,
            };
          },
        });

        notificationReceivedListener.current =
          Notifications.addNotificationReceivedListener(() => {
            invalidateNotificationQueries();
          });

        notificationResponseListener.current =
          Notifications.addNotificationResponseReceivedListener((response) => {
            invalidateNotificationQueries();
            const data = response.notification.request.content.data as Record<
              string,
              unknown
            >;
            navigateFromNotification({
              link: typeof data.link === "string" ? data.link : null,
              type: typeof data.type === "string" ? data.type : null,
              reportId:
                typeof data.reportId === "string" ||
                typeof data.reportId === "number"
                  ? data.reportId
                  : null,
              taskId:
                typeof data.taskId === "string" ||
                typeof data.taskId === "number"
                  ? data.taskId
                  : null,
              metadata: data,
            });
          });

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const accessToken = await getAccessToken();
        if (!accessToken || isExpoGo()) {
          return;
        }

        const pushToken =
          await registerForPushNotificationsAsync(Notifications);
        if (!pushToken) return;

        await api.post("/notifications/push-token", {
          token: pushToken,
          platform: Platform.OS,
        });
      } catch (err) {
        debugError("Failed to initialize push notifications", err);
      }
    })();

    return () => {
      cancelled = true;
      notificationReceivedListener.current?.remove();
      notificationResponseListener.current?.remove();
    };
  }, [queryClient]);
}
