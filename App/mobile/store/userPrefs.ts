import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UserPrefsState {
  aiEnabled: boolean;
  setAiEnabled: (enabled: boolean) => void;
}

export const useUserPrefs = create<UserPrefsState>()(
  persist(
    (set) => ({
      aiEnabled: true,
      setAiEnabled: (enabled) => set({ aiEnabled: enabled }),
    }),
    {
      name: "civic-voice-user-prefs",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
