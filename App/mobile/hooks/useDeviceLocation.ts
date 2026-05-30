import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

const DEVICE_LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.High,
};

const DEVICE_LOCATION_RETRY_CONFIG = {
  initialDelayMs: 4000, // Acceptable range: 2000-10000 ms; first transient GPS retry delay.
  maxDelayMs: 30000, // Acceptable range: 10000-60000 ms; caps retry pressure on the device.
  backoffMultiplier: 1.6, // Acceptable range: 1-3; higher means slower repeated retries.
};

function getRetryDelayMs(attempt: number) {
  const delay =
    DEVICE_LOCATION_RETRY_CONFIG.initialDelayMs *
    DEVICE_LOCATION_RETRY_CONFIG.backoffMultiplier ** Math.max(attempt, 0);

  return Math.min(
    DEVICE_LOCATION_RETRY_CONFIG.maxDelayMs,
    Math.round(delay),
  );
}

function getTransientLocationErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : String(error || "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("disabled")) {
    return "Location services are unavailable. Retrying...";
  }

  if (normalized.includes("timeout")) {
    return "Location timed out. Retrying...";
  }

  return "Unable to get location. Retrying...";
}

export function useDeviceLocation(autoRequest = true) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<DeviceLocation | null>(null);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const autoRetryEnabledRef = useRef(autoRequest);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;

    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const runLocationRequest = useCallback(
    async function runLocationRequest(options?: {
      allowRetry?: boolean;
      resetRetry?: boolean;
    }) {
      if (requestInFlightRef.current) return null;

      clearRetryTimer();

      if (options?.resetRetry) {
        retryAttemptRef.current = 0;
      }

      requestInFlightRef.current = true;

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const currentPermission =
          await Location.getForegroundPermissionsAsync();
        const perm =
          currentPermission.status === "granted"
            ? currentPermission
            : await Location.requestForegroundPermissionsAsync();

        if (perm.status !== "granted") {
          retryAttemptRef.current = 0;

          if (mountedRef.current) {
            setError("Location permission denied");
          }

          return null;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          throw new Error("Location services disabled");
        }

        const pos = await Location.getCurrentPositionAsync(
          DEVICE_LOCATION_OPTIONS,
        );

        const { latitude, longitude, accuracy } = pos.coords;

        const loc: DeviceLocation = {
          latitude,
          longitude,
          accuracyM: accuracy ?? null,
        };

        retryAttemptRef.current = 0;

        if (mountedRef.current) {
          setLocation(loc);
          setError(null);
        }

        return loc;
      } catch (requestError) {
        const shouldRetry =
          Boolean(options?.allowRetry) &&
          autoRetryEnabledRef.current &&
          mountedRef.current;

        if (mountedRef.current) {
          setError(getTransientLocationErrorMessage(requestError));
        }

        if (shouldRetry) {
          const retryDelayMs = getRetryDelayMs(retryAttemptRef.current);
          retryAttemptRef.current += 1;

          retryTimerRef.current = setTimeout(() => {
            void runLocationRequest({ allowRetry: true });
          }, retryDelayMs);
        }

        return null;
      } finally {
        requestInFlightRef.current = false;

        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [clearRetryTimer],
  );

  const request = useCallback(async () => {
    retryAttemptRef.current = 0;
    return runLocationRequest({
      allowRetry: autoRetryEnabledRef.current,
      resetRetry: true,
    });
  }, [runLocationRequest]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  useEffect(() => {
    autoRetryEnabledRef.current = autoRequest;

    if (!autoRequest) {
      clearRetryTimer();
      return;
    }

    void runLocationRequest({ allowRetry: true, resetRetry: true });

    return clearRetryTimer;
  }, [autoRequest, clearRetryTimer, runLocationRequest]);

  return { location, loading, error, request };
}
