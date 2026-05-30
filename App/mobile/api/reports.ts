import { API_BASE_URL, api } from "@/lib/api";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import { getAccessToken } from "@/lib/session";
import { uploadWithProgress } from "./uploadWithProgress";

export type Report = {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  priority?: AiSuggestedPriority;
  media_url?: string;
  media_type?: string;
  photo_urls?: string[];
  is_public: boolean;
  upvote_count: number;
  comment_count: number;
  location_lat?: number;
  location_lng?: number;
  address_text?: string;
  submitted_at: string;
  created_at: string;
  ward_id?: string;
  ward_name?: string;
  ward_code?: string;
  return_reasoning?: string | null;
  return_instructions?: string | null;
  escalated_to_municipality?: boolean;
  escalated_at?: string | null;
  pathway_type?: string | null;
  pathway_reason?: string | null;
  user_upvoted?: boolean;
};

type CreateReportArgs = {
  token?: string | null;
  mediaUri: string;
  mediaType: "photo" | "video";
  deviceId?: string | null;
  aiPriorityToken?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string;
  isPublic?: boolean;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAccuracyM?: number | null;
  address?: string | null;
  onProgress?: (sent: number, total: number) => void;
};

export type TimeRange = "24h" | "7d" | "30d" | "all";

export type MapBounds = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

export type PublicReportsParams = {
  bounds?: MapBounds;
  page?: number;
  limit?: number;
  category?: string;
  status?: string;
  escalated?: boolean;
  timeRange?: TimeRange;
  lat?: number;
  lng?: number;
  radius?: number;
};

const REPORTS_API_BASE_URL = String(
  API_BASE_URL || api.defaults.baseURL || "",
).replace(/\/+$/, "");

const UPLOAD_TIMEOUT_MS = 120000;

function extractApiError(err: unknown, fallback: string) {
  return getFriendlyErrorMessage(err, fallback);
}

function toPublicReportQuery(params?: PublicReportsParams) {
  if (!params) return {};

  const query: Record<string, string | number> = {};

  if (params.bounds) {
    query.neLat = params.bounds.northEast.lat;
    query.neLng = params.bounds.northEast.lng;
    query.swLat = params.bounds.southWest.lat;
    query.swLng = params.bounds.southWest.lng;
  }

  if (params.category) query.category = params.category;
  if (params.status) query.status = params.status;
  if (params.escalated) query.escalated = "true";
  if (params.timeRange) query.timeRange = params.timeRange;
  if (params.page != null) query.page = params.page;
  if (params.limit != null) query.limit = params.limit;
  if (params.lat != null) query.lat = params.lat;
  if (params.lng != null) query.lng = params.lng;
  if (params.radius != null) query.radius = params.radius;

  return query;
}

