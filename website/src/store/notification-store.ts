import { create } from "zustand";

export interface Notification {
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

export interface NotificationToast {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
}

export interface NotificationRealtimeEvent {
  action: "created" | "updated" | "deleted";
  notification: Notification;
}

interface AddNotificationOptions {
  showToast?: boolean;
  playSound?: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isDropdownOpen: boolean;
  isConnected: boolean;
  toasts: NotificationToast[];

  setNotifications: (notifications: Notification[]) => void;
  addNotification: (
    notification: Notification,
    options?: AddNotificationOptions,
  ) => void;
  applyRealtimeEvent: (event: NotificationRealtimeEvent) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (notificationId: string) => void;
  toggleDropdown: () => void;
  closeDropdown: () => void;
  setConnected: (isConnected: boolean) => void;
  dismissToast: (toastId: string) => void;
  playNotificationSound: () => void;
}

function sortNotifications(notifications: Notification[]) {
  return [...notifications].sort((left, right) => {
    return (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  });
}

function getUnreadCount(notifications: Notification[]) {
  return notifications.filter((notification) => !notification.is_read).length;
}

function buildToast(notification: Notification): NotificationToast {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    link: notification.link ?? (notification.report_id ? `/reports/${notification.report_id}` : null),
  };
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isDropdownOpen: false,
  isConnected: false,
  toasts: [],

  setNotifications: (notifications) => {
    const sorted = sortNotifications(notifications);
    set({
      notifications: sorted,
      unreadCount: getUnreadCount(sorted),
    });
  },

  addNotification: (notification, options) => {
    const currentNotifications = get().notifications;
    const exists = currentNotifications.some((item) => item.id === notification.id);

    if (exists) {
      const merged = sortNotifications(
        currentNotifications.map((item) =>
          item.id === notification.id ? notification : item,
        ),
      );

      set({
        notifications: merged,
        unreadCount: getUnreadCount(merged),
      });
      return;
    }

    const nextNotifications = sortNotifications([
      notification,
      ...currentNotifications,
    ]);
    const nextState: Pick<NotificationState, "notifications" | "unreadCount" | "toasts"> = {
      notifications: nextNotifications,
      unreadCount: getUnreadCount(nextNotifications),
      toasts: get().toasts,
    };

    if (options?.showToast && !notification.is_read) {
      nextState.toasts = [buildToast(notification), ...get().toasts].slice(0, 4);
    }

    set(nextState);

    if (options?.playSound && !notification.is_read) {
      get().playNotificationSound();
    }
  },

  applyRealtimeEvent: (event) => {
    if (event.action === "deleted") {
      get().deleteNotification(event.notification.id);
      return;
    }

    get().addNotification(event.notification, {
      showToast: event.action === "created",
      playSound: event.action === "created",
    });
  },

  markAsRead: (notificationId) => {
    set((state) => {
      const notifications = state.notifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification,
      );

      return {
        notifications,
        unreadCount: getUnreadCount(notifications),
      };
    });
  },

  markAllAsRead: () => {
    set((state) => {
      const notifications = state.notifications.map((notification) => ({
        ...notification,
        is_read: true,
      }));

      return {
        notifications,
        unreadCount: 0,
      };
    });
  },

  deleteNotification: (notificationId) => {
    set((state) => {
      const notifications = state.notifications.filter(
        (notification) => notification.id !== notificationId,
      );

      return {
        notifications,
        unreadCount: getUnreadCount(notifications),
        toasts: state.toasts.filter((toast) => toast.id !== notificationId),
      };
    });
  },

  toggleDropdown: () => {
    set((state) => ({ isDropdownOpen: !state.isDropdownOpen }));
  },

  closeDropdown: () => {
    set({ isDropdownOpen: false });
  },

  setConnected: (isConnected) => {
    set({ isConnected });
  },

  dismissToast: (toastId) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    }));
  },

  playNotificationSound: () => {
    if (typeof window !== "undefined") {
      try {
        const audio = new Audio("/sounds/notification.wav");
        audio.volume = 0.5;
        audio.play().catch((error) => {
          console.warn("Failed to play notification sound:", error);
        });
      } catch (error) {
        console.warn("Error creating audio element:", error);
      }
    }
  },
}));
