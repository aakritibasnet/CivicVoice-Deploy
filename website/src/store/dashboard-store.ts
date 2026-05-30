import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DashboardState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  activePath: string;
  hasHydrated: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCollapse: () => void;
  setActivePath: (path: string) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      activePath: "/dashboard/kanban",
      hasHydrated: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      toggleCollapse: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setActivePath: (path) => set({ activePath: path }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "civic-voice-dashboard",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        activePath: state.activePath,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
