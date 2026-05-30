// Per-device personal archive for officer conversations. Archiving here is a
// "hide from my list" preference (like email/WhatsApp archive), kept local to
// the device. It deliberately does NOT touch the chat's global `is_archived`
// flag, which is a senior-officer workflow action that affects every
// participant. Persisted so the archive survives app restarts.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ArchiveState = {
  archivedChatIds: string[];
  archiveChat: (chatId: string) => void;
  unarchiveChat: (chatId: string) => void;
};

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set) => ({
      archivedChatIds: [],
      archiveChat: (chatId) =>
        set((s) =>
          s.archivedChatIds.includes(chatId)
            ? s
            : { archivedChatIds: [...s.archivedChatIds, chatId] },
        ),
      unarchiveChat: (chatId) =>
        set((s) => ({
          archivedChatIds: s.archivedChatIds.filter((id) => id !== chatId),
        })),
    }),
    {
      name: "chat-archive-state",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
