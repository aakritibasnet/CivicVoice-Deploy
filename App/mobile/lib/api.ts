import axios from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
} from "./session";
import { debugError, debugLog, debugWarn } from "./debug";
import { getFriendlyErrorMessage, normalizeErrorMessage } from "./feedback";

const IP_ADDRESS = "192.168.18.123:5000";
// const IP_ADDRESS = "192.168.197.107:5000";
// const IP_ADDRESS = "192.168.18.14:5000";

const LOCAL_API_BASE_URL = `http://${IP_ADDRESS}/api`;
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const RAW_API_BASE_URL =
  ENV_API_BASE_URL?.trim() || (__DEV__ ? LOCAL_API_BASE_URL : "");

function normalizeApiBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

export const API_BASE_URL = normalizeApiBaseUrl(RAW_API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const publicEndpoints = [
  "/auth/login",
  "/auth/signup",
  "/auth/verify-email",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/wards/detect",
  "/wards/boundaries",
  "/wards/municipality-boundaries",
];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
}

function withFriendlyError<T>(error: T, fallback?: string): T {
  return normalizeErrorMessage(error, fallback);
}

api.interceptors.request.use(
  async (config) => {
    const isPublicEndpoint = publicEndpoints.some((endpoint) =>
      config.url?.includes(endpoint),
    );

    if (!isPublicEndpoint) {
      const token = await getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) =>
    Promise.reject(
      withFriendlyError(
        error,
        "We couldn't send the request. Please try again.",
      ),
    ),
);

api.interceptors.response.use(
  (response) => response,
  async (error: any) => {
    const originalRequest = error.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((queuedError) => Promise.reject(queuedError));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        await clearTokens();
        const authError = withFriendlyError(
          error,
          "Please log in and try again.",
        );
        processQueue(authError, null);
        isRefreshing = false;
        return Promise.reject(authError);
      }

      try {
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const {
          accessToken,
          refreshToken: newRefreshToken,
        }: {
          accessToken: string;
          refreshToken: string;
        } = response.data;

        await saveTokens({
          accessToken,
          refreshToken: newRefreshToken,
        });

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError: any) {
        debugWarn(
          "Token refresh failed",
          refreshError?.response?.status ?? refreshError?.message,
        );

        await clearTokens();
        const normalizedRefreshError = withFriendlyError(
          refreshError,
          "Your session expired. Please log in again.",
        );

        processQueue(normalizedRefreshError, null);
        isRefreshing = false;

        return Promise.reject(normalizedRefreshError);
      }
    }

    const fallback = error.response
      ? error.response.status >= 500
        ? "Something went wrong on our side. Please try again."
        : "Request failed. Please try again."
      : error.request
        ? "We couldn't reach the server. Check your connection and try again."
        : getFriendlyErrorMessage(error);

    const normalizedError = withFriendlyError(error, fallback);

    if (error.response?.status >= 500) {
      debugError("API server error", {
        status: error.response.status,
        url: error.config?.url,
      });
    } else if (error.request && !error.response) {
      debugLog("API network error", {
        message: normalizedError?.message,
        url: error.config?.url,
      });
    }

    return Promise.reject(normalizedError);
  },
);
