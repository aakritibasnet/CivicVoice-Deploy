import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/feedback";

export type DetectedWard = {
  id: string;
  name: string;
  ward_code: string;
};

export type DetectedMunicipality = {
  id: string;
  name: string;
  code: string;
};

type WardDetectionState = {
  ward: DetectedWard | null;
  municipality: DetectedMunicipality | null;
  loading: boolean;
  detected: boolean;
  error: string | null;
};

const WARD_DETECTION_RETRY_CONFIG = {
  initialDelayMs: 4000, // Acceptable range: 2000-10000 ms; first retry after a transient API failure.
  maxDelayMs: 30000, // Acceptable range: 10000-60000 ms; caps backend retry pressure.
  backoffMultiplier: 1.6, // Acceptable range: 1-3; higher slows repeated retries.
};

function getWardRetryDelayMs(attempt: number) {
  const delay =
    WARD_DETECTION_RETRY_CONFIG.initialDelayMs *
    WARD_DETECTION_RETRY_CONFIG.backoffMultiplier ** Math.max(attempt, 0);

  return Math.min(
    WARD_DETECTION_RETRY_CONFIG.maxDelayMs,
    Math.round(delay),
  );
}

export function useWardDetection(
  coords: { latitude: number; longitude: number } | null,
): WardDetectionState {
  const latitude = coords?.latitude ?? null;
  const longitude = coords?.longitude ?? null;

  const [state, setState] = useState<WardDetectionState>({
    ward: null,
    municipality: null,
    loading: false,
    detected: false,
    error: null,
  });

  const lastCoordsRef = useRef<string | null>(null);

  useEffect(() => {
    if (latitude == null || longitude == null) {
      setState({
        ward: null,
        municipality: null,
        loading: false,
        detected: false,
        error: null,
      });
      return;
    }

    const coordKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

    if (coordKey === lastCoordsRef.current) return;
    lastCoordsRef.current = coordKey;

    let cancelled = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const currentCoords = { latitude, longitude };

    async function detect() {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { data } = await api.get("/wards/detect", {
          params: {
            lat: currentCoords.latitude,
            lng: currentCoords.longitude,
          },
        });

        if (cancelled) return;

        if (data.detected && data.ward) {
          setState({
            ward: data.ward,
            municipality: data.municipality ?? null,
            loading: false,
            detected: true,
            error: null,
          });
          return;
        }

        setState({
          ward: null,
          municipality: data.municipality ?? null,
          loading: false,
          detected: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;

        setState({
          ward: null,
          municipality: null,
          loading: false,
          detected: false,
          error: getFriendlyErrorMessage(
            err,
            "Ward detection is unavailable right now. Retrying...",
          ),
        });

        const retryDelayMs = getWardRetryDelayMs(retryAttempt);
        retryAttempt += 1;

        retryTimer = setTimeout(() => {
          void detect();
        }, retryDelayMs);
      }
    }

    void detect();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [latitude, longitude]);

  return state;
}
