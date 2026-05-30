import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type NotificationsState = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
};

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      unreadCount: 0,
      setUnreadCount: (count) => set({ unreadCount: count }),
    }),
    {
      name: "notifications-state",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

