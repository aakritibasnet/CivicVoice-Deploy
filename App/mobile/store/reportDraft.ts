import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths, File, Directory } from "expo-file-system";
import { createReport } from "@/api/reports";
import { getDeviceId, addAnonymousReport } from "@/lib/anonymousStorage";
import NetInfo from "@react-native-community/netinfo";

type Coords = { latitude: number; longitude: number } | null;

type AiSuggestedPriority = "low" | "medium" | "high" | "critical";

type ReportDraft = {
  title: string;
  description: string;
  category: string;
  isPublic: boolean;
  address: string;

  gpsCoords: Coords;
  gpsAccuracyM: number | null;

  pickedCoords: Coords;
  userAdjustedLocation: boolean;

  pendingUpload: boolean;
  /** Stored when queued offline so retries can include device tracking */
  pendingDeviceId: string | null;
  aiPriorityToken: string | null;
  aiPriorityTokenMediaUri: string | null;
  /** URI for which AI analysis has been started (set immediately on capture) */
  aiAnalyzedUri: string | null;
  /** Priority suggested by AI — stored so reports screen can read it after background analysis */
  aiSuggestedPriority: AiSuggestedPriority | null;

  /** Persisted media URI (copied to documentDirectory for offline reliability) */
  mediaUri: string | null;
  mediaType: "photo" | "video" | null;

  setDraft: (data: Partial<ReportDraft>) => void;
  clearDraft: () => void;
  markPendingUpload: () => void;
  clearPendingUpload: () => void;
};

const PENDING_MEDIA_DIR_NAME = "pending-report-media";

/**
 * Copy a camera temp file to a persistent app directory so it survives
 * navigation and app restarts for offline uploads.
 */
export async function persistMediaFile(
  tempUri: string,
  mediaType: "photo" | "video",
): Promise<string> {
  const dir = new Directory(Paths.document, PENDING_MEDIA_DIR_NAME);
  if (!dir.exists) {
    dir.create();
  }

  const ext = mediaType === "photo" ? "jpg" : "mp4";
  const filename = `report_${Date.now()}.${ext}`;
  const destFile = new File(dir, filename);

  const sourceFile = new File(tempUri);
  sourceFile.copy(destFile);

  return destFile.uri;
}

/** Clean up persisted media file after successful upload */
export async function cleanupPersistedMedia(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Best-effort cleanup
  }
}

export const useReportDraft = create<ReportDraft>()(
  persist(
    (set) => ({
      title: "",
      description: "",
      category: "Road Damage",
      isPublic: true,
      address: "",
      pendingUpload: false,
      pendingDeviceId: null,
      aiPriorityToken: null,
      aiPriorityTokenMediaUri: null,
      aiAnalyzedUri: null,
      aiSuggestedPriority: null,
      gpsCoords: null,
      gpsAccuracyM: null,
      pickedCoords: null,
      userAdjustedLocation: false,
      mediaUri: null,
      mediaType: null,

      setDraft: (data) =>
        set((state) => ({
          ...state,
          ...data,
        })),

      clearDraft: () =>
        set({
          title: "",
          description: "",
          category: "Road Damage",
          isPublic: true,
          address: "",
          gpsCoords: null,
          gpsAccuracyM: null,
          pickedCoords: null,
          userAdjustedLocation: false,
          pendingUpload: false,
          pendingDeviceId: null,
          aiPriorityToken: null,
          aiPriorityTokenMediaUri: null,
          aiAnalyzedUri: null,
          aiSuggestedPriority: null,
          mediaUri: null,
          mediaType: null,
        }),

      markPendingUpload: () => set({ pendingUpload: true }),
      clearPendingUpload: () => set({ pendingUpload: false }),
    }),
    {
      name: "report-draft-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * Submits the current draft as a report.
 * Accepts nullable token – when null, submits anonymously with deviceId.
 * onProgress receives (sent, total) bytes for real upload progress.
 */
export async function submitReportFromDraft(params: {
  token: string | null;
  mediaUri: string;
  mediaType: "photo" | "video";
  onProgress?: (sent: number, total: number) => void;
}) {
  const { token, mediaUri, mediaType, onProgress } = params;

  const state = useReportDraft.getState();
  state.markPendingUpload();
  const coords = state.pickedCoords || state.gpsCoords;

  // Resolve deviceId for anonymous submissions
  const deviceId = !token ? await getDeviceId() : null;

  const net = await NetInfo.fetch();
  const aiPriorityToken =
    state.aiPriorityTokenMediaUri === mediaUri ? state.aiPriorityToken : null;

  if (!net.isConnected) {
    // Persist camera file to app storage so it survives navigation/restarts
    const persistedUri = await persistMediaFile(mediaUri, mediaType);
    state.setDraft({
      pendingDeviceId: deviceId,
      mediaUri: persistedUri,
      mediaType,
      aiPriorityToken,
      aiPriorityTokenMediaUri: aiPriorityToken ? persistedUri : null,
    });
    state.markPendingUpload();
    return { offlineSaved: true };
  }

  const result = await createReport({
    token,
    mediaUri,
    mediaType,
    deviceId,
    aiPriorityToken,
    title: state.title || null,
    description: state.description || null,
    category: state.category,
    isPublic: state.isPublic,
    address: state.address || null,
    locationLat: coords?.latitude ?? null,
    locationLng: coords?.longitude ?? null,
    locationAccuracyM: state.gpsAccuracyM,
    onProgress,
  });

  // Track anonymous report locally for later claiming
  if (!token && result?.data?.report?.report_id) {
    await addAnonymousReport({
      reportId: result.data.report.report_id,
      title: state.title || "Untitled",
      category: state.category,
      createdAt: new Date().toISOString(),
    });
  }

  // Clean up any persisted media file
  await cleanupPersistedMedia(state.mediaUri);
  state.clearDraft();

  return result;
}
