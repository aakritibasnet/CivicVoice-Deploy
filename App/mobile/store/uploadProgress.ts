import { create } from "zustand";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "retrying"
  | "offline_queued"
  | "success"
  | "error";

type UploadProgressState = {
  isUploading: boolean;
  progress: number; // 0 to 1
  status: UploadStatus;
  errorMessage: string | null;
  setProgress: (progress: number) => void;
  setStatus: (status: UploadStatus, errorMessage?: string | null) => void;
  reset: () => void;
};

export const useUploadProgress = create<UploadProgressState>((set) => ({
  isUploading: false,
  progress: 0,
  status: "idle",
  errorMessage: null,

  setProgress: (progress) =>
    set({ progress: Math.min(1, Math.max(0, progress)) }),

  setStatus: (status, errorMessage = null) =>
    set({
      status,
      errorMessage,
      isUploading: status === "uploading" || status === "retrying",
      progress: status === "success" ? 1 : status === "idle" ? 0 : undefined,
    } as any),

  reset: () =>
    set({
      isUploading: false,
      progress: 0,
      status: "idle",
      errorMessage: null,
    }),
}));