export async function createReport(args: CreateReportArgs) {
  const {
    token,
    mediaUri,
    mediaType,
    deviceId,
    aiPriorityToken,
    title,
    description,
    category,
    isPublic,
    locationLat,
    locationLng,
    locationAccuracyM,
    address,
    onProgress,
  } = args;

  const form = new FormData();
  const filename =
    mediaUri.split("/").pop() ||
    `report.${mediaType === "photo" ? "jpg" : "mp4"}`;
  const mime = mediaType === "photo" ? "image/jpeg" : "video/mp4";

  form.append("media", {
    uri: mediaUri,
    name: filename,
    type: mime,
  } as any);
  form.append("media_type", mediaType);

  if (title) form.append("title", title);
  if (description) form.append("description", description);
  if (category) form.append("category", category);

  form.append("is_public", String(isPublic ?? true));

  if (locationLat != null) form.append("location_lat", String(locationLat));
  if (locationLng != null) form.append("location_lng", String(locationLng));
  if (locationAccuracyM != null) {
    form.append("location_accuracy_m", String(locationAccuracyM));
  }
  if (address) {
    form.append("address", address);
  }

  if (aiPriorityToken) {
    form.append("ai_priority_token", aiPriorityToken);
  }

  if (!token && deviceId) {
    form.append("device_id", deviceId);
  }

  if (!REPORTS_API_BASE_URL) {
    throw new Error("Missing API base URL configuration.");
  }

  const headers: Record<string, string> = {};
  const authToken = token || (await getAccessToken());

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const { promise } = uploadWithProgress({
    url: `${REPORTS_API_BASE_URL}/reports`,
    body: form,
    headers,
    onProgress,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

  try {
    const result = await promise;
    return result.data;
  } catch (err: any) {
    const msg = String(err?.message || "");
    const maybeNetwork =
      msg.includes("Network request failed") ||
      msg.includes("Network Error") ||
      msg.includes("Failed to reach");

    if (maybeNetwork) {
      throw new Error(
        `Failed to reach report API at ${REPORTS_API_BASE_URL || "<missing>"}. Check your network connection.`,
      );
    }

    throw err;
  }
}

export type AiSuggestedPriority = "low" | "medium" | "high" | "critical";

export type ImageAnalysis = {
  category: string;
  title: string;
  description: string;
  suggested_priority: AiSuggestedPriority;
  priority_token?: string | null;
};

/**
 * Ask the backend to analyze a captured photo (Gemini Vision) and return
 * suggested report fields. Returns null when AI is unavailable (no key,
 * upstream failure, timeout) so callers can silently fall back to manual
 * entry. Only throws for truly unexpected errors.
 */
export async function analyzeReportImage(
  mediaUri: string,
): Promise<ImageAnalysis | null> {
  if (!REPORTS_API_BASE_URL) return null;

  const form = new FormData();
  const filename = mediaUri.split("/").pop() || "report.jpg";
  form.append("media", {
    uri: mediaUri,
    name: filename,
    type: "image/jpeg",
  } as any);

  const headers: Record<string, string> = {};
  const authToken = await getAccessToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${REPORTS_API_BASE_URL}/reports/analyze-image`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      // ai_unavailable (503) and any other failure → fall back to manual.
      debugWarn("analyzeReportImage unavailable", json?.error || res.status);
      return null;
    }

    return json.data as ImageAnalysis;
  } catch (err) {
    debugWarn("analyzeReportImage error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function listMyReports(): Promise<Report[]> {
  try {
    const res = await api.get("/reports/my");

    if (Array.isArray(res.data)) {
      return res.data;
    }
    if (res.data?.reports) {
      return res.data.reports;
    }
    if (res.data?.data?.reports) {
      return res.data.data.reports;
    }

    return [];
  } catch (err: any) {
    debugWarn("Failed to load my reports", err?.message ?? err);
    throw new Error(extractApiError(err, "Failed to load reports"));
  }
}

export async function getPublicReports(params?: PublicReportsParams) {
  try {
    const res = await api.get("/reports/public", {
      params: toPublicReportQuery(params),
    });
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load public reports"));
  }
}

export async function listPublicReports(params?: PublicReportsParams) {
  return getPublicReports(params);
}

export async function getReportDetail(reportId: string) {
  try {
    const res = await api.get(`/reports/${reportId}`);
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load report detail"));
  }
}

export type ToggleUpvoteResult = {
  upvoted: boolean;
  upvote_count: number;
};

export async function toggleUpvote(
  reportId: string,
): Promise<ToggleUpvoteResult> {
  try {
    const res = await api.post(`/reports/${reportId}/upvote`, {});
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to toggle upvote"));
  }
}

export async function getComments(reportId: string, page = 1, limit = 20) {
  try {
    const res = await api.get(`/reports/${reportId}/comments`, {
      params: { page, limit },
    });
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load comments"));
  }
}

export async function addComment(reportId: string, content: string) {
  try {
    const res = await api.post(`/reports/${reportId}/comments`, { content });
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to add comment"));
  }
}

export type SimilarReport = {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  media_url?: string;
  photo_urls?: string[];
  upvote_count: number;
  address_text?: string;
  ward_name?: string;
  distance_m: number;
  submitted_at: string;
  user_upvoted?: boolean;
};

export async function findSimilarReports(
  lat: number,
  lng: number,
  category: string,
  radius = 500,
): Promise<SimilarReport[]> {
  try {
    const res = await api.get("/reports/similar", {
      params: { lat, lng, category, radius },
    });
    return res.data?.data?.reports ?? [];
  } catch (err: any) {
    debugWarn("Failed to find similar reports", err?.message ?? err);
    return [];
  }
}

export async function toggleBookmark(reportId: string) {
  try {
    const res = await api.post(`/reports/${reportId}/bookmark`, {});
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to toggle bookmark"));
  }
}

export type ChangelogEvent = {
  id: string;
  event_type: "submitted" | "status_change" | "proof_uploaded" | "comment_added" | "escalated" | "returned_to_ward";
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  timestamp: string;
};

export async function getReportChangelog(reportId: string): Promise<ChangelogEvent[]> {
  try {
    const res = await api.get(`/reports/${reportId}/changelog`);
    return res.data?.data?.changelog ?? [];
  } catch (err: any) {
    debugWarn("Failed to load changelog", err?.message ?? err);
    return [];
  }
}

export async function claimAnonymousReports(
  deviceId: string,
  reportIds: string[],
) {
  try {
    const res = await api.post("/reports/claim", { deviceId, reportIds });
    return res.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to claim reports"));
  }
}
