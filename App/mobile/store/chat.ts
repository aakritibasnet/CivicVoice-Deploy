// Global chat UI state shared across screens: per-chat unread counts (for the
// tab badge + list badges) and an in-app toast queue fed by the `chat.notify`
// realtime event. Kept separate from the per-room message state in useChatRoom.

import { create } from "zustand";

export type ChatToast = {
  id: string;
  chatId: string;
  title: string;
  body: string;
  type: string;
};

type ChatState = {
  unreadByChat: Record<string, number>;
  toasts: ChatToast[];
  setUnread: (chatId: string, count: number) => void;
  setUnreadMap: (map: Record<string, number>) => void;
  clearUnread: (chatId: string) => void;
  totalUnread: () => number;
  pushToast: (t: Omit<ChatToast, "id">) => void;
  dismissToast: (id: string) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  unreadByChat: {},
  toasts: [],
  setUnread: (chatId, count) =>
    set((s) => ({ unreadByChat: { ...s.unreadByChat, [chatId]: count } })),
  setUnreadMap: (map) => set({ unreadByChat: map }),
  clearUnread: (chatId) =>
    set((s) => ({ unreadByChat: { ...s.unreadByChat, [chatId]: 0 } })),
  totalUnread: () =>
    Object.values(get().unreadByChat).reduce((a, b) => a + (b || 0), 0),
  pushToast: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ].slice(-3), // keep at most 3 stacked
    })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
