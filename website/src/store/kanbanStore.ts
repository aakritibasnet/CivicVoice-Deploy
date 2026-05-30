import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface KanbanState {
  // Local UI state (synced with server but also cached locally)
  collapsedColumns: Set<string>;
  columnOrder: string[];

  // Actions
  toggleColumnCollapse: (columnId: string) => void;
  setCollapsedColumns: (columnIds: string[]) => void;
  setColumnOrder: (columnIds: string[]) => void;
  isColumnCollapsed: (columnId: string) => boolean;
  resetState: () => void;
}

export const useKanbanStore = create<KanbanState>()(
  persist(
    (set, get) => ({
      collapsedColumns: new Set<string>(),
      columnOrder: [],

      toggleColumnCollapse: (columnId: string) => {
        set((state) => {
          const newCollapsed = new Set(state.collapsedColumns);
          if (newCollapsed.has(columnId)) {
            newCollapsed.delete(columnId);
          } else {
            newCollapsed.add(columnId);
          }
          return { collapsedColumns: newCollapsed };
        });
      },

      setCollapsedColumns: (columnIds: string[]) => {
        set({ collapsedColumns: new Set(columnIds) });
      },

      setColumnOrder: (columnIds: string[]) => {
        set({ columnOrder: columnIds });
      },

      isColumnCollapsed: (columnId: string) => {
        return get().collapsedColumns.has(columnId);
      },

      resetState: () => {
        set({ collapsedColumns: new Set(), columnOrder: [] });
      },
    }),
    {
      name: "kanban-ui-state",
      storage: createJSONStorage(() => localStorage),
      // Custom serialization to handle Set
      partialize: (state) => ({
        collapsedColumns: Array.from(state.collapsedColumns),
        columnOrder: state.columnOrder,
      }),
      // Custom deserialization to convert array back to Set
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.collapsedColumns)) {
          state.collapsedColumns = new Set(state.collapsedColumns);
        }
      },
    },
  ),
);
