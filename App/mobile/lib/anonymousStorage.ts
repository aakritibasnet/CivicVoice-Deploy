import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─── Types ───────────────────────────────────────────────────────────

export type AnonymousReportMeta = {
  reportId: number;
  title: string;
  category: string;
  createdAt: string; // ISO string
};

// ─── Storage Keys ────────────────────────────────────────────────────

const DEVICE_ID_KEY = "civic_device_id";
const ANON_REPORTS_KEY = "civic_anonymous_reports";

// ─── Device ID ───────────────────────────────────────────────────────

/**
 * Returns a persistent device identifier.
 * Uses expo-constants installationId first, falls back to a generated uuid
 * stored in AsyncStorage.
 */
export async function getDeviceId(): Promise<string> {
  // Check if we already have one cached
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  // Try expo-constants
  const expoId =
    (Constants as any).installationId ??
    Constants.sessionId ??
    null;

  const id = expoId || generateUUID();

  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/** Simple v4-like UUID generator (no crypto dependency). */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Anonymous Report Metadata CRUD ──────────────────────────────────

export async function getAnonymousReports(): Promise<AnonymousReportMeta[]> {
  const raw = await AsyncStorage.getItem(ANON_REPORTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AnonymousReportMeta[];
  } catch {
    return [];
  }
}

export async function addAnonymousReport(
  meta: AnonymousReportMeta,
): Promise<void> {
  const list = await getAnonymousReports();
  list.push(meta);
  await AsyncStorage.setItem(ANON_REPORTS_KEY, JSON.stringify(list));
}

export async function clearAnonymousReports(): Promise<void> {
  await AsyncStorage.removeItem(ANON_REPORTS_KEY);
}
