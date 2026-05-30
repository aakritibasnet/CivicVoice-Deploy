import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MunicipalityInfo {
  id: string;
  name: string;
  code: string;
  type: string;
  province_name: string | null;
  district: string | null;
  total_wards: number;
}

interface MunicipalityState {
  activeMunicipality: MunicipalityInfo | null;
  hasHydrated: boolean;

  setActiveMunicipality: (municipality: MunicipalityInfo | null) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useMunicipalityStore = create<MunicipalityState>()(
  persist(
    (set) => ({
      activeMunicipality: null,
      hasHydrated: false,

      setActiveMunicipality: (municipality) =>
        set({ activeMunicipality: municipality }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "civic-voice-municipality",
      partialize: (state) => ({
        activeMunicipality: state.activeMunicipality,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
