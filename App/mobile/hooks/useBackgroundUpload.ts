import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";
import { router } from "expo-router";

import {
  useReportDraft,
  submitReportFromDraft,
  cleanupPersistedMedia,
} from "@/store/reportDraft";
import { useUploadProgress } from "@/store/uploadProgress";
import { getAccessToken } from "@/lib/session";
import { debugWarn } from "@/lib/debug";

const MAX_RETRIES = 3;

/**
 * Global hook that runs at the app root level.
 * Monitors pending offline uploads and retries them when connectivity returns.
 */
export function useBackgroundUpload() {
  const retryCount = useRef(0);
  const isRetrying = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (!state.isConnected || isRetrying.current) return;

      const draft = useReportDraft.getState();
      if (!draft.pendingUpload || !draft.mediaUri || !draft.mediaType) return;

      isRetrying.current = true;
      const { setProgress, setStatus, reset } = useUploadProgress.getState();

      try {
        setStatus("retrying");

        const token = await getAccessToken();

        const result = await submitReportFromDraft({
          token,
          mediaUri: draft.mediaUri,
          mediaType: draft.mediaType,
          onProgress: (sent, total) => {
            setStatus("uploading");
            setProgress(total > 0 ? sent / total : 0);
          },
        });

        if (result?.offlineSaved) {
          // Still offline, keep pending
          setStatus("offline_queued");
        } else {
          setStatus("success");
          retryCount.current = 0;
          // Auto-dismiss success after 3s
          setTimeout(() => reset(), 3000);
        }
      } catch (e: any) {
        retryCount.current += 1;
        if (retryCount.current >= MAX_RETRIES) {
          setStatus("error", e?.message || "Upload failed after retries.");
          retryCount.current = 0;
        } else {
          setStatus("retrying");
        }
        debugWarn("Background upload retry failed", e?.message);
      } finally {
        isRetrying.current = false;
      }
    });

    // Also check on mount if there's a pending upload and we're online
    (async () => {
      const draft = useReportDraft.getState();
      if (!draft.pendingUpload || !draft.mediaUri) return;

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        useUploadProgress.getState().setStatus("offline_queued");
        return;
      }

      // Trigger upload attempt
      isRetrying.current = true;
      const { setProgress, setStatus, reset } = useUploadProgress.getState();

      try {
        setStatus("uploading");
        const token = await getAccessToken();

        await submitReportFromDraft({
          token,
          mediaUri: draft.mediaUri,
          mediaType: draft.mediaType!,
          onProgress: (sent, total) => {
            setProgress(total > 0 ? sent / total : 0);
          },
        });

        setStatus("success");
        setTimeout(() => reset(), 3000);
      } catch (e: any) {
        setStatus("error", e?.message || "Upload failed.");
      } finally {
        isRetrying.current = false;
      }
    })();

    return unsubscribe;
  }, []);
}
